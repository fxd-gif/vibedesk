// Baustein-Katalog für Addons: die einzige Wahrheit darüber, welche Blöcke es gibt.
// Codec, Prüfung, Interpreter und Blockly-Definitionen bauen darauf auf.

export type Capability = 'scene' | 'rain' | 'audio' | 'sound' | 'notice' | 'ask' | 'focus' | 'clipboard' | 'hotkey' | 'schedule' | 'storage' | 'claude'

export const CAPABILITY_LABELS: Record<Capability, string> = {
  scene: 'wechselt die Szene',
  rain: 'ändert den Regen',
  audio: 'ändert Lautstärken und Musik',
  sound: 'spielt Töne ab',
  notice: 'zeigt Hinweise an',
  ask: 'stellt Fragen mit Knöpfen',
  focus: 'steuert den Fokus-Timer',
  clipboard: 'kopiert Text in die Zwischenablage',
  hotkey: 'reagiert auf Tastenkürzel',
  schedule: 'läuft zeitgesteuert',
  storage: 'merkt sich Werte dauerhaft',
  claude: 'steuert Claude: öffnet Sessions und schickt Prompts'
}

export type FieldSpec =
  | { kind: 'enum'; options: string[] }
  | { kind: 'int'; min: number; max: number }
  | { kind: 'asset'; assetKind: 'image' | 'sound'; builtins: string[] }
  | { kind: 'text'; maxLen: number }
  | { kind: 'number' }
  | { kind: 'variable' }
  | { kind: 'bool' }

export interface BlockSpec {
  type: string
  category: 'event' | 'action' | 'logic' | 'value'
  /** Feldnamen mit „*“ am Ende stehen für nummerierte Felder (V0, V1, …) */
  fields: Record<string, FieldSpec>
  /** Werte-Eingaben */
  inputs: string[]
  /** Anweisungs-Eingaben (Blockstapel) */
  statements: string[]
  capability?: Capability | Capability[]
}

/** Höchstzahl nummerierter Felder/Eingaben (V0…V19, CASE0…CASE19, IF0…, ADD0…) */
export const MAX_NUMBERED = 20

export interface BlocklyBlock {
  type: string
  id?: string
  x?: number
  y?: number
  fields?: Record<string, unknown>
  inputs?: Record<string, { block?: BlocklyBlock; shadow?: BlocklyBlock }>
  next?: { block?: BlocklyBlock }
  extraState?: unknown
}

export interface BlocklyProgram {
  blocks?: { languageVersion: 0; blocks: BlocklyBlock[] }
  variables?: { name: string; id: string }[]
}

export const BUILTIN_SCENES = ['city', 'forest', 'tokyo']
// Ohne Q, E, M, 2, 3, 7, 8, 9, 0: Strg+Alt ist auf deutschen Tastaturen AltGr (@, €, µ, ², ³, {, [, ], })
const KEYS = [...'ABCDFGHIJKLNOPRSTUVWXYZ1456']
const OPS_COMPARE = ['EQ', 'NEQ', 'LT', 'LTE', 'GT', 'GTE']
const OPS_MATH = ['ADD', 'MINUS', 'MULTIPLY', 'DIVIDE', 'POWER']
export const QUERY_KEYS = [
  'scene',
  'rain',
  'music_volume',
  'rain_volume',
  'focus_phase',
  'waiting_sessions',
  'hour',
  'minute',
  // Sessions & Kosten
  'sessions_running',
  'tokens_today',
  'cost_today',
  'session_minutes',
  'event_project',
  // Zeit
  'weekday',
  'day',
  'month',
  'year',
  'unix',
  'uptime_minutes',
  // Claude
  'claude_status'
]
export const CALC_OPS = ['add', 'sub', 'mul', 'div', 'mod', 'pow', 'min', 'max', 'round', 'floor', 'ceil', 'abs', 'sqrt', 'sin', 'cos', 'join', 'upper', 'lower', 'length', 'contains', 'trim']
export const LIST_OPS = ['length', 'random', 'first', 'last', 'item', 'contains', 'join']
const NAME = { kind: 'text', maxLen: 40 } as const

