// VibeDesk-Gehirn: Projektwissen als Markdown-Notizen mit [[Links]] (Obsidian-kompatibel)
// plus lokal mitgeschriebene Aktivität (welche Dateien Claude liest und ändert).
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

export const NOTE_TYPES = ['module', 'decision', 'pitfall', 'convention', 'task', 'fact'] as const
export type NoteType = (typeof NOTE_TYPES)[number]

export const NOTE_TYPE_LABEL: Record<NoteType, string> = {
  module: 'Bereich',
  decision: 'Entscheidung',
  pitfall: 'Stolperfalle',
  convention: 'Konvention',
  task: 'Aufgabe',
  fact: 'Wissen'
}

export const BRAIN_DIR = '.vibedesk/brain'

export const LIMITS = {
  titleLen: 80,
  bodyLen: 20_000,
  notes: 500,
  filesPerNote: 30,
  tagsPerNote: 12,
  /** Überblick, der beim Session-Start in Claudes Kontext geht */
  overviewChars: 3500
}

export interface BrainNote {
  title: string
  type: NoteType
  body: string
  tags: string[]
  /** Projektdateien, auf die sich die Notiz bezieht (relativ, mit /) */
  files: string[]
  created: number
  updated: number
}

export interface NoteMeta extends BrainNote {
  /** ausgehende [[Links]] (Titel, wie geschrieben) */
  links: string[]
}

export interface FileActivity {
  reads: number
  edits: number
  last: number
  lastEdit: number
}

export interface SessionActivity {
  id: string
  start: number
  end: number
  prompt: string
  edited: string[]
  read: string[]
}

export interface Activity {
  files: Record<string, FileActivity>
  /** „a|b“ → wie oft a und b in derselben Session geändert wurden (a < b) */
  coEdits: Record<string, number>
  sessions: SessionActivity[]
}

export const emptyActivity = (): Activity => ({ files: {}, coEdits: {}, sessions: [] })

// ---------- Titel & Dateinamen ----------

/** Titel = Dateiname (wie in Obsidian): ohne verbotene Zeichen, ohne Punkte am Rand */
export function cleanTitle(raw: string): string {
  return String(raw)
    .replace(/[\\/:*?"<>|#^[\]\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .slice(0, LIMITS.titleLen)
    .trim()
}

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i
export function noteFileName(title: string): string | null {
  const t = cleanTitle(title)
  if (!t || RESERVED.test(t)) return null
  return t + '.md'
}

export const titleKey = (t: string): string => cleanTitle(t).toLowerCase()

/** Projektpfad normalisieren: relativ, Schrägstriche, ohne ./ */
export function relPath(file: string, root: string): string | null {
  const norm = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '')
  const f = norm(file)
  const r = norm(root)
  let rel: string
  if (/^[a-zA-Z]:\//.test(f) || f.startsWith('/')) {
    if (f.toLowerCase() !== r.toLowerCase() && !f.toLowerCase().startsWith(r.toLowerCase() + '/')) return null
    rel = f.slice(r.length + 1)
  } else rel = f.replace(/^\.\//, '')
  if (!rel || rel.split('/').some((s) => s === '..')) return null
  return rel
}

// ---------- Markdown ----------

const LINK_RE = /\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|[^\]\n]*)?\]\]/g

export function extractLinks(body: string): string[] {
  const out = new Map<string, string>()
  for (const m of body.matchAll(LINK_RE)) {
    const t = cleanTitle(m[1])
    if (t && !out.has(t.toLowerCase())) out.set(t.toLowerCase(), t)
  }
  return [...out.values()]
}

const strList = (v: unknown, max: number): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean))].slice(0, max) : []

const time = (v: unknown, fallback: number): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' || v instanceof Date) {
    const t = new Date(v).getTime()
    if (Number.isFinite(t)) return t
  }
  return fallback
}

