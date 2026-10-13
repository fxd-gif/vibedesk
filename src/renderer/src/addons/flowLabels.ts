// Deutsche Beschriftungen für den Flowchart-Editor (rein, testbar).
import { KINDS, type FlowNodeData, type Val } from './flowModel'

export const FIELD_LABELS: Record<string, Record<string, string>> = {
  PHASE: { work: 'Fokus beginnt', break: 'Pause beginnt', end: 'Timer endet' },
  CHANNEL: { music: 'Musik', rain: 'Regen' },
  CMD: { start: 'starten', stop: 'stoppen' },
  SCENE: { city: 'Stadt bei Nacht', forest: 'Wald in der Dämmerung', tokyo: 'Tokio-Gasse' },
  SOUND: { chime: 'Gong' },
  ON: { TRUE: 'an', FALSE: 'aus' }
}

export const APP_VALUES: Record<string, string> = {
  hour: 'Stunde',
  minute: 'Minute',
  waiting_sessions: 'wartende Sessions',
  rain: 'Regenstärke',
  music_volume: 'Lautstärke Musik',
  rain_volume: 'Lautstärke Regen',
  focus_phase: 'Fokus-Phase',
  scene: 'Szene'
}

export const OPS: [string, string][] = [
  ['EQ', '='],
  ['NEQ', '≠'],
  ['LT', '<'],
  ['LTE', '≤'],
  ['GT', '>'],
  ['GTE', '≥']
]

const pad = (n: number): string => String(n).padStart(2, '0')

export function optionLabel(field: string, value: string): string {
  if (value.startsWith('asset:')) return `${field === 'SOUND' ? 'Ton' : 'Bild'}: ${value.slice(6)}`
  return FIELD_LABELS[field]?.[value] ?? value
}

export function valLabel(v: Val | undefined): string {
  if (!v) return ''
  switch (v.k) {
    case 'num':
      return String(v.v)
    case 'text':
      return `„${v.v}“`
    case 'var':
      return v.name
    case 'app':
      return APP_VALUES[v.what] ?? v.what
    case 'prompt':
      return `Vorlage „${v.name}“`
    case 'random':
      return `Zufall ${v.min}–${v.max}`
  }
}

/** Untertitel einer Knotenkarte, z. B. „Strg + Alt + T“ oder „Musik → 50 %“. */
export function summarize(d: FlowNodeData): string {
  const f = d.fields
  const v = (k: string): string => valLabel(d.values[k])
  const unit = (k: string, u: string): string => (d.values[k]?.k === 'num' ? `${v(k)} ${u}` : v(k))
  switch (d.type) {
    case 'vd_on_hotkey':
      return `Strg + Alt + ${f.KEY}`
    case 'vd_on_time':
      return `täglich um ${pad(Number(f.HOUR))}:${pad(Number(f.MINUTE))}`
    case 'vd_on_interval':
      return `alle ${f.MINUTES} Minuten`
    case 'vd_on_focus':
      return optionLabel('PHASE', String(f.PHASE))
    case 'vd_set_scene':
      return optionLabel('SCENE', String(f.SCENE))
    case 'vd_play_sound':
      return optionLabel('SOUND', String(f.SOUND))
    case 'vd_set_rain':
      return unit('VALUE', '%')
    case 'vd_change_rain':
      return d.values.DELTA?.k === 'num' && d.values.DELTA.v >= 0 ? `+ ${v('DELTA')} %` : unit('DELTA', '%')
    case 'vd_set_volume':
      return `${optionLabel('CHANNEL', String(f.CHANNEL))} → ${unit('VALUE', '%')}`
    case 'vd_music_onoff':
      return `Musik ${optionLabel('ON', String(f.ON))}`
    case 'vd_focus':
      return optionLabel('CMD', String(f.CMD))
    case 'vd_wait': {
      const s = d.values.SECONDS
      return s?.k === 'num' ? `${s.v} ${s.v === 1 ? 'Sekunde' : 'Sekunden'}` : v('SECONDS')
    }
    case 'controls_repeat_ext':
      return d.values.TIMES?.k === 'num' ? `${v('TIMES')} ×` : `${v('TIMES')} mal`
    case 'controls_if': {
      const c = d.cond
      if (!c) return ''
      return `${valLabel(c.a)} ${OPS.find(([k]) => k === c.op)?.[1] ?? c.op} ${valLabel(c.b)}`
    }
    case 'variables_set':
      return `${d.varName} = ${v('VALUE')}`
    case 'math_change':
      return `${d.varName} + ${v('DELTA')}`
    case 'vd_show_notice':
    case 'vd_copy_text':
      return v('TEXT')
    case 'vd_on_start':
      return 'beim Öffnen'
    case 'vd_on_session_waiting':
      return 'braucht deine Antwort'
    case 'vd_on_session_done':
      return 'Aufgabe erledigt'
    case 'vd_forever':
      return 'immer wieder'
    default:
      return KINDS[d.type]?.desc ?? ''
  }
}
