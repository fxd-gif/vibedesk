// Beschriftungen für den Flowchart-Editor (rein, testbar). Funktionen statt Konstanten, damit die Sprache beim Anzeigen gilt.
import { t } from '../../../shared/i18n'
import { KINDS, type Cond, type FlowNodeData, type Val } from './flowModel'

export const FIELD_LABELS = (): Record<string, Record<string, string>> => ({
  PHASE: { work: t('Fokus beginnt'), break: t('Pause beginnt'), end: t('Timer endet') },
  CHANNEL: { music: t('Musik'), rain: t('Regen'), rain_volume: t('Regen-Lautstärke') },
  CMD: { start: t('starten'), stop: t('stoppen') },
  SCENE: { city: t('Stadt bei Nacht'), forest: t('Wald in der Dämmerung'), tokyo: t('Tokio-Gasse') },
  SOUND: { chime: t('Gong') },
  ON: { TRUE: t('an'), FALSE: t('aus') },
  WAIT: { TRUE: t('ja, warten bis fertig'), FALSE: t('nein, sofort weiter') },
  AWAIT: { TRUE: t('ja, erst weiter, wenn Claude fertig ist'), FALSE: t('nein, sofort weiter') },
  TOOL: { any: t('jedes Werkzeug'), Bash: t('Befehl im Terminal (Bash)'), Edit: t('Datei bearbeiten (Edit)'), Write: t('Datei schreiben (Write)'), Read: t('Datei lesen (Read)'), Grep: t('Suchen (Grep)'), Glob: t('Dateien finden (Glob)'), WebFetch: t('Webseite abrufen (WebFetch)'), WebSearch: t('Websuche (WebSearch)'), Task: t('Subagent (Task)'), mcp: t('MCP-Werkzeug') }
})

/** App-Werte für die fx-Auswahl, gruppiert */
export const APP_GROUPS = (): { label: string; items: [string, string][] }[] => [
  {
    label: t('Sessions & Kosten'),
    items: [
      ['waiting_sessions', t('wartende Sessions')],
      ['sessions_running', t('offene Sessions')],
      ['session_minutes', t('Session-Dauer (Min.)')],
      ['tokens_today', t('Tokens heute')],
      ['cost_today', t('Kosten heute ($)')],
      ['event_project', t('Projekt des Ereignisses')],
      ['event_file', t('Datei des Ereignisses')],
      ['event_tool', t('Werkzeug des Ereignisses')],
      ['event_text', t('Text des Ereignisses (Fehler, Commit, Befehl)')],
      ['claude_status', t('Claude-Status (arbeitet, wartet, fertig …)')]
    ]
  },
  {
    label: t('Zeit'),
    items: [
      ['hour', t('Stunde')],
      ['minute', t('Minute')],
      ['weekday', t('Wochentag')],
      ['day', t('Tag')],
      ['month', t('Monat')],
      ['year', t('Jahr')],
      ['unix', t('Unix-Zeit (s)')],
      ['uptime_minutes', t('Laufzeit VibeDesk (Min.)')]
    ]
  },
  {
    label: t('Atmosphäre'),
    items: [
      ['rain', t('Regenstärke')],
      ['music_volume', t('Lautstärke Musik')],
      ['rain_volume', t('Lautstärke Regen')],
      ['scene', t('Szene')],
      ['focus_phase', t('Fokus-Phase')]
    ]
  }
]
export const APP_VALUES = (): Record<string, string> => Object.fromEntries(APP_GROUPS().flatMap((g) => g.items))

export const OPS: [string, string][] = [
  ['EQ', '='],
  ['NEQ', '≠'],
  ['LT', '<'],
  ['LTE', '≤'],
  ['GT', '>'],
  ['GTE', '≥']
]