export function parseNote(title: string, text: string, mtime = 0): NoteMeta {
  let fm: Record<string, unknown> = {}
  let body = text.replace(/^﻿/, '')
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(body)
  if (m) {
    try {
      const y = parseYaml(m[1])
      if (y && typeof y === 'object' && !Array.isArray(y)) fm = y as Record<string, unknown>
    } catch {
      // kaputtes Frontmatter: Notiz trotzdem zeigen
    }
    body = body.slice(m[0].length)
  }
  const type = NOTE_TYPES.includes(fm.type as NoteType) ? (fm.type as NoteType) : 'fact'
  body = body.replace(/^\s*\n/, '').trimEnd()
  const updated = time(fm.updated, mtime)
  return {
    title: cleanTitle(title),
    type,
    body,
    tags: strList(fm.tags, LIMITS.tagsPerNote),
    files: strList(fm.files, LIMITS.filesPerNote).map((f) => f.replace(/\\/g, '/')),
    created: time(fm.created, updated),
    updated,
    links: extractLinks(body)
  }
}

const iso = (t: number): string => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z')

export function serializeNote(n: BrainNote): string {
  const fm: Record<string, unknown> = { type: n.type }
  if (n.tags.length) fm.tags = n.tags
  if (n.files.length) fm.files = n.files
  fm.created = iso(n.created)
  fm.updated = iso(n.updated)
  return `---\n${stringifyYaml(fm).trimEnd()}\n---\n\n${n.body.trim()}\n`
}

// ---------- Ableitungen ----------

/** Eine Notiz ist „zu prüfen“, wenn eine ihrer Dateien danach geändert wurde. */
export function isStale(n: BrainNote, act: Activity): boolean {
  return n.files.some((f) => (act.files[f]?.lastEdit ?? 0) > n.updated + 1000)
}

export function backlinks(notes: NoteMeta[], title: string): string[] {
  const k = titleKey(title)
  return notes.filter((n) => n.links.some((l) => titleKey(l) === k)).map((n) => n.title)
}

export interface SearchHit {
  title: string
  type: NoteType
  snippet: string
  score: number
}

export function searchNotes(notes: NoteMeta[], query: string, max = 10): SearchHit[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1)
  if (!words.length) return []
  const hits: SearchHit[] = []
  for (const n of notes) {
    const title = n.title.toLowerCase()
    const body = n.body.toLowerCase()
    const meta = [...n.tags, ...n.files].join(' ').toLowerCase()
    let score = 0
    for (const w of words) {
      if (title.includes(w)) score += 5
      if (meta.includes(w)) score += 3
      const c = body.split(w).length - 1
      score += Math.min(c, 5)
    }
    if (!score) continue
    const i = body.indexOf(words.find((w) => body.includes(w)) ?? '\0')
    const from = Math.max(0, i - 60)
    const snippet = (i < 0 ? n.body.slice(0, 140) : (from ? '…' : '') + n.body.slice(from, from + 160)).replace(/\s+/g, ' ').trim()
    hits.push({ title: n.title, type: n.type, snippet, score })
  }
  return hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, max)
}

/** Dateien, die oft zusammen mit `file` geändert werden */
export function coEditedWith(act: Activity, file: string, max = 6): { file: string; count: number }[] {
  const out: { file: string; count: number }[] = []
  for (const [k, count] of Object.entries(act.coEdits)) {
    const [a, b] = k.split('|')
    if (a === file) out.push({ file: b, count })
    else if (b === file) out.push({ file: a, count })
  }
  return out.sort((x, y) => y.count - x.count).slice(0, max)
}

const firstLine = (s: string, n = 110): string => {
  const l = s.split('\n').find((x) => x.trim() && !x.startsWith('#'))?.trim() ?? ''
  return l.length > n ? l.slice(0, n - 1) + '…' : l
}

const TYPE_ORDER: NoteType[] = ['pitfall', 'convention', 'decision', 'module', 'task', 'fact']

