// Git ohne Bibliothek: reine Parser für die Ausgaben von git status/log/diff.
import { t } from './i18n'

export interface GitFile {
  path: string
  /** bei Umbenennung: alter Pfad */
  orig?: string
  /** Status im Index (vorgemerkt), '.' = unverändert */
  index: string
  /** Status im Arbeitsverzeichnis, '.' = unverändert */
  work: string
  untracked: boolean
  conflict: boolean
}

export interface GitStatus {
  repo: true
  branch: string
  /** kein Commit bisher */
  unborn: boolean
  upstream: string | null
  ahead: number
  behind: number
  files: GitFile[]
  remoteUrl: string | null
  /** https-Link zum Repo (GitHub, GitLab …), falls ableitbar */
  webUrl: string | null
}

export type GitState = GitStatus | { repo: false }

/** Was auf dem Rechner da ist */
export interface GitTools {
  /** Git-Version, null = nicht installiert */
  git: string | null
  gh: 'missing' | 'loggedOut' | 'loggedIn'
  ghUser: string | null
  /** winget vorhanden → Installation per Klick möglich */
  winget: boolean
}

/** Fehler, die mit einer GitHub-Anmeldung lösbar sind, tragen diese Marke */
export const AUTH_MARK = '[auth] '

export interface GitCommit {
  hash: string
  short: string
  author: string
  /** Unix-Zeit in ms */
  time: number
  subject: string
}

/** git status --porcelain=v2 --branch -z */
export function parseStatus(out: string): Omit<GitStatus, 'remoteUrl' | 'webUrl'> {
  const st: Omit<GitStatus, 'remoteUrl' | 'webUrl'> = { repo: true, branch: '', unborn: false, upstream: null, ahead: 0, behind: 0, files: [] }
  const parts = out.split('\0')
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (!p) continue
    if (p.startsWith('# ')) {
      const [, key, ...rest] = p.split(' ')
      const val = rest.join(' ')
      if (key === 'branch.head') st.branch = val === '(detached)' ? t('losgelöst') : val
      else if (key === 'branch.oid') st.unborn = val === '(initial)'
      else if (key === 'branch.upstream') st.upstream = val
      else if (key === 'branch.ab') {
        const m = /\+(\d+) -(\d+)/.exec(val)
        if (m) {
          st.ahead = Number(m[1])
          st.behind = Number(m[2])
        }
      }
      continue
    }
    const kind = p[0]
    if (kind === '?') {
      st.files.push({ path: p.slice(2), index: '.', work: '?', untracked: true, conflict: false })
    } else if (kind === '1') {
      const f = p.split(' ')
      st.files.push({ path: f.slice(8).join(' '), index: f[1][0], work: f[1][1], untracked: false, conflict: false })
    } else if (kind === '2') {
      const f = p.split(' ')
      st.files.push({ path: f.slice(9).join(' '), orig: parts[++i], index: f[1][0], work: f[1][1], untracked: false, conflict: false })
    } else if (kind === 'u') {
      const f = p.split(' ')
      st.files.push({ path: f.slice(10).join(' '), index: f[1][0], work: f[1][1], untracked: false, conflict: true })
    }
  }
  st.files.sort((a, b) => a.path.localeCompare(b.path))
  return st
}

export const isStaged = (f: GitFile): boolean => !f.untracked && !f.conflict && f.index !== '.'
export const isUnstaged = (f: GitFile): boolean => f.untracked || f.conflict || f.work !== '.'

/** Buchstabe für die Liste: im jeweiligen Bereich */
export function letter(f: GitFile, staged: boolean): string {
  if (f.conflict) return 'U'
  if (f.untracked) return 'N'
  const l = staged ? f.index : f.work
  return l === 'A' ? 'N' : l
}

