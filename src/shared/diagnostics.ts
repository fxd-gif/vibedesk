// Diagnose: was Main über den Zustand von VibeDesk sammelt, und daraus ein Bericht zum Kopieren ins Issue.
import { scrubPaths } from './bugReport'
import type { EnergySaver } from './types'

/** GitHub-CLI: fehlt, installiert ohne Anmeldung, angemeldet – oder Prüfung dauerte zu lange */
export type GhState = 'missing' | 'loggedOut' | 'loggedIn' | 'unknown'

export interface DiagnosticsInfo {
  versions: {
    vibedesk: string
    electron: string
    chrome: string
    /** Node in Electron */
    node: string
    os: string
    claude: string | null
    /** Node auf dem System (für den Hook-Forwarder) */
    systemNode: string | null
    git: string | null
    gh: GhState
  }
  hooks: {
    running: boolean
    port: number | null
    /** empfangene Hook-Ereignisse seit Start (ohne Statuszeile) */
    events: number
    lastEventAt: number | null
  }
  sessions: number
  brainOn: boolean
  companionOn: boolean
  /** Arbeitsspeicher aller VibeDesk-Prozesse in MB */
  memoryMb: number
  energySaver: EnergySaver
  onBattery: boolean
  /** Ende des Fehlerprotokolls, Pfade schon unkenntlich */
  log: string
}

export const LOG_LINES = 30
const MAX_LINE = 300

/** Die letzten Zeilen des Protokolls, überlange Zeilen gekürzt */
export function logTail(text: string, lines = LOG_LINES): string {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(-lines)
    .map((l) => (l.length > MAX_LINE ? l.slice(0, MAX_LINE) + ' …' : l))
    .join('\n')
}

/** Wird der Regen gerade sparsam gezeichnet? (gleiche Regel wie im Renderer) */
export function saverOn(mode: EnergySaver, onBattery: boolean): boolean {
  return mode === 'on' || (mode === 'auto' && onBattery)
}

/** „vor 3 min“ – grob, für Mensch und Issue */
export function ago(ts: number | null, now: number): string {
  if (ts === null) return 'noch keins'
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 60) return `vor ${s} s`
  if (s < 3600) return `vor ${Math.round(s / 60)} min`
  return `vor ${Math.round(s / 3600)} h`
}

const onOff = (b: boolean): string => (b ? 'an' : 'aus')
const GH: Record<GhState, string> = { missing: 'nicht installiert', loggedOut: 'installiert, nicht angemeldet', loggedIn: 'angemeldet', unknown: 'unbekannt' }

/** Bericht als Markdown fürs GitHub-Issue – Benutzernamen in Pfaden unkenntlich */
export function diagnosticsReport(d: DiagnosticsInfo, lounge: boolean, now = Date.now()): string {
  const v = d.versions
  const saver = saverOn(d.energySaver, d.onBattery)
  const lines = [
    '### VibeDesk-Diagnose',
    '',
    '**Versionen**',
    `- VibeDesk ${v.vibedesk}`,
    `- Electron ${v.electron} · Chrome ${v.chrome} · Node ${v.node}`,
    `- ${v.os}`,
    `- Claude Code ${v.claude ?? 'nicht gefunden'}`,
    `- Node (System) ${v.systemNode ?? 'nicht gefunden'}`,
    `- Git ${v.git ?? 'nicht gefunden'}`,
    `- GitHub-CLI ${GH[v.gh]}`,
    '',
    '**Hook-Server**',
    `- ${d.hooks.running ? `läuft auf Port ${d.hooks.port}` : 'läuft nicht'}`,
    `- ${d.hooks.events} Ereignisse seit Start, letztes ${ago(d.hooks.lastEventAt, now)}`,
    `- ${d.sessions} laufende Sessions`,
    '',
    '**Module**',
    `- Gehirn-MCP ${onOff(d.brainOn)} · Handy-Begleiter ${onOff(d.companionOn)} · Lounge ${onOff(lounge)}`,
    '',
    '**Leistung**',
    `- Arbeitsspeicher ${d.memoryMb} MB`,
    `- Bildrate ${saver ? 'Sparmodus' : 'normal'} (Energiesparen: ${d.energySaver}${d.onBattery ? ', Akku' : ''})`
  ]
  if (d.log.trim()) lines.push('', '<details><summary>Fehlerprotokoll (Ende)</summary>', '', '```', d.log.trim(), '```', '</details>')
  return scrubPaths(lines.join('\n'))
}