/** Kompakter Überblick für Claude – beim Session-Start und per brain_overview. */
export function overview(projectName: string, notes: NoteMeta[], act: Activity, max = LIMITS.overviewChars): string {
  const lines: string[] = []
  if (!notes.length) {
    lines.push(
      `# VibeDesk-Gehirn für „${projectName}“`,
      'Das Gehirn ist noch leer. Wenn du dir einen Bereich des Projekts erschließt, halte das Wichtigste mit brain_write fest – so musst du (und jede künftige Session) es nicht erneut erkunden.'
    )
  } else {
    lines.push(`# VibeDesk-Gehirn für „${projectName}“ (${notes.length} Notizen)`)
    const stale = notes.filter((n) => isStale(n, act))
    if (stale.length) lines.push('', '## Zu prüfen (Dateien haben sich seitdem geändert)', ...stale.slice(0, 8).map((n) => `- [[${n.title}]]`))
    for (const t of TYPE_ORDER) {
      const of = notes.filter((n) => n.type === t).sort((a, b) => b.updated - a.updated)
      if (!of.length) continue
      lines.push('', `## ${NOTE_TYPE_LABEL[t]}`)
      for (const n of of.slice(0, t === 'pitfall' || t === 'convention' ? 12 : 8)) {
        const d = firstLine(n.body)
        lines.push(`- [[${n.title}]]${d ? ' – ' + d : ''}`)
      }
      if (of.length > 8) lines.push(`- … und ${of.length - 8} weitere (brain_search)`)
    }
  }
  const hot = Object.entries(act.files)
    .filter(([, f]) => f.edits)
    .sort((a, b) => b[1].lastEdit - a[1].lastEdit)
    .slice(0, 8)
    .map(([f]) => f)
  if (hot.length) lines.push('', '## Zuletzt geändert', hot.join(', '))
  lines.push(
    '',
    '## So nutzt du das Gehirn',
    '- Bevor du einen Bereich erkundest: brain_search oder brain_related(Datei) – vielleicht weißt du es schon.',
    '- Wenn du etwas Wichtiges lernst oder entscheidest: brain_write (kurz, sachlich, mit [[Links]] zu verwandten Notizen und den betroffenen Dateien).',
    '- Typen: module (Überblick über einen Bereich), decision (warum so), pitfall (Falle, die Zeit gekostet hat), convention (Regel im Projekt), task, fact.',
    '- „Zu prüfen“-Notizen nach dem Lesen der Dateien aktualisieren oder mit brain_forget löschen.'
  )
  let out = lines.join('\n')
  if (out.length > max) out = out.slice(0, max - 2).replace(/\n[^\n]*$/, '') + '\n…'
  return out
}

// ---------- Graph ----------

export type GraphNodeKind = NoteType | 'file' | 'missing'

export interface GraphNode {
  id: string
  label: string
  kind: GraphNodeKind
  /** Gewicht für die Größe */
  weight: number
  stale?: boolean
  updated?: number
}

export interface GraphEdge {
  source: string
  target: string
  kind: 'link' | 'file' | 'co'
  weight: number
}

export interface BrainGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export const noteId = (title: string): string => 'n:' + titleKey(title)
export const fileId = (file: string): string => 'f:' + file