/** git@github.com:a/b.git, https://github.com/a/b.git, ssh://git@host/a/b → https://host/a/b */
export function webUrl(remote: string | null): string | null {
  if (!remote) return null
  const r = remote.trim()
  let m = /^git@([^:]+):(.+?)(?:\.git)?\/?$/.exec(r)
  if (m) return `https://${m[1]}/${m[2]}`
  m = /^ssh:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+?)(?:\.git)?\/?$/.exec(r)
  if (m) return `https://${m[1]}/${m[2]}`
  m = /^https?:\/\/(?:[^@/]+@)?([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(r)
  if (m) return `https://${m[1]}/${m[2]}`
  return null
}

/** Branch-Name, den wir an git weitergeben (zusätzlich prüft git check-ref-format) */
export function validBranchName(name: string): boolean {
  const n = name.trim()
  return (
    n.length > 0 &&
    n.length <= 100 &&
    /^[\w./-]+$/.test(n) &&
    !n.startsWith('-') &&
    !n.startsWith('/') &&
    !n.endsWith('/') &&
    !n.endsWith('.') &&
    !n.endsWith('.lock') &&
    !n.includes('..') &&
    !n.includes('//') &&
    n !== 'HEAD'
  )
}

export const LOG_FORMAT = '%H%x1f%h%x1f%an%x1f%at%x1f%s%x1e'

export function parseLog(out: string): GitCommit[] {
  return out
    .split('\x1e')
    .map((r) => r.replace(/^\s+/, ''))
    .filter(Boolean)
    .map((r) => {
      const [hash, short, author, at, subject] = r.split('\x1f')
      return { hash, short, author, time: Number(at) * 1000 || 0, subject: subject ?? '' }
    })
}

// ---------- Diff ----------

export interface DiffLine {
  kind: 'add' | 'del' | 'ctx' | 'hunk' | 'meta'
  text: string
  old?: number
  new?: number
}

export interface DiffFile {
  path: string
  lines: DiffLine[]
  binary: boolean
}

/** Unified Diff (auch mehrere Dateien, z. B. aus git show) in Zeilen mit Nummern zerlegen */
export function parseDiff(text: string): DiffFile[] {
  const files: DiffFile[] = []
  let cur: DiffFile | null = null
  let o = 0
  let n = 0
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '')
    if (line.startsWith('diff --git ')) {
      const m = / b\/(.+)$/.exec(line)
      cur = { path: m ? m[1] : line.slice(11), lines: [], binary: false }
      files.push(cur)
      continue
    }
    if (!cur) {
      if (!line.startsWith('@@')) continue
      cur = { path: '', lines: [], binary: false }
      files.push(cur)
    }
    if (line.startsWith('@@')) {
      const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(line)
      if (m) {
        o = Number(m[1])
        n = Number(m[2])
      }
      cur.lines.push({ kind: 'hunk', text: m ? m[3].trim() : line })
    } else if (line.startsWith('Binary files')) cur.binary = true
    else if (/^(index |--- |\+\+\+ |new file|deleted file|similarity|rename |old mode|new mode)/.test(line)) continue
    else if (line.startsWith('+')) cur.lines.push({ kind: 'add', text: line.slice(1), new: n++ })
    else if (line.startsWith('-')) cur.lines.push({ kind: 'del', text: line.slice(1), old: o++ })
    else if (line.startsWith(' ')) cur.lines.push({ kind: 'ctx', text: line.slice(1), old: o++, new: n++ })
    else if (line.startsWith('\\')) cur.lines.push({ kind: 'meta', text: line.slice(2) })
  }
  return files
}

/** Neue, noch unbekannte Datei als Diff darstellen */
export function addedFileDiff(path: string, content: string): string {
  const lines = content.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')
  return `diff --git a/${path} b/${path}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((l) => '+' + l).join('\n')}\n`
}

// ---------- KI-Commit-Nachricht ----------

export const AI_DIFF_MAX = 60_000

export function commitPrompt(diff: string, recent: string[], stat: string): string {
  const cut = diff.length > AI_DIFF_MAX ? diff.slice(0, AI_DIFF_MAX) + '\n… ' + t('(gekürzt)') : diff
  return [
    t('Schreibe eine Git-Commit-Nachricht für die Änderungen unten.'),
    t('Regeln:'),
    t('- Sprache und Stil wie in den bisherigen Commits dieses Repos (Liste unten). Ohne bisherige Commits: Deutsch, Conventional Commits (feat:, fix:, …).'),
    t('- Erste Zeile: Zusammenfassung, höchstens 72 Zeichen, kein Punkt am Ende.'),
    t('- Bei größeren Änderungen danach eine Leerzeile und 1–5 knappe Stichpunkte mit „- “.'),
    t('- Beschreibe das Warum und Was, nicht jede Datei einzeln.'),
    t('- Gib NUR die Nachricht aus: kein Codeblock, keine Einleitung, keine Anführungszeichen.'),
    '',
    t('## Bisherige Commits'),
    recent.length ? recent.map((s) => '- ' + s).join('\n') : t('(noch keine)'),
    '',
    t('## Übersicht'),
    stat.trim() || t('(keine)'),
    '',
    '## Diff',
    cut
  ].join('\n')
}

