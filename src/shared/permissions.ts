// Freigaben (PermissionRequest-Hook): lesbare Zusammenfassung für Karten/Handy und die Antwort an Claude Code.
import { t } from './i18n'

export type PermissionDecision = 'allow' | 'always' | 'deny' | 'terminal'

/** Offene Freigabe-Anfrage – so sehen Desktop-Karte und Handy sie */
export interface PermissionAsk {
  id: string
  sessionId: string
  tool: string
  /** eine Zeile: was Claude tun will */
  summary: string
  /** Befehl, Pfad, URL … (gekürzt) */
  detail: string
  /** „Immer erlauben“ möglich (Claude Code liefert passende Regeln mit) */
  canAlways: boolean
  ts: number
}

const DETAIL_MAX = 600

const obj = (x: unknown): Record<string, unknown> =>
  x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {}
const str = (x: unknown): string => (typeof x === 'string' ? x : '')
const clip = (s: string, n = DETAIL_MAX): string => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const file = (p: string): string => p.split(/[\\/]+/).filter(Boolean).slice(-3).join('/')

/** Was will Claude tun? Für Menschen, kurz. */
export function describePermission(tool: string, input: unknown): { summary: string; detail: string } {
  const i = obj(input)
  switch (tool) {
    case 'Bash':
    case 'PowerShell':
      return { summary: t('Befehl ausführen'), detail: clip(str(i.command)) }
    case 'Edit':
    case 'MultiEdit':
      return { summary: t('Datei ändern'), detail: file(str(i.file_path)) }
    case 'Write':
      return { summary: t('Datei schreiben'), detail: file(str(i.file_path)) }
    case 'NotebookEdit':
      return { summary: t('Notebook ändern'), detail: file(str(i.notebook_path)) }
    case 'Read':
      return { summary: t('Datei lesen'), detail: file(str(i.file_path)) }
    case 'WebFetch':
      return { summary: t('Webseite abrufen'), detail: clip(str(i.url), 200) }
    case 'WebSearch':
      return { summary: t('Im Web suchen'), detail: clip(str(i.query), 200) }
    case 'Task':
    case 'Agent':
      return { summary: t('Agent starten'), detail: clip(str(i.description), 200) }
  }
  const mcp = /^mcp__([^_]+(?:_[^_]+)*)__(.+)$/.exec(tool)
  if (mcp) return { summary: t('Werkzeug „{tool}“ ({server})', { tool: mcp[2], server: mcp[1] }), detail: clip(JSON.stringify(i), 300) }
  return { summary: t('Werkzeug „{tool}“', { tool: clip(tool, 60) }), detail: clip(JSON.stringify(i), 300) }
}

const SUGGEST_MAX_BYTES = 20_000

/** permission_suggestions aus dem Hook – nur durchreichen, wenn es plausibel aussieht */
export function cleanSuggestions(x: unknown): unknown[] | null {
  if (!Array.isArray(x) || !x.length || x.length > 20) return null
  if (!x.every((s) => s && typeof s === 'object' && !Array.isArray(s) && typeof (s as { type?: unknown }).type === 'string')) return null
  return JSON.stringify(x).length <= SUGGEST_MAX_BYTES ? x : null
}

/**
 * Antwort-Body für den Hook (landet über den Forwarder auf stdout). Leer = keine Entscheidung –
 * Claude Code fragt dann ganz normal im Terminal.
 */
export function permissionReply(decision: PermissionDecision, suggestions: unknown[] | null): string {
  if (decision === 'terminal') return ''
  const d =
    decision === 'deny'
      ? { behavior: 'deny', message: t('In VibeDesk abgelehnt. Frag nach, was stattdessen passieren soll.') }
      : decision === 'always' && suggestions
        ? { behavior: 'allow', updatedPermissions: suggestions }
        : { behavior: 'allow' }
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: d } })
}

export const isDecision = (x: unknown): x is PermissionDecision => x === 'allow' || x === 'always' || x === 'deny' || x === 'terminal'

/** gleiche Anfrage? (PostToolUse räumt die passende offene Anfrage ab) */
export const sameCall = (aTool: string, aInput: unknown, bTool: string, bInput: unknown): boolean =>
  aTool === bTool && JSON.stringify(aInput ?? null) === JSON.stringify(bInput ?? null)
