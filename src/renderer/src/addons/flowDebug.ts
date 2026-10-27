// Ablauf-Debugger im Maker (rein, testbar): Spur des Test-Runners → Leuchten der Knoten/Kanten und Protokoll „Ablauf“.
import { t } from '../../../shared/i18n'
import type { AddonEvent, TraceInfo, TracePhase } from './interpreter'
import { KINDS, type FlowNodeData } from './flowModel'
import { HANDLE_LABELS, optionLabel } from './flowLabels'

/** so viele Schritte behält das Protokoll */
export const LOG_MAX = 50
/** so lange glimmt ein Knoten nach, nachdem er gelaufen ist */
export const GLOW_MS = 1600
/** so lange leuchtet eine genommene Kante */
export const EDGE_MS = 1200
const DETAIL_MAX = 80

export type EntryTone = 'trigger' | 'run' | 'branch' | 'stop' | 'error'

export interface DebugEntry {
  seq: number
  at: number
  nodeId: string
  label: string
  result: string
  tone: EntryTone
}

export interface DebugState {
  /** Knoten, die gerade laufen (Zähler, weil ein Knoten in mehreren Abläufen zugleich laufen kann) */
  active: Map<string, number>
  /** zuletzt gelaufene Knoten → glimmt bis */
  recent: Map<string, number>
  /** genommene Kanten → leuchtet bis */
  hot: Map<string, number>
  /** neueste zuerst */
  log: DebugEntry[]
  seq: number
}

export const emptyDebug = (): DebugState => ({ active: new Map(), recent: new Map(), hot: new Map(), log: [], seq: 0 })

/** Knoten, die eine Entscheidung melden – bei ihnen zählt im Protokoll das Ergebnis, nicht das Betreten */
const DECIDERS = new Set(['controls_if', 'vd_switch', 'vd_gate'])

const clip = (s: string, n = DETAIL_MAX): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const pad = (n: number): string => String(n).padStart(2, '0')