/** Antwort von Claude säubern: Codeblöcke, Anführungszeichen, Vorreden */
export function cleanMessage(raw: string): string {
  let s = raw.replace(/\r\n/g, '\n').trim()
  const fence = /^```[a-z]*\n([\s\S]*?)\n```$/.exec(s)
  if (fence) s = fence[1].trim()
  s = s.replace(/^(?:hier ist[^\n]*:|commit[- ]nachricht:|commit message:)\s*\n+/i, '')
  if (/^["'„].*["'“]$/s.test(s) && !s.slice(1, -1).includes('"')) s = s.slice(1, -1).trim()
  return s.replace(/\n{3,}/g, '\n\n')
}

// ---------- Pull Requests ----------

export interface PrInfo {
  /** Ziel-Branch (Standard-Branch auf GitHub) */
  base: string
  branch: string
  /** auf dem Ziel-Branch – für den PR wird ein neuer Branch angelegt */
  onBase: boolean
  /** Commits, die in den PR kommen (neueste zuerst) */
  commits: string[]
  /** gibt es für den Branch schon einen offenen PR? */
  existing: { url: string; title: string } | null
  /** nicht committete Änderungen kommen nicht mit */
  dirty: number
  gh: 'missing' | 'ok'
}

export interface PrDraft {
  title: string
  body: string
}

export function prPrompt(diff: string, commits: string[], stat: string): string {
  const cut = diff.length > AI_DIFF_MAX ? diff.slice(0, AI_DIFF_MAX) + '\n… ' + t('(gekürzt)') : diff
  return [
    t('Schreibe Titel und Beschreibung für einen GitHub-Pull-Request mit den Änderungen unten.'),
    t('Regeln:'),
    t('- Sprache wie in den Commits. Erste Zeile: der Titel, höchstens 72 Zeichen, kein Punkt am Ende.'),
    t('- Danach eine Leerzeile und die Beschreibung in Markdown: kurz, worum es geht und warum, dann „## Änderungen“ mit 2–6 Stichpunkten.'),
    t('- Keine Hinweise auf KI, Claude oder Werkzeuge, mit denen der Text entstand.'),
    t('- Gib NUR Titel und Beschreibung aus: kein Codeblock drumherum, keine Einleitung.'),
    '',
    t('## Commits'),
    commits.length ? commits.map((s) => '- ' + s).join('\n') : t('(noch keine)'),
    '',
    t('## Übersicht'),
    stat.trim() || t('(keine)'),
    '',
    '## Diff',
    cut
  ].join('\n')
}

/** Zeilen, die verraten, womit der Text geschrieben wurde – gehören nicht in öffentliche PRs */
const AI_LINE = /(generated with|erstellt mit|geschrieben mit).*(claude|ai\b|ki\b)|claude\.com\/claude-code|co-authored-by:.*(claude|anthropic)|🤖/i

export function stripAiNotes(s: string): string {
  return s
    .split('\n')
    .filter((l) => !AI_LINE.test(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Antwort von Claude → Titel (erste Zeile) und Beschreibung (Rest) */
export function parsePr(raw: string): PrDraft {
  const s = stripAiNotes(cleanMessage(raw))
  const lines = s.split('\n')
  const title = (lines.shift() ?? '').replace(/^#+\s*/, '').replace(/^(titel|title):\s*/i, '').trim().slice(0, 200)
  const body = lines.join('\n').replace(/^(beschreibung|description):\s*\n?/i, '').trim()
  return { title, body }
}

/** Vorschlag für einen Branch-Namen aus dem Titel: „feat: Dark Mode für Einstellungen“ → „feat/dark-mode-fuer-einstellungen“ */
export function prBranchName(title: string): string {
  const m = /^(\w+)(?:\([^)]*\))?!?:\s*(.*)$/.exec(title.trim())
  const kind = m && /^(feat|fix|docs|refactor|chore|test|perf|style|build|ci)$/i.test(m[1]) ? m[1].toLowerCase() : 'change'
  const slug = (m ? m[2] : title)
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
  return `${kind}/${slug || 'update'}`
}