/** Rechenarten: [Schlüssel, Anzeige, zweistellig?, Symbol/Funktionsname] */
export const CALC = (): { op: string; label: string; binary: boolean; sym: string }[] => [
  { op: 'add', label: t('plus'), binary: true, sym: '+' },
  { op: 'sub', label: t('minus'), binary: true, sym: '−' },
  { op: 'mul', label: t('mal'), binary: true, sym: '×' },
  { op: 'div', label: t('geteilt'), binary: true, sym: '÷' },
  { op: 'mod', label: t('Rest (mod)'), binary: true, sym: 'mod' },
  { op: 'pow', label: t('hoch'), binary: true, sym: '^' },
  { op: 'min', label: t('Minimum'), binary: true, sym: 'MIN' },
  { op: 'max', label: t('Maximum'), binary: true, sym: 'MAX' },
  { op: 'round', label: t('runden'), binary: false, sym: t('RUNDEN') },
  { op: 'floor', label: t('abrunden'), binary: false, sym: t('ABRUNDEN') },
  { op: 'ceil', label: t('aufrunden'), binary: false, sym: t('AUFRUNDEN') },
  { op: 'abs', label: t('Betrag'), binary: false, sym: t('BETRAG') },
  { op: 'sqrt', label: t('Wurzel'), binary: false, sym: '√' },
  { op: 'sin', label: t('Sinus (Grad)'), binary: false, sym: 'SIN' },
  { op: 'cos', label: t('Kosinus (Grad)'), binary: false, sym: 'COS' },
  { op: 'join', label: t('Text verbinden'), binary: true, sym: '&' },
  { op: 'upper', label: t('GROSS'), binary: false, sym: t('GROSS') },
  { op: 'lower', label: t('klein'), binary: false, sym: t('klein') },
  { op: 'trim', label: t('Leerzeichen weg'), binary: false, sym: 'TRIM' },
  { op: 'length', label: t('Länge'), binary: false, sym: t('LÄNGE') },
  { op: 'contains', label: t('enthält'), binary: true, sym: t('enthält') }
]

export const LIST_OPS = (): { op: string; label: string; arg: boolean }[] => [
  { op: 'length', label: t('Anzahl'), arg: false },
  { op: 'item', label: t('Element Nr.'), arg: true },
  { op: 'first', label: t('erstes'), arg: false },
  { op: 'last', label: t('letztes'), arg: false },
  { op: 'random', label: t('zufälliges'), arg: false },
  { op: 'contains', label: t('enthält'), arg: true },
  { op: 'join', label: t('als Text'), arg: false }
]

export const HANDLE_LABELS = (): Record<string, string> => ({ next: t('Weiter'), yes: t('Ja'), no: t('Nein'), body: t('Schleife'), a: 'A', b: 'B', default: t('Sonst') })

const pad = (n: number): string => String(n).padStart(2, '0')

export function optionLabel(field: string, value: string): string {
  if (value.startsWith('asset:')) return field === 'SOUND' ? t('Ton: {name}', { name: value.slice(6) }) : t('Bild: {name}', { name: value.slice(6) })
  return FIELD_LABELS()[field]?.[value] ?? value
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
      return APP_VALUES()[v.what] ?? v.what
    case 'prompt':
      return t('Vorlage „{name}“', { name: v.name })
    case 'random':
      return t('Zufall {min}–{max}', { min: v.min, max: v.max })
    case 'store':
      return t('gemerkt „{key}“', { key: v.key })
    case 'calc': {
      const c = CALC().find((x) => x.op === v.op)
      if (!c) return v.op
      return c.binary ? `(${valLabel(v.a)} ${c.sym} ${valLabel(v.b)})` : `${c.sym}(${valLabel(v.a)})`
    }
    case 'list': {
      if (v.op === 'item') return `${v.name}[${valLabel(v.arg)}]`
      if (v.op === 'length') return t('Anzahl in {name}', { name: v.name })
      if (v.op === 'contains') return t('{name} enthält {value}', { name: v.name, value: valLabel(v.arg) })
      return t('{op} aus {name}', { op: LIST_OPS().find((x) => x.op === v.op)?.label ?? v.op, name: v.name })
    }
  }
}

export function condLabel(c: Cond | undefined): string {
  if (!c || !c.items.length) return t('immer')
  return c.items.map((i) => `${valLabel(i.a)} ${OPS.find(([k]) => k === i.op)?.[1] ?? i.op} ${valLabel(i.b)}`).join(c.join === 'OR' ? ` ${t('oder')} ` : ` ${t('und')} `)
}

