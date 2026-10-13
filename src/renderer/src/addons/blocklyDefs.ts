// Blockly-Definitionen (deutsche Texte, Farben, Toolbox) aus dem Baustein-Katalog.
// Reine Daten – kein Blockly-Import, damit ohne DOM testbar.
import { BLOCKS, type BlockSpec } from '../../../shared/addonBlocks'

export interface AssetSource {
  images(): string[]
  sounds(): string[]
  prompts(): string[]
}

/** Kategorie → Blockly-Stil (definiert im Theme in blocklySetup.ts) */
export const STYLES = { event: 'vd_event', action: 'vd_action', logic: 'vd_logic', value: 'vd_value', variable: 'vd_variable' } as const

/** Glas-Palette: dunkel getönte Fläche, helle Kontur in Akzentfarbe (passend zu --accent #9fb8ff) */
export const PALETTE = {
  vd_event: { fill: '#3a3122', field: '#4a3f2c', line: '#e8c27a' },
  vd_action: { fill: '#232d4a', field: '#2f3a5c', line: '#9fb8ff' },
  vd_logic: { fill: '#1f3631', field: '#29443d', line: '#86d4b4' },
  vd_value: { fill: '#31284a', field: '#3d3259', line: '#c9a8f2' },
  vd_variable: { fill: '#3a2c24', field: '#48382e', line: '#e9ae86' }
}

export const COLORS = {
  event: PALETTE.vd_event.line,
  action: PALETTE.vd_action.line,
  logic: PALETTE.vd_logic.line,
  value: PALETTE.vd_value.line,
  variable: PALETTE.vd_variable.line
}

type Options = [string, string][]

const LABELS: Record<string, Record<string, string>> = {
  PHASE: { work: 'Fokus beginnt', break: 'Pause beginnt', end: 'endet' },
  CHANNEL: { music: 'Musik', rain: 'Regen' },
  ON: { TRUE: 'an', FALSE: 'aus' },
  CMD: { start: 'starten', stop: 'stoppen' },
  SCENE: { city: 'Stadt bei Nacht', forest: 'Wald in der Dämmerung', tokyo: 'Tokio-Gasse' },
  SOUND: { chime: 'Gong' },
  WHAT: {
    scene: 'Szene',
    rain: 'Regenstärke',
    music_volume: 'Lautstärke Musik',
    rain_volume: 'Lautstärke Regen',
    focus_phase: 'Fokus-Phase',
    waiting_sessions: 'wartende Sessions',
    hour: 'Stunde',
    minute: 'Minute'
  }
}

/** Satz je Block; %1, %2 … stehen für Felder und Werte-Eingaben in dieser Reihenfolge. */
const TEXT: Record<string, { msg: string; order: string[]; label?: string }> = {
  vd_on_start: { msg: 'wenn VibeDesk startet', order: [] },
  vd_on_session_waiting: { msg: 'wenn eine Session auf mich wartet', order: [] },
  vd_on_session_done: { msg: 'wenn eine Session fertig ist', order: [] },
  vd_on_focus: { msg: 'wenn der Fokus-Timer: %1', order: ['PHASE'] },
  vd_on_time: { msg: 'täglich um %1 : %2 Uhr', order: ['HOUR', 'MINUTE'] },
  vd_on_hotkey: { msg: 'wenn Strg + Alt + %1 gedrückt wird', order: ['KEY'] },
  vd_on_interval: { msg: 'alle %1 Minuten', order: ['MINUTES'] },
  vd_set_scene: { msg: 'wechsle zur Szene %1', order: ['SCENE'] },
  vd_set_rain: { msg: 'setze Regen auf %1 %', order: ['VALUE'] },
  vd_change_rain: { msg: 'ändere Regen um %1', order: ['DELTA'] },
  vd_set_volume: { msg: 'setze Lautstärke %1 auf %2 %', order: ['CHANNEL', 'VALUE'] },
  vd_music_onoff: { msg: 'Musik %1', order: ['ON'] },
  vd_play_sound: { msg: 'spiele Ton %1', order: ['SOUND'] },
  vd_show_notice: { msg: 'zeige Hinweis %1', order: ['TEXT'] },
  vd_focus: { msg: 'Fokus-Timer %1', order: ['CMD'] },
  vd_copy_text: { msg: 'kopiere %1 in die Zwischenablage', order: ['TEXT'] },
  vd_wait: { msg: 'warte %1 Sekunden', order: ['SECONDS'] },
  vd_forever: { msg: 'wiederhole fortlaufend', order: [] },
  vd_get: { msg: '%1', order: ['WHAT'] },
  vd_prompt_text: { msg: 'Prompt-Vorlage %1', order: ['NAME'] }
}

const INPUT_CHECK: Record<string, string | undefined> = { VALUE: 'Number', DELTA: 'Number', SECONDS: 'Number', TEXT: undefined }