const list: BlockSpec[] = []
const def = (type: string, category: BlockSpec['category'], o: Partial<Omit<BlockSpec, 'type' | 'category'>> = {}): void => {
  list.push({ type, category, fields: {}, inputs: [], statements: [], ...o })
}
const ev = (type: string, fields: Record<string, FieldSpec> = {}, capability?: Capability): void =>
  def(type, 'event', { fields, statements: ['DO'], capability })

// Ereignisse
ev('vd_on_start')
ev('vd_on_session_waiting')
ev('vd_on_session_done')
ev('vd_on_focus', { PHASE: { kind: 'enum', options: ['work', 'break', 'end'] } })
ev('vd_on_time', { HOUR: { kind: 'int', min: 0, max: 23 }, MINUTE: { kind: 'int', min: 0, max: 59 } }, 'schedule')
ev('vd_on_hotkey', { KEY: { kind: 'enum', options: KEYS } }, 'hotkey')
ev('vd_on_interval', { MINUTES: { kind: 'int', min: 1, max: 1440 } }, 'schedule')

// Aktionen
def('vd_set_scene', 'action', { fields: { SCENE: { kind: 'asset', assetKind: 'image', builtins: BUILTIN_SCENES } }, capability: 'scene' })
def('vd_set_rain', 'action', { inputs: ['VALUE'], capability: 'rain' })
def('vd_change_rain', 'action', { inputs: ['DELTA'], capability: 'rain' })
def('vd_set_volume', 'action', { fields: { CHANNEL: { kind: 'enum', options: ['music', 'rain'] } }, inputs: ['VALUE'], capability: 'audio' })
def('vd_music_onoff', 'action', { fields: { ON: { kind: 'bool' } }, capability: 'audio' })
def('vd_play_sound', 'action', { fields: { SOUND: { kind: 'asset', assetKind: 'sound', builtins: ['chime'] } }, capability: 'sound' })
def('vd_show_notice', 'action', { inputs: ['TEXT'], capability: 'notice' })
def('vd_focus', 'action', { fields: { CMD: { kind: 'enum', options: ['start', 'stop'] } }, capability: 'focus' })
def('vd_copy_text', 'action', { inputs: ['TEXT'], capability: 'clipboard' })
def('vd_wait', 'action', { inputs: ['SECONDS'] })
def('vd_forever', 'action', { statements: ['DO'] })

// Standard-Erweiterungen
def('vd_switch', 'logic', { fields: { 'V*': { kind: 'text', maxLen: 100 } }, inputs: ['VALUE'], statements: ['CASE*', 'DEFAULT'] })
def('vd_store_set', 'action', { fields: { KEY: NAME }, inputs: ['VALUE'], capability: 'storage' })
def('vd_fade', 'action', { fields: { CHANNEL: { kind: 'enum', options: ['rain', 'music', 'rain_volume'] } }, inputs: ['VALUE', 'SECONDS'], capability: ['rain', 'audio'] })
def('vd_ask', 'action', { fields: { YES_LABEL: { kind: 'text', maxLen: 24 }, NO_LABEL: { kind: 'text', maxLen: 24 } }, inputs: ['TEXT'], statements: ['DO_YES', 'DO_NO'], capability: 'ask' })

// Erweitert
ev('vd_on_signal', { NAME })
def('vd_emit', 'action', { fields: { NAME, WAIT: { kind: 'bool' } } })
def('vd_parallel', 'logic', { statements: ['A', 'B'] })
def('vd_wait_until', 'logic', { inputs: ['COND', 'TIMEOUT'] })
def('vd_gate', 'logic', { inputs: ['SECONDS'] })
def('vd_list_add', 'action', { fields: { VAR: { kind: 'variable' } }, inputs: ['VALUE'] })
def('vd_list_clear', 'action', { fields: { VAR: { kind: 'variable' } } })
def('vd_list_get', 'value', { fields: { VAR: { kind: 'variable' }, OP: { kind: 'enum', options: LIST_OPS } }, inputs: ['ARG'] })
def('vd_calc', 'value', { fields: { OP: { kind: 'enum', options: CALC_OPS } }, inputs: ['A', 'B'] })
def('vd_store_get', 'value', { fields: { KEY: NAME }, capability: 'storage' })

