// Merge Studio ohne Bibliothek: reine Parser und Helfer für Worktrees, numstat, merge-tree, Teil-Patches, KI-Review und Testausgaben.
import { AI_DIFF_MAX } from './git'
import { t } from './i18n'

/** Eine geänderte Datei einer Session – immer gegen die Base (Abzweigpunkt vom Ziel) */
export interface MergeFile {
  path: string
  add: number
  del: number
  binary: boolean
  /** A = neu, M = geändert, D = gelöscht, R = umbenannt */
  status: string
  /** steckt (auch) in noch nicht committeten Änderungen */
  dirty: boolean
}

/** Eine parallele Arbeitsumgebung = ein Git-Worktree */
export interface MergeSession {
  /** absoluter Pfad des Worktrees */
  path: string
  /** null = losgelöster HEAD */
  branch: string | null
  head: string
  /** der Haupt-Worktree, in den gemergt wird */
  main: boolean
  /** Abzweigpunkt vom Ziel-Branch */
  base: string | null
  /** Commits, die das Ziel noch nicht hat / die der Session fehlen */
  ahead: number
  behind: number
  files: MergeFile[]
  add: number
  del: number
  /** Anzahl Dateien mit uncommitteten Änderungen */
  dirty: number
  /** letzte Änderung (Commit oder Datei), ms */
  changedAt: number
  /** echte Konflikte beim Mergen ins Ziel (nur committete Änderungen, per merge-tree) */
  conflicts: string[]
  /** echte Konflikte mit anderen Sessions (gleiche Stellen geändert) */
  clashes: { with: string; files: string[] }[]
  locked: boolean
}

export interface MergeOverview {
  root: string
  /** Branch im Haupt-Worktree = Ziel aller Merges */
  target: string
  targetHead: string
  sessions: MergeSession[]
  /** git merge-tree --write-tree verfügbar (ab 2.38) */
  conflictCheck: boolean
  /** im Haupt-Worktree läuft gerade ein Merge */
  merging: boolean
  /** Dateien mit offenen Konflikten im Haupt-Worktree */
  unmerged: string[]
  /** projektbezogener Testbefehl (Einstellung oder package.json) */
  testCmd: string | null
}

export interface MergeFileView {
  /** Diff Base → Session-Stand */
  diff: string
  /** Inhalt im Ziel (Arbeitsstand des Haupt-Worktrees), null = gibt es dort nicht */
  target: string | null
}

export interface ApplyResult {
  applied: string[]
  conflicts: string[]
  checkpoint: string
}

export interface MergeResult {
  ok: boolean
  conflicts: string[]
  checkpoint: string
  message: string
}

export interface Checkpoint {
  ref: string
  sha: string
  /** Commit, auf dem der Arbeitsstand lag */
  parent: string
  time: number
  label: string
}

export interface TestRun {
  ok: boolean
  code: number
  passed: number | null
  failed: number | null
  ms: number
  cancelled: boolean
}

export interface ReviewResult {
  summary: string
  risks: string[]
  steps: string[]
}

/** Windows-Pfade vergleichen: Groß/klein, / und \ und Schluss-Trenner egal */
const normPath = (p: string): string => p.replace(/[\\/]+/g, '/').replace(/\/$/, '').toLowerCase()
export const samePath = (a: string, b: string): boolean => normPath(a) === normPath(b)

// ---------- Parser ----------

export interface WorktreeEntry {
  path: string
  head: string
  branch: string | null
  bare: boolean
  locked: boolean
  prunable: boolean
}