/** Untertitel einer Knotenkarte, z. B. „Strg + Alt + T“ oder „Musik → 50 %“. */
export function summarize(d: FlowNodeData): string {
  const f = d.fields
  const v = (k: string): string => valLabel(d.values[k])
  const unit = (k: string, u: string): string => (d.values[k]?.k === 'num' ? `${v(k)} ${u}` : v(k))
  switch (d.type) {
    case 'vd_on_hotkey':
      return t('Strg + Alt + {key}', { key: String(f.KEY) })
    case 'vd_on_time':
      return t('täglich um {time}', { time: `${pad(Number(f.HOUR))}:${pad(Number(f.MINUTE))}` })
    case 'vd_on_interval':
      return t('alle {n} Minuten', { n: String(f.MINUTES) })
    case 'vd_on_focus':
      return optionLabel('PHASE', String(f.PHASE))
    case 'vd_on_start':
      return t('beim Öffnen')
    case 'vd_on_session_waiting':
      return t('braucht deine Antwort')
    case 'vd_on_session_done':
      return t('Aufgabe erledigt')
    case 'vd_on_signal':
      return `„${f.NAME}“`
    case 'vd_on_file_changed':
      return String(f.PATTERN ?? '').trim() || t('jede Datei')
    case 'vd_on_tool':
      return optionLabel('TOOL', String(f.TOOL))
    case 'vd_on_commit':
      return t('neuer Commit')
    case 'vd_on_preview_error':
      return t('Konsolenfehler')
    case 'vd_on_command':
      return t('Strg+K → Makro: {name}', { name: String(f.NAME) })
    case 'vd_claude_start':
      return String(f.PROJECT ?? '').trim() || t('Projekt im Vordergrund')
    case 'vd_claude_send':
      return `${v('TEXT')}${f.AWAIT === 'TRUE' ? ` · ${t('wartet')}` : ''}`
    case 'vd_claude_wait':
      return t('höchstens {time}', { time: unit('TIMEOUT', 'min') })
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
      return t('{channel} → {value} in {time}', { channel: optionLabel('CHANNEL', String(f.CHANNEL)), value: unit('VALUE', '%'), time: unit('SECONDS', 's') })
    case 'vd_music_onoff':
      return t('Musik {state}', { state: optionLabel('ON', String(f.ON)) })
    case 'vd_focus':
      return optionLabel('CMD', String(f.CMD))
    case 'vd_wait': {
      const s = d.values.SECONDS
      return s?.k === 'num' ? (s.v === 1 ? t('{n} Sekunde', { n: s.v }) : t('{n} Sekunden', { n: s.v })) : v('SECONDS')
    }
    case 'controls_repeat_ext':
      return d.values.TIMES?.k === 'num' ? `${v('TIMES')} ×` : t('{n} mal', { n: v('TIMES') })
    case 'vd_forever':
      return t('immer wieder')
    case 'controls_if':
      return condLabel(d.cond)
    case 'vd_switch':
      return `${v('VALUE')}: ${(d.cases ?? []).join(' · ')}`
    case 'vd_wait_until':
      return `${condLabel(d.cond)} · ${t('max. {time}', { time: unit('TIMEOUT', 's') })}`
    case 'vd_gate':
      return t('höchstens alle {time}', { time: unit('SECONDS', 's') })
    case 'vd_parallel':
      return t('A und B zugleich')
    case 'vd_emit':
      return f.WAIT === 'TRUE' ? t('„{name}“ und warten', { name: String(f.NAME) }) : `„${f.NAME}“`
    case 'variables_set':
      return `${d.varName} = ${v('VALUE')}`
    case 'math_change':
      return `${d.varName} + ${v('DELTA')}`
    case 'vd_store_set':
      return `${f.KEY} = ${v('VALUE')}`
    case 'vd_list_add':
      return `${d.varName} ← ${v('VALUE')}`
    case 'vd_list_clear':
      return t('{name} leeren', { name: String(d.varName) })
    case 'vd_show_notice':
    case 'vd_copy_text':
    case 'vd_ask':
      return v('TEXT')
    default:
      return KINDS[d.type]?.desc ?? ''
  }
}