// Claude – Makros
ev('vd_on_command', { NAME: { kind: 'text', maxLen: 40 } })
def('vd_claude_start', 'action', { fields: { PROJECT: { kind: 'text', maxLen: 80 } }, capability: 'claude' })
def('vd_claude_send', 'action', { fields: { AWAIT: { kind: 'bool' } }, inputs: ['TEXT'], capability: 'claude' })
def('vd_claude_wait', 'logic', { inputs: ['TIMEOUT'], capability: 'claude' })

// Werte
def('vd_get', 'value', { fields: { WHAT: { kind: 'enum', options: QUERY_KEYS } } })
def('vd_prompt_text', 'value', { fields: { NAME: { kind: 'text', maxLen: 60 } } })

// Blockly-Standardblöcke (nur diese sind erlaubt)
def('controls_if', 'logic', { inputs: ['IF*'], statements: ['DO*', 'ELSE'] })
def('controls_repeat_ext', 'logic', { inputs: ['TIMES'], statements: ['DO'] })
def('logic_compare', 'logic', { fields: { OP: { kind: 'enum', options: OPS_COMPARE } }, inputs: ['A', 'B'] })
def('logic_operation', 'logic', { fields: { OP: { kind: 'enum', options: ['AND', 'OR'] } }, inputs: ['A', 'B'] })
def('logic_negate', 'logic', { inputs: ['BOOL'] })
def('logic_boolean', 'logic', { fields: { BOOL: { kind: 'enum', options: ['TRUE', 'FALSE'] } } })
def('math_number', 'value', { fields: { NUM: { kind: 'number' } } })
def('math_arithmetic', 'value', { fields: { OP: { kind: 'enum', options: OPS_MATH } }, inputs: ['A', 'B'] })
def('math_random_int', 'value', { inputs: ['FROM', 'TO'] })
def('text', 'value', { fields: { TEXT: { kind: 'text', maxLen: 5000 } } })
def('text_join', 'value', { inputs: ['ADD*'] })
def('variables_get', 'value', { fields: { VAR: { kind: 'variable' } } })
def('variables_set', 'logic', { fields: { VAR: { kind: 'variable' } }, inputs: ['VALUE'] })
def('math_change', 'logic', { fields: { VAR: { kind: 'variable' } }, inputs: ['DELTA'] })

export const BLOCKS: Record<string, BlockSpec> = Object.fromEntries(list.map((b) => [b.type, b]))

/** Besucht jeden Block: erst den Block selbst, dann seine Eingaben (Tiefe + 1), dann den nächsten im Stapel (gleiche Tiefe). */
export function walkBlocks(program: BlocklyProgram, fn: (b: BlocklyBlock, depth: number) => void): void {
  const visit = (start: BlocklyBlock | undefined, depth: number): void => {
    for (let b = start; b; b = b.next?.block) {
      fn(b, depth)
      for (const inp of Object.values(b.inputs ?? {})) visit(inp.block ?? inp.shadow, depth + 1)
    }
  }
  for (const top of program.blocks?.blocks ?? []) visit(top, 0)
}

export function capabilitiesOf(program: BlocklyProgram): Capability[] {
  const caps = new Set<Capability>()
  walkBlocks(program, (b) => {
    const c = Object.hasOwn(BLOCKS, b.type) ? BLOCKS[b.type].capability : undefined
    for (const x of Array.isArray(c) ? c : c ? [c] : []) caps.add(x)
  })
  return [...caps].sort()
}