const label = (field: string, v: string): string => LABELS[field]?.[v] ?? v

function fieldArg(spec: BlockSpec, name: string, src: AssetSource): Record<string, unknown> {
  const f = spec.fields[name]
  switch (f.kind) {
    case 'enum':
      return { type: 'field_dropdown', name, options: f.options.map((o) => [label(name, o), o]) }
    case 'int':
      return { type: 'field_number', name, value: f.min, min: f.min, max: f.max, precision: 1 }
    case 'bool':
      return { type: 'field_dropdown', name, options: [['an', 'TRUE'], ['aus', 'FALSE']] }
    case 'asset': {
      const list = f.assetKind === 'image' ? src.images : src.sounds
      const prefix = f.assetKind === 'image' ? 'Bild' : 'Ton'
      return {
        type: 'field_dropdown',
        name,
        options: (): Options => [...f.builtins.map((b): [string, string] => [label(name, b), b]), ...list().map((a): [string, string] => [`${prefix}: ${a}`, `asset:${a}`])]
      }
    }
    case 'text':
      // einziges Textfeld eines vd-Blocks: Name einer Prompt-Vorlage aus dem Addon
      return {
        type: 'field_dropdown',
        name,
        options: (): Options => {
          const p = src.prompts()
          return p.length ? p.map((x): [string, string] => [x, x]) : [['(keine Vorlage)', '']]
        }
      }
    default:
      return { type: 'field_input', name, text: '' }
  }
}

export function blockJson(spec: BlockSpec, src: AssetSource): object {
  const t = TEXT[spec.type]
  const style = spec.type === 'vd_wait' || spec.type === 'vd_forever' ? STYLES.logic : STYLES[spec.category]
  const args0 = t.order.map((name) =>
    name in spec.fields ? fieldArg(spec, name, src) : { type: 'input_value', name, ...(INPUT_CHECK[name] ? { check: INPUT_CHECK[name] } : {}) }
  )
  const json: Record<string, unknown> = { type: spec.type, message0: t.msg, args0, style, inputsInline: true }
  if (spec.statements.length) {
    json.message1 = '%1'
    json.args1 = [{ type: 'input_statement', name: spec.statements[0] }]
  }
  if (spec.category === 'value') {
    json.output = spec.type === 'vd_prompt_text' ? 'String' : null
  } else if (spec.category !== 'event') {
    json.previousStatement = null
    if (spec.type !== 'vd_forever') json.nextStatement = null
  }
  return json
}

const num = (n: number): object => ({ shadow: { type: 'math_number', fields: { NUM: n } } })
const txt = (s: string): object => ({ shadow: { type: 'text', fields: { TEXT: s } } })
const block = (type: string, inputs?: Record<string, object>): object => ({ kind: 'block', type, ...(inputs ? { inputs } : {}) })

export function toolbox(): object {
  return {
    kind: 'categoryToolbox',
    contents: [
      {
        kind: 'category',
        name: 'Ereignisse',
        colour: COLORS.event,
        contents: ['vd_on_start', 'vd_on_session_waiting', 'vd_on_session_done', 'vd_on_focus', 'vd_on_time', 'vd_on_hotkey', 'vd_on_interval'].map((t) => block(t))
      },
      {
        kind: 'category',
        name: 'Aktionen',
        colour: COLORS.action,
        contents: [
          block('vd_set_scene'),
          block('vd_set_rain', { VALUE: num(60) }),
          block('vd_change_rain', { DELTA: num(10) }),
          block('vd_set_volume', { VALUE: num(50) }),
          block('vd_music_onoff'),
          block('vd_play_sound'),
          block('vd_show_notice', { TEXT: txt('Zeit für eine Pause!') }),
          block('vd_focus'),
          block('vd_copy_text', { TEXT: txt('') })
        ]
      },
      {
        kind: 'category',
        name: 'Steuerung',
        colour: COLORS.logic,
        contents: [
          block('vd_wait', { SECONDS: num(1) }),
          block('controls_repeat_ext', { TIMES: num(3) }),
          block('vd_forever'),
          block('controls_if'),
          block('logic_compare'),
          block('logic_operation'),
          block('logic_negate'),
          block('logic_boolean')
        ]
      },
      {
        kind: 'category',
        name: 'Werte',
        colour: COLORS.value,
        contents: [
          block('vd_get'),
          block('vd_prompt_text'),
          block('math_number'),
          block('math_arithmetic', { A: num(1), B: num(1) }),
          block('math_random_int', { FROM: num(1), TO: num(10) }),
          block('text'),
          block('text_join')
        ]
      },
      { kind: 'category', name: 'Variablen', colour: COLORS.variable, custom: 'VARIABLE' }
    ]
  }
}

export const VD_BLOCKS = Object.values(BLOCKS).filter((b) => b.type.startsWith('vd_'))