/** git worktree list --porcelain (Pfade unter Windows mit / – wird vereinheitlicht) */
export function parseWorktrees(out: string): WorktreeEntry[] {
  const list: WorktreeEntry[] = []
  let cur: WorktreeEntry | null = null
  for (const raw of out.split(/\r?\n/)) {
    const line = raw.trimEnd()
    if (line.startsWith('worktree ')) {
      cur = { path: line.slice(9), head: '', branch: null, bare: false, locked: false, prunable: false }
      list.push(cur)
    } else if (!cur) continue
    else if (line.startsWith('HEAD ')) cur.head = line.slice(5)
    else if (line.startsWith('branch ')) cur.branch = line.slice(7).replace(/^refs\/heads\//, '')
    else if (line === 'bare') cur.bare = true
    else if (line === 'locked' || line.startsWith('locked ')) cur.locked = true
    else if (line === 'prunable' || line.startsWith('prunable ')) cur.prunable = true
  }
  return list
}

/** git diff --numstat -z: „add\tdel\tpfad\0“, bei Umbenennung „add\tdel\t\0alt\0neu\0“ */
export function parseNumstat(out: string): { path: string; add: number; del: number; binary: boolean }[] {
  const parts = out.split('\0')
  const res: { path: string; add: number; del: number; binary: boolean }[] = []
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].replace(/^\n/, '')
    if (!p) continue
    const m = /^(-|\d+)\t(-|\d+)\t(.*)$/s.exec(p)
    if (!m) continue
    let file = m[3]
    if (!file) {
      // Umbenennung: alter und neuer Pfad folgen als eigene Teile
      i += 2
      file = parts[i] ?? ''
    }
    const binary = m[1] === '-'
    res.push({ path: file, add: binary ? 0 : Number(m[1]), del: binary ? 0 : Number(m[2]), binary })
  }
  return res
}

/** git diff --name-status -z: „M\0pfad\0“, „R100\0alt\0neu\0“ */
export function parseNameStatus(out: string): Map<string, string> {
  const parts = out.split('\0')
  const map = new Map<string, string>()
  for (let i = 0; i < parts.length; i++) {
    const s = parts[i].replace(/^\n/, '')
    if (!s) continue
    const letter = s[0]
    if (letter === 'R' || letter === 'C') {
      i += 2
      map.set(parts[i] ?? '', letter)
    } else map.set(parts[++i] ?? '', letter)
  }
  return map
}

/** git merge-tree --write-tree --name-only --no-messages: erste Zeile Tree, dann konfliktbehaftete Pfade */
export function parseMergeTree(out: string): string[] {
  const lines = out.split(/\r?\n/)
  const res: string[] = []
  for (const l of lines.slice(1)) {
    if (!l.trim()) break
    res.push(l.trim())
  }
  return [...new Set(res)]
}

/** Dateien, die mehr als eine Session verändert – Pfad → Session-Pfade */
export function overlaps(sessions: Pick<MergeSession, 'path' | 'files'>[]): Map<string, string[]> {
  const by = new Map<string, string[]>()
  for (const s of sessions) for (const f of s.files) by.set(f.path, [...(by.get(f.path) ?? []), s.path])
  for (const [k, v] of by) if (v.length < 2) by.delete(k)
  return by
}

/** Zustand einer Session-Karte */
export type SessionState = 'conflict' | 'review' | 'ready' | 'empty'
export function sessionState(s: MergeSession, shared: Map<string, string[]>): SessionState {
  if (s.conflicts.length || s.clashes.length) return 'conflict'
  if (!s.files.length && !s.ahead) return 'empty'
  if (s.dirty || s.files.some((f) => shared.has(f.path))) return 'review'
  return 'ready'
}

/** Name → Branch-Teil: klein, ohne Sonderzeichen, nie leer */
export function slugBranch(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 40)
    .replace(/[-.]+$/, '')
  return s || 'session'
}

// ---------- Teil-Patches ----------

export interface Hunk {
  /** Kopfzeile „@@ -a,b +c,d @@ …“ */
  head: string
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
}

/** Einen Ein-Datei-Diff in Kopf (diff --git, index, ---/+++) und Hunks zerlegen */
export function splitHunks(diff: string): { header: string[]; hunks: Hunk[] } {
  const header: string[] = []
  const hunks: Hunk[] = []
  let cur: Hunk | null = null
  const lines = diff.replace(/\r\n/g, '\n').split('\n')
  if (lines.at(-1) === '') lines.pop()
  for (const line of lines) {
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line)
    if (m) {
      cur = { head: line, oldStart: Number(m[1]), oldLines: m[2] === undefined ? 1 : Number(m[2]), newStart: Number(m[3]), newLines: m[4] === undefined ? 1 : Number(m[4]), lines: [] }
      hunks.push(cur)
    } else if (cur) cur.lines.push(line)
    else header.push(line)
  }
  return { header, hunks }
}

/**
 * Patch nur mit den gewählten Hunks bauen. Die neuen Zeilennummern werden nachgerechnet,
 * weil ausgelassene Hunks den Versatz für die folgenden verändern.
 */