/** Uhrzeit eines Eintrags, z. B. „14:03:27“ */
export function clockTime(at: number): string {
  const d = new Date(at)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** Kurzfassung eines Ereignisses fürs Protokoll, z. B. die geänderte Datei oder das Werkzeug */
export function eventSummary(e: AddonEvent | undefined): string {
  if (!e) return ''
  switch (e.type) {
    case 'file_changed':
      return clip(e.path)
    case 'tool':
      return clip(e.detail ? `${e.tool}: ${e.detail}` : e.tool)
    case 'commit':
      return clip(`„${e.message}“`)
    case 'preview_error':
      return clip(e.text)
    case 'hotkey':
      return t('Strg + Alt + {key}', { key: e.key })
    case 'time':
      return `${pad(e.hour)}:${pad(e.minute)}`
    case 'interval':
      return t('alle {n} Minuten', { n: String(e.minutes) })
    case 'signal':
    case 'command':
      return clip(`„${e.name}“`)
    case 'focus':
      return optionLabel('PHASE', e.phase)
    case 'session_waiting':
    case 'session_done':
      return clip(e.project ?? '')
    default:
      return ''
  }
}

/** Beschriftung eines genommenen Ausgangs: Ja/Nein, eigener Knopftext oder Fallwert */
function branchLabel(d: FlowNodeData | undefined, branch: string): string {
  const m = /^case(\d+)$/.exec(branch)
  if (m) return t('Fall „{value}“', { value: d?.cases?.[Number(m[1])] ?? m[1] })
  if (d?.type === 'vd_ask' && branch === 'yes') return String(d.fields.YES_LABEL || t('Ja'))
  if (d?.type === 'vd_ask' && branch === 'no') return String(d.fields.NO_LABEL || t('Nein'))
  return HANDLE_LABELS()[branch] ?? branch
}

/** Protokollzeile zu einem Schritt – null, wenn der Schritt nicht ins Protokoll gehört */
export function describeStep(d: FlowNodeData | undefined, phase: TracePhase, info?: TraceInfo): { result: string; tone: EntryTone } | null {
  switch (phase) {
    case 'trigger': {
      const detail = eventSummary(info?.event)
      return { result: detail ? t('ausgelöst – {detail}', { detail }) : t('ausgelöst'), tone: 'trigger' }
    }
    case 'enter':
      return d && DECIDERS.has(d.type) ? null : { result: t('läuft'), tone: 'run' }
    case 'decide':
      if (info?.passed === true) return { result: `→ ${t('durchgelassen')}`, tone: 'branch' }
      if (info?.passed === false) return { result: `→ ${t('gestoppt (noch {n} s)', { n: Math.max(1, Math.ceil((info.waitMs ?? 0) / 1000)) })}`, tone: 'stop' }
      return info?.branch ? { result: `→ ${branchLabel(d, info.branch)}`, tone: 'branch' } : null
    case 'error':
      return { result: clip(info?.message || t('Unbekannter Fehler'), 200), tone: 'error' }
    default:
      return null
  }
}

/** Neuen Eintrag vorne anfügen, höchstens max behalten */
export function pushEntry(log: DebugEntry[], e: DebugEntry, max = LOG_MAX): DebugEntry[] {
  return [e, ...log].slice(0, Math.max(0, max))
}

export interface DebugGraph {
  node(id: string): FlowNodeData | undefined
  /** die eine Kante, die in diesen Knoten führt (jeder Knoten hat höchstens einen Eingang) */
  inEdge(id: string): string | undefined
}

/** Einen Schritt der Spur einarbeiten (verändert s). */
export function applyStep(s: DebugState, g: DebugGraph, id: string, phase: TracePhase, info: TraceInfo | undefined, now: number): void {
  const d = g.node(id)
  if (phase === 'trigger') s.recent.set(id, now + GLOW_MS)
  if (phase === 'enter') {
    s.active.set(id, (s.active.get(id) ?? 0) + 1)
    const edge = g.inEdge(id)
    if (edge) s.hot.set(edge, now + EDGE_MS)
  }
  if (phase === 'leave') {
    const n = (s.active.get(id) ?? 0) - 1
    if (n > 0) s.active.set(id, n)
    else s.active.delete(id)
    s.recent.set(id, now + GLOW_MS)
  }
  const line = describeStep(d, phase, info)
  if (!line) return
  s.seq++
  s.log = pushEntry(s.log, { seq: s.seq, at: now, nodeId: id, label: d ? KINDS[d.type]?.label ?? d.type : t('Gelöschter Knoten'), ...line })
}

/** Abgelaufenes Nachglimmen entfernen; true, wenn sich etwas geändert hat */
export function expireDebug(s: DebugState, now: number): boolean {
  let changed = false
  for (const m of [s.recent, s.hot])
    for (const [k, until] of m)
      if (until <= now) {
        m.delete(k)
        changed = true
      }
  return changed
}

/** Beispiel-Dateipfad, der zum Muster des Auslösers passt (leer → „src/app.css“) */
export function samplePath(pattern: string): string {
  const p = pattern.split(',').map((x) => x.trim()).find(Boolean)
  if (!p) return 'src/app.css'
  const path = p
    .replace(/\\/g, '/')
    .replace(/\*\*\//g, '')
    .replace(/\*\*/g, 'app')
    .replace(/\*/g, 'app')
    .replace(/\?/g, 'x')
  return path.includes('/') ? path : `src/${path}`
}

/** Künstliches Ereignis mit Beispieldaten für „Auslösen“ im Test – null bei Knoten, die kein Auslöser sind */
export function sampleEvent(d: FlowNodeData, ctx: { project?: string } = {}): AddonEvent | null {
  const f = d.fields
  const project = ctx.project ? { project: ctx.project } : {}
  switch (d.type) {
    case 'vd_on_start':
      return { type: 'start' }
    case 'vd_on_session_waiting':
      return { type: 'session_waiting', ...project }
    case 'vd_on_session_done':
      return { type: 'session_done', ...project }
    case 'vd_on_focus':
      return { type: 'focus', phase: f.PHASE === 'break' || f.PHASE === 'end' ? f.PHASE : 'work' }
    case 'vd_on_time':
      return { type: 'time', hour: Number(f.HOUR) || 0, minute: Number(f.MINUTE) || 0 }
    case 'vd_on_hotkey':
      return { type: 'hotkey', key: String(f.KEY ?? '') }
    case 'vd_on_interval':
      return { type: 'interval', minutes: Number(f.MINUTES) || 0 }
    case 'vd_on_signal':
      return { type: 'signal', name: String(f.NAME ?? '') }
    case 'vd_on_command':
      return { type: 'command', name: String(f.NAME ?? '').trim() }
    case 'vd_on_file_changed':
      return { type: 'file_changed', path: samplePath(String(f.PATTERN ?? '')), ...project }
    case 'vd_on_tool': {
      const want = String(f.TOOL ?? 'any')
      const tool = want === 'any' ? 'Bash' : want === 'mcp' ? 'mcp__vibedesk__desk_notify' : want
      const detail = tool === 'Bash' ? 'npm test' : ['Edit', 'Write', 'Read'].includes(tool) ? 'src/app.css' : undefined
      return { type: 'tool', tool, ...(detail ? { detail } : {}), ...project }
    }
    case 'vd_on_commit':
      return { type: 'commit', message: t('Beispiel: Knopf repariert'), ...project }
    case 'vd_on_preview_error':
      return { type: 'preview_error', text: "TypeError: Cannot read properties of undefined (reading 'map')" }
    default:
      return null
  }
}
