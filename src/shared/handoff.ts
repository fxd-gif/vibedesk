// Übergabe zwischen Sessions (desk_session_send): Was die schickende Session gerade getan hat, kommt als kurzer
// Block an den Auftrag – die empfangende startet mit Kontext statt kalt.
import { t, tn } from './i18n'

/** Zusammenfassung höchstens so lang – sonst wird der Auftrag selbst zur Nebensache */
export const HANDOFF_SUMMARY_MAX = 600
/** so viele Dateien werden einzeln genannt, der Rest nur gezählt */
export const HANDOFF_FILES_MAX = 12

/** Übergabe-Wunsch aus desk_session_send: der Renderer kennt die Runde der schickenden Session und hängt sie an */
export interface SessionHandoff {
  fromId: string
  summary?: string
}

export interface HandoffFile {
  /** relativ zum Ordner der schickenden Session */
  path: string
  add: number | null
  del: number | null
}

export interface Handoff {
  /** Name der schickenden Session */
  from: string
  /** Arbeitsordner der schickenden Session – Pfade sind relativ dazu */
  cwd: string
  summary?: string
  files: HandoffFile[]
}

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim()

const clip = (s: string, max: number): string => (s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s)

/** Anfrage aus dem MCP-Aufruf: handoff ist an, solange es nicht ausdrücklich false ist */
export function handoffRequest(a: Record<string, unknown>): { summary?: string } | null {
  if (a.handoff === false) return null
  const summary = typeof a.summary === 'string' ? clip(oneLine(a.summary), HANDOFF_SUMMARY_MAX) : ''
  return summary ? { summary } : {}
}

/** Pfade relativ zum Ordner der Session (sonst wie gemeldet), mit / */
export function relTo(cwd: string, file: string): string {
  const f = file.replace(/\\/g, '/')
  const root = cwd.replace(/\\/g, '/').replace(/\/+$/, '') + '/'
  return f.toLowerCase().startsWith(root.toLowerCase()) ? f.slice(root.length) : f
}

const lines = (f: HandoffFile): string => (f.add == null || f.del == null ? '' : ` (+${f.add} −${f.del})`)

/** Einzeiliger Block – Zeilenumbrüche würden die Eingabe im Terminal vorzeitig abschicken */
export function handoffBlock(h: Handoff): string {
  if (!h.summary && !h.files.length) return ''
  const parts = [t('Übergabe von „{from}“ (Ordner {cwd}):', { from: h.from, cwd: h.cwd })]
  if (h.summary) parts.push(t('Was dort gerade passiert ist: {summary}', { summary: clip(oneLine(h.summary), HANDOFF_SUMMARY_MAX) }))
  if (h.files.length) {
    const shown = h.files.slice(0, HANDOFF_FILES_MAX).map((f) => f.path + lines(f))
    const more = h.files.length - shown.length
    parts.push(t('Dort geändert: {files}', { files: shown.join(', ') + (more > 0 ? ' ' + tn(more, 'und 1 weitere', 'und {n} weitere') : '') }) + '.')
  }
  return parts.join(' ')
}

/** Auftrag mit angehängter Übergabe */
export function withHandoff(prompt: string, h: Handoff | null): string {
  const block = h ? handoffBlock(h) : ''
  return block ? `${prompt.trim()} — ${block}` : prompt
}