export function buildPatch(diff: string, keep: number[]): string {
  const { header, hunks } = splitHunks(diff)
  const chosen = new Set(keep)
  const out = [...header]
  let shift = 0
  hunks.forEach((h, i) => {
    if (!chosen.has(i)) return
    // reine Einfügung: „-5,0 +6,n“; reine Löschung: „-5,2 +4,0“
    const newStart = h.oldStart + shift + (h.oldLines === 0 ? 1 : 0) - (h.newLines === 0 ? 1 : 0)
    const rest = /^@@ [^@]+@@(.*)$/.exec(h.head)?.[1] ?? ''
    out.push(`@@ -${h.oldStart},${h.oldLines} +${newStart},${h.newLines} @@${rest}`, ...h.lines)
    shift += h.newLines - h.oldLines
  })
  return out.join('\n') + '\n'
}

// ---------- KI-Review ----------

export interface ReviewInput {
  target: string
  sessions: { name: string; files: MergeFile[]; diff: string; conflicts: string[] }[]
  shared: string[]
}

export function reviewPrompt(inp: ReviewInput): string {
  const per = Math.floor(AI_DIFF_MAX / Math.max(1, inp.sessions.length))
  return [
    t('Du prüfst parallele Änderungen mehrerer Claude-Code-Sessions, bevor sie in den Branch „{target}“ gemergt werden.', { target: inp.target }),
    t('Antworte NUR mit JSON in genau dieser Form, ohne Codeblock:'),
    '{"summary": "…", "risks": ["…"], "steps": ["…"]}',
    t('- summary: 2–4 Sätze, was jede Session geändert hat und ob die Änderungen zusammenpassen.'),
    t('- risks: konkrete mögliche Probleme (Konflikte, widersprüchliche Logik, fehlende Tests), höchstens 5.'),
    t('- steps: empfohlene Merge-Reihenfolge und nächste Schritte, höchstens 5, kurz und umsetzbar.'),
    t('Schreibe auf Deutsch.'),
    '',
    t('## Von mehreren Sessions geänderte Dateien'),
    inp.shared.length ? inp.shared.map((p) => '- ' + p).join('\n') : t('(keine)'),
    ...inp.sessions.flatMap((s) => [
      '',
      `## Session: ${s.name}`,
      s.files.map((f) => `- ${f.status} ${f.path} (+${f.add} −${f.del})`).join('\n') || t('(keine Änderungen)'),
      s.conflicts.length ? t('Konflikte mit dem Ziel: {files}', { files: s.conflicts.join(', ') }) : '',
      '```diff',
      s.diff.length > per ? s.diff.slice(0, per) + '\n… ' + t('(gekürzt)') : s.diff,
      '```'
    ])
  ].join('\n')
}

const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()).slice(0, 8) : [])

/** Antwort von Claude lesen: JSON (auch mit Codeblock drumherum), sonst Freitext als Zusammenfassung */
export function parseReview(raw: string): ReviewResult {
  const text = raw.trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const j = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
      if (typeof j.summary === 'string') return { summary: j.summary.trim(), risks: strList(j.risks), steps: strList(j.steps) }
    } catch {
      // kein gültiges JSON – unten als Text
    }
  }
  return { summary: text.replace(/^```[a-z]*\n?|```$/g, '').trim(), risks: [], steps: [] }
}

// ---------- Tests ----------

/** Zahlen aus gängigen Test-Ausgaben (vitest, jest, mocha, pytest) – null, wenn nichts erkennbar */
export function parseTestSummary(log: string): { passed: number | null; failed: number | null } {
  // eslint-disable-next-line no-control-regex
  const s = log.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
  let passed: number | null = null
  let failed: number | null = null
  const last = (re: RegExp): number | null => {
    const all = [...s.matchAll(re)]
    return all.length ? Number(all[all.length - 1][1]) : null
  }
  // vitest: „Tests  2 failed | 10 passed (12)“; jest: „Tests:       1 failed, 9 passed, 10 total“
  const line = [...s.matchAll(/^\s*Tests:?\s+(.+)$/gm)].pop()?.[1]
  if (line) {
    passed = /(\d+) passed/.exec(line) ? Number(/(\d+) passed/.exec(line)![1]) : null
    failed = /(\d+) failed/.exec(line) ? Number(/(\d+) failed/.exec(line)![1]) : 0
    if (passed === null && failed === 0) failed = null
  }
  if (passed === null) passed = last(/(\d+) passing/g) ?? last(/(\d+) passed/g)
  if (failed === null) failed = last(/(\d+) failing/g) ?? last(/(\d+) failed/g)
  if (passed !== null && failed === null) failed = 0
  return { passed, failed }
}
