// Deutsche Beschriftungen für den Flowchart-Editor (rein, testbar).
import { KINDS, type Cond, type FlowNodeData, type Val } from './flowModel'

export const FIELD_LABELS: Record<string, Record<string, string>> = {
  PHASE: { work: 'Fokus beginnt', break: 'Pause beginnt', end: 'Timer endet' },
  CHANNEL: { music: 'Musik', rain: 'Regen', rain_volume: 'Regen-Lautstärke' },
  CMD: { start: 'starten', stop: 'stoppen' },
  SCENE: { city: 'Stadt bei Nacht', forest: 'Wald in der Dämmerung', tokyo: 'Tokio-Gasse' },
  SOUND: { chime: 'Gong' },
  ON: { TRUE: 'an', FALSE: 'aus' },
  WAIT: { TRUE: 'ja, warten bis fertig', FALSE: 'nein, sofort weiter' },
  AWAIT: { TRUE: 'ja, erst weiter, wenn Claude fertig ist', FALSE: 'nein, sofort weiter' }
}

/** App-Werte für die fx-Auswahl, gruppiert */
export const APP_GROUPS: { label: string; items: [string, string][] }[] = [
  {
    label: 'Sessions & Kosten',
    items: [
      ['waiting_sessions', 'wartende Sessions'],
      ['sessions_running', 'offene Sessions'],
      ['session_minutes', 'Session-Dauer (Min.)'],
      ['tokens_today', 'Tokens heute'],
      ['cost_today', 'Kosten heute ($)'],
      ['event_project', 'Projekt des Ereignisses'],
      ['claude_status', 'Claude-Status (arbeitet, wartet, fertig …)']
    ]
  },
  {
    label: 'Zeit',
    items: [
      ['hour', 'Stunde'],
      ['minute', 'Minute'],
      ['weekday', 'Wochentag'],
      ['day', 'Tag'],
      ['month', 'Monat'],
      ['year', 'Jahr'],
      ['unix', 'Unix-Zeit (s)'],
      ['uptime_minutes', 'Laufzeit VibeDesk (Min.)']
    ]
  },
  {
    label: 'Atmosphäre',
    items: [
      ['rain', 'Regenstärke'],
      ['music_volume', 'Lautstärke Musik'],
      ['rain_volume', 'Lautstärke Regen'],
      ['scene', 'Szene'],
      ['focus_phase', 'Fokus-Phase']
    ]
  }
]
export const APP_VALUES: Record<string, string> = Object.fromEntries(APP_GROUPS.flatMap((g) => g.items))

export const OPS: [string, string][] = [
  ['EQ', '='],
  ['NEQ', '≠'],
  ['LT', '<'],
  ['LTE', '≤'],
  ['GT', '>'],
  ['GTE', '≥']
]

/** Rechenarten: [Schlüssel, Anzeige, zweistellig?, Symbol/Funktionsname] */
export const CALC: { op: string; label: string; binary: boolean; sym: string }[] = [
  { op: 'add', label: 'plus', binary: true, sym: '+' },
  { op: 'sub', label: 'minus', binary: true, sym: '−' },
  { op: 'mul', label: 'mal', binary: true, sym: '×' },
  { op: 'div', label: 'geteilt', binary: true, sym: '÷' },
  { op: 'mod', label: 'Rest (mod)', binary: true, sym: 'mod' },
  { op: 'pow', label: 'hoch', binary: true, sym: '^' },
  { op: 'min', label: 'Minimum', binary: true, sym: 'MIN' },
  { op: 'max', label: 'Maximum', binary: true, sym: 'MAX' },
  { op: 'round', label: 'runden', binary: false, sym: 'RUNDEN' },
  { op: 'floor', label: 'abrunden', binary: false, sym: 'ABRUNDEN' },
  { op: 'ceil', label: 'aufrunden', binary: false, sym: 'AUFRUNDEN' },
  { op: 'abs', label: 'Betrag', binary: false, sym: 'BETRAG' },
  { op: 'sqrt', label: 'Wurzel', binary: false, sym: '√' },
  { op: 'sin', label: 'Sinus (Grad)', binary: false, sym: 'SIN' },
  { op: 'cos', label: 'Kosinus (Grad)', binary: false, sym: 'COS' },
  { op: 'join', label: 'Text verbinden', binary: true, sym: '&' },
  { op: 'upper', label: 'GROSS', binary: false, sym: 'GROSS' },
  { op: 'lower', label: 'klein', binary: false, sym: 'klein' },
  { op: 'trim', label: 'Leerzeichen weg', binary: false, sym: 'TRIM' },
  { op: 'length', label: 'Länge', binary: false, sym: 'LÄNGE' },
  { op: 'contains', label: 'enthält', binary: true, sym: 'enthält' }
]