/** Notizen, ihre Links (auch auf noch nicht angelegte Notizen) und die beteiligten Dateien. */
export function buildGraph(notes: NoteMeta[], act: Activity, opts: { hotFiles?: number } = {}): BrainGraph {
  const nodes = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  const degree = new Map<string, number>()
  const bump = (id: string): void => void degree.set(id, (degree.get(id) ?? 0) + 1)
  for (const n of notes) nodes.set(noteId(n.title), { id: noteId(n.title), label: n.title, kind: n.type, weight: 1, stale: isStale(n, act), updated: n.updated })
  const addFile = (f: string): string => {
    const id = fileId(f)
    if (!nodes.has(id)) nodes.set(id, { id, label: f, kind: 'file', weight: 1 })
    return id
  }
  for (const n of notes) {
    const from = noteId(n.title)
    for (const l of n.links) {
      const to = noteId(l)
      if (to === from) continue
      if (!nodes.has(to)) nodes.set(to, { id: to, label: cleanTitle(l), kind: 'missing', weight: 1 })
      edges.push({ source: from, target: to, kind: 'link', weight: 1 })
      bump(from)
      bump(to)
    }
    for (const f of n.files) {
      const to = addFile(f)
      edges.push({ source: from, target: to, kind: 'file', weight: 1 })
      bump(from)
      bump(to)
    }
  }
  // die aktivsten Dateien auch ohne Notiz zeigen – dort fehlt vermutlich Wissen
  const hot = Object.entries(act.files)
    .sort((a, b) => b[1].edits * 3 + b[1].reads - (a[1].edits * 3 + a[1].reads))
    .slice(0, opts.hotFiles ?? 25)
  for (const [f] of hot) addFile(f)
  for (const [k, count] of Object.entries(act.coEdits)) {
    if (count < 2) continue
    const [a, b] = k.split('|')
    if (!nodes.has(fileId(a)) || !nodes.has(fileId(b))) continue
    edges.push({ source: fileId(a), target: fileId(b), kind: 'co', weight: count })
  }
  for (const node of nodes.values()) {
    if (node.kind === 'file') {
      const a = act.files[node.label]
      node.weight = 1 + Math.log2(1 + (a ? a.edits * 2 + a.reads : 0))
    } else node.weight = 1 + Math.sqrt(degree.get(node.id) ?? 0)
  }
  return { nodes: [...nodes.values()], edges }
}

// ---------- Austausch mit dem Fenster ----------

export interface BrainView {
  projectId: string
  dir: string
  graph: BrainGraph
  notes: number
  stale: number
  sessions: SessionActivity[]
}

export interface NoteDetail extends NoteMeta {
  stale: boolean
  backlinks: string[]
  path: string
}

/** Knoten kurz aufleuchten lassen: Claude liest/ändert eine Datei oder Notiz */
export interface BrainPulse {
  projectId: string
  id: string
  kind: 'read' | 'edit' | 'write'
  /** bei 'write': Titel der geschriebenen Notiz */
  title?: string
}

// ---------- Aktivität ----------

const SESSIONS_MAX = 60
const FILES_MAX = 2000

export type TouchKind = 'read' | 'edit'

export function recordTouch(act: Activity, session: { id: string; prompt?: string }, file: string, kind: TouchKind, now: number): void {
  const f = (act.files[file] ??= { reads: 0, edits: 0, last: 0, lastEdit: 0 })
  f.last = now
  if (kind === 'edit') {
    f.edits++
    f.lastEdit = now
  } else f.reads++
  let s = act.sessions.find((x) => x.id === session.id)
  if (!s) {
    s = { id: session.id, start: now, end: now, prompt: session.prompt ?? '', edited: [], read: [] }
    act.sessions.push(s)
    if (act.sessions.length > SESSIONS_MAX) act.sessions.splice(0, act.sessions.length - SESSIONS_MAX)
  }
  s.end = now
  const list = kind === 'edit' ? s.edited : s.read
  if (list.includes(file)) return
  if (kind === 'edit') {
    for (const other of s.edited) {
      const k = other < file ? `${other}|${file}` : `${file}|${other}`
      act.coEdits[k] = (act.coEdits[k] ?? 0) + 1
    }
  }
  if (list.length < 200) list.push(file)
  pruneFiles(act)
}

function pruneFiles(act: Activity): void {
  const keys = Object.keys(act.files)
  if (keys.length <= FILES_MAX) return
  const drop = new Set(keys.sort((a, b) => act.files[a].last - act.files[b].last).slice(0, keys.length - FILES_MAX))
  for (const k of drop) delete act.files[k]
  for (const k of Object.keys(act.coEdits)) {
    const [a, b] = k.split('|')
    if (drop.has(a) || drop.has(b)) delete act.coEdits[k]
  }
}

export function normalizeActivity(raw: unknown): Activity {
  const a = emptyActivity()
  if (!raw || typeof raw !== 'object') return a
  const r = raw as Partial<Activity>
  if (r.files && typeof r.files === 'object') a.files = r.files
  if (r.coEdits && typeof r.coEdits === 'object') a.coEdits = r.coEdits
  if (Array.isArray(r.sessions)) a.sessions = r.sessions
  return a
}
