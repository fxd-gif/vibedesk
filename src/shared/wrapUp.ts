// Session-Abschluss: was in einer Runde geändert wurde, Claudes Zusammenfassung und die Zahlen für den Commit.
import type { HookEvent } from './types'

/** Zusammenfassung höchstens so lang – der Rest steht ohnehin im Terminal */
export const SUMMARY_MAX = 4000
/** so viele Dateien merkt sich eine Runde (Rest wird nur gezählt) */
export const TURN_FILES_MAX = 200

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

export interface WrapTurn {
  /** geänderte Dateien dieser Runde (absolute Pfade, wie Claude sie meldet) */
  files: string[]
  /** Claudes letzte Antwort vor dem Ende der Runde */
  summary?: string
  /** Protokoll der Session – daraus liest Main die Zusammenfassung */
  transcript?: string
  /** Runde ist zu Ende (Stop) */
  ended: boolean
}

const emptyTurn = (): WrapTurn => ({ files: [], ended: false })

/** Pfade für den Vergleich: Windows ist es egal, ob \ oder / und groß oder klein */
const norm = (p: string): string => p.replace(/\\/g, '/').toLowerCase()

/**
 * Führt die Runde einer Session mit einem Hook-Ereignis fort. `BrainTend` ist der erste Stop, nach dem Claude
 * noch kurz das Gehirn pflegt – für die Zusammenfassung zählt er schon als Ende.
 */
export function applyWrapEvent(turn: WrapTurn | undefined, e: HookEvent): WrapTurn | undefined {
  const p = e.payload
  if (e.name === 'UserPromptSubmit') return emptyTurn()
  if (e.name === 'SessionEnd') return undefined
  if (e.name === 'PostToolUse') {
    const tool = typeof p.tool_name === 'string' ? p.tool_name : ''
    if (!EDIT_TOOLS.has(tool)) return turn
    const input = (p.tool_input ?? {}) as Record<string, unknown>
    const file = typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : ''
    if (!file || /[\\/]\.vibedesk[\\/]brain[\\/]/i.test(file)) return turn
    const t = turn ?? emptyTurn()
    if (t.files.some((f) => norm(f) === norm(file)) || t.files.length >= TURN_FILES_MAX) return t
    return { ...t, files: [...t.files, file] }
  }
  if (e.name === 'Stop' || e.name === 'BrainTend') {
    if (!turn) return turn
    const transcript = typeof p.transcript_path === 'string' ? p.transcript_path : turn.transcript
    const last = typeof p.last_assistant_message === 'string' ? p.last_assistant_message.trim() : ''
    // nach der Gehirn-Pflege wäre die letzte Antwort nur „Gehirn ist aktuell.“ – die erste gewinnt
    const summary = turn.summary ?? (last ? clip(last) : undefined)
    return { ...turn, transcript, summary, ended: true }
  }
  return turn
}

const clip = (s: string): string => (s.length > SUMMARY_MAX ? s.slice(0, SUMMARY_MAX).trimEnd() + ' …' : s)

/**
 * Letzte Text-Antwort von Claude aus Protokollzeilen (JSONL). Eine Antwort kann über mehrere Zeilen mit
 * derselben message.id verteilt sein (Text, Werkzeug, Text) – alle Textteile gehören dazu.
 */
export function lastAssistantText(lines: string[]): string {
  let id: string | undefined
  const parts: string[] = []
  for (let i = lines.length - 1; i >= 0; i--) {
    let j: { type?: unknown; isSidechain?: unknown; message?: { id?: unknown; content?: unknown } }
    try {
      j = JSON.parse(lines[i])
    } catch {
      continue
    }
    if (j?.type !== 'assistant' || j.isSidechain === true || !j.message) continue
    const mid = typeof j.message.id === 'string' ? j.message.id : undefined
    const texts = textBlocks(j.message.content)
    if (id === undefined) {
      if (!texts.length) continue
      id = mid ?? ''
    } else if (mid !== id || !mid) break
    parts.unshift(...texts)
  }
  return clip(parts.join('\n\n').trim())
}

function textBlocks(content: unknown): string[] {
  if (typeof content === 'string') return content.trim() ? [content.trim()] : []
  if (!Array.isArray(content)) return []
  return content
    .filter((b): b is { type: 'text'; text: string } => !!b && b.type === 'text' && typeof b.text === 'string' && !!b.text.trim())
    .map((b) => b.text.trim())
}

export interface WrapFile {
  path: string
  /** hinzugefügte/entfernte Zeilen; null = binär oder unbekannt */
  add: number | null
  del: number | null
  untracked: boolean
}

/** Änderungen im Arbeitsordner der Session */
export type WrapChanges = { repo: false } | { repo: true; branch: string; files: WrapFile[] }

/** `git diff --numstat -z`:„add\tdel\tpfad\0“, bei Umbenennungen „add\tdel\t\0alt\0neu\0“ */
export function parseNumstat(out: string): Map<string, { add: number | null; del: number | null }> {
  const m = new Map<string, { add: number | null; del: number | null }>()
  const tok = out.split('\0')
  for (let i = 0; i < tok.length; i++) {
    const r = /^(\d+|-)\t(\d+|-)\t(.*)$/s.exec(tok[i])
    if (!r) continue
    let file = r[3]
    if (!file) {
      // Umbenennung: die nächsten beiden Einträge sind alt und neu
      file = tok[i + 2] ?? ''
      i += 2
    }
    if (file) m.set(file, { add: r[1] === '-' ? null : Number(r[1]), del: r[2] === '-' ? null : Number(r[2]) })
  }
  return m
}

/** Wie viele der geänderten Dateien hat Claude in dieser Runde angefasst? (für den Hinweis auf Fremdes) */
export function turnShare(turnFiles: string[], cwd: string, changed: WrapFile[]): { mine: number; other: number } {
  const root = norm(cwd).replace(/\/+$/, '') + '/'
  const mine = new Set(turnFiles.map(norm).filter((f) => f.startsWith(root)).map((f) => f.slice(root.length)))
  let n = 0
  for (const f of changed) if (mine.has(norm(f.path))) n++
  return { mine: n, other: changed.length - n }
}