export const LIST_OPS: { op: string; label: string; arg: boolean }[] = [
  { op: 'length', label: 'Anzahl', arg: false },
  { op: 'item', label: 'Element Nr.', arg: true },
  { op: 'first', label: 'erstes', arg: false },
  { op: 'last', label: 'letztes', arg: false },
  { op: 'random', label: 'zufälliges', arg: false },
  { op: 'contains', label: 'enthält', arg: true },
  { op: 'join', label: 'als Text', arg: false }
]

export const HANDLE_LABELS: Record<string, string> = { next: 'Weiter', yes: 'Ja', no: 'Nein', body: 'Schleife', a: 'A', b: 'B', default: 'Sonst' }

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
    case 'store':
      return `gemerkt „${v.key}“`
    case 'calc': {
      const c = CALC.find((x) => x.op === v.op)
      if (!c) return v.op
      return c.binary ? `(${valLabel(v.a)} ${c.sym} ${valLabel(v.b)})` : `${c.sym}(${valLabel(v.a)})`
    }
    case 'list': {
      if (v.op === 'item') return `${v.name}[${valLabel(v.arg)}]`
      if (v.op === 'length') return `Anzahl in ${v.name}`
      if (v.op === 'contains') return `${v.name} enthält ${valLabel(v.arg)}`
      return `${LIST_OPS.find((x) => x.op === v.op)?.label ?? v.op} aus ${v.name}`
    }
  }
}

export function condLabel(c: Cond | undefined): string {
  if (!c || !c.items.length) return 'immer'
  return c.items.map((i) => `${valLabel(i.a)} ${OPS.find(([k]) => k === i.op)?.[1] ?? i.op} ${valLabel(i.b)}`).join(c.join === 'OR' ? ' oder ' : ' und ')
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
    case 'vd_on_start':
      return 'beim Öffnen'
    case 'vd_on_session_waiting':
      return 'braucht deine Antwort'
    case 'vd_on_session_done':
      return 'Aufgabe erledigt'
    case 'vd_on_signal':
      return `„${f.NAME}“`
    case 'vd_on_command':
      return `Strg+K → Makro: ${f.NAME}`
    case 'vd_claude_start':
      return String(f.PROJECT ?? '').trim() || 'Projekt im Vordergrund'
    case 'vd_claude_send':
      return `${v('TEXT')}${f.AWAIT === 'TRUE' ? ' · wartet' : ''}`
    case 'vd_claude_wait':
      return `höchstens ${unit('TIMEOUT', 'min')}`
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
    case 'vd_fade':
      return `${optionLabel('CHANNEL', String(f.CHANNEL))} → ${unit('VALUE', '%')} in ${unit('SECONDS', 's')}`
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
    case 'vd_forever':
      return 'immer wieder'
    case 'controls_if':
      return condLabel(d.cond)
    case 'vd_switch':
      return `${v('VALUE')}: ${(d.cases ?? []).join(' · ')}`
    case 'vd_wait_until':
      return `${condLabel(d.cond)} · max. ${unit('TIMEOUT', 's')}`
    case 'vd_gate':
      return `höchstens alle ${unit('SECONDS', 's')}`
    case 'vd_parallel':
      return 'A und B zugleich'
    case 'vd_emit':
      return `„${f.NAME}“${f.WAIT === 'TRUE' ? ' und warten' : ''}`
    case 'variables_set':
      return `${d.varName} = ${v('VALUE')}`
    case 'math_change':
      return `${d.varName} + ${v('DELTA')}`
    case 'vd_store_set':
      return `${f.KEY} = ${v('VALUE')}`
    case 'vd_list_add':
      return `${d.varName} ← ${v('VALUE')}`
    case 'vd_list_clear':
      return `${d.varName} leeren`
    case 'vd_show_notice':
    case 'vd_copy_text':
    case 'vd_ask':
      return v('TEXT')
    default:
      return KINDS[d.type]?.desc ?? ''
  }
}
