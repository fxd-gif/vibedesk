// Flowchart-Modell des Addon-Makers: Knoten + Verbindungen ↔ BlocklyProgram (das Format, das Prüfung und Interpreter kennen).
// Rein und ohne UI-Abhängigkeiten, damit testbar.
import { BLOCKS, type BlocklyBlock, type BlocklyProgram } from '../../../shared/addonBlocks'

/** Ausgänge: next (weiter), yes/no (Wenn, Frage), body (Schleife), a/b (Gleichzeitig), caseN/default (Je nach Wert) */
export type Handle = string
export type Category = 'trigger' | 'action' | 'logic' | 'tool' | 'advanced'

export type Val =
  | { k: 'num'; v: number }
  | { k: 'text'; v: string }
  | { k: 'var'; name: string }
  | { k: 'app'; what: string }
  | { k: 'prompt'; name: string }
  | { k: 'random'; min: number; max: number }
  | { k: 'store'; key: string }
  | { k: 'calc'; op: string; a: Val; b?: Val }
  | { k: 'list'; name: string; op: string; arg?: Val }

export interface Cmp {
  a: Val
  op: string
  b: Val
}

export interface Cond {
  join: 'AND' | 'OR'
  items: Cmp[]
}

export interface FlowNodeData {
  type: string
  fields: Record<string, string | number>
  values: Record<string, Val>
  cond?: Cond
  varName?: string
  /** Fälle bei „Je nach Wert“ */
  cases?: string[]
  [key: string]: unknown
}

export interface FlowNode {
  id: string
  position: { x: number; y: number }
  data: FlowNodeData
}

export interface FlowEdge {
  id: string
  source: string
  sourceHandle: Handle
  target: string
}

export interface ValueSetting {
  key: string
  label: string
  /** welche Wertarten angeboten werden: Zahl, Text oder beides */
  type: 'num' | 'text' | 'any'
  unit?: string
}

export interface KindDef {
  label: string
  desc: string
  category: Category
  icon: string
  outputs: Handle[]
  values: ValueSetting[]
  defaults: { fields?: Record<string, string | number>; values?: Record<string, Val>; cond?: Cond; varName?: string; cases?: string[] }
}

const num = (v: number): Val => ({ k: 'num', v })
const txt = (v: string): Val => ({ k: 'text', v })
const hourCond = (): Cond => ({ join: 'AND', items: [{ a: { k: 'app', what: 'hour' }, op: 'GTE', b: num(22) }] })

const trig = (label: string, desc: string, icon: string, fields?: Record<string, string | number>, category: Category = 'trigger'): KindDef => ({
  label,
  desc,
  category,
  icon,
  outputs: ['next'],
  values: [],
  defaults: { fields }
})
const act = (label: string, desc: string, icon: string, category: Category, values: ValueSetting[] = [], defaults: KindDef['defaults'] = {}, outputs: Handle[] = ['next']): KindDef => ({
  label,
  desc,
  category,
  icon,
  outputs,
  values,
  defaults
})

export const KINDS: Record<string, KindDef> = {
  vd_on_start: trig('VibeDesk startet', 'Läuft einmal, sobald VibeDesk (oder das Addon) startet.', 'power'),
  vd_on_session_waiting: trig('Session wartet', 'Eine Claude-Session wartet auf deine Antwort.', 'hourglass'),
  vd_on_session_done: trig('Session fertig', 'Eine Claude-Session ist mit ihrer Aufgabe fertig.', 'check'),
  vd_on_focus: trig('Fokus-Timer', 'Reagiert auf Fokus-Beginn, Pause oder Ende.', 'timer', { PHASE: 'work' }),
  vd_on_time: trig('Uhrzeit', 'Jeden Tag zu einer festen Uhrzeit.', 'clock', { HOUR: 22, MINUTE: 0 }),
  vd_on_hotkey: trig('Tastenkürzel', 'Wenn du Strg + Alt + Taste drückst.', 'keyboard', { KEY: 'T' }),
  vd_on_interval: trig('Intervall', 'Wiederholt sich alle paar Minuten.', 'repeat', { MINUTES: 30 }),

  vd_set_scene: act('Szene wechseln', 'Wechselt das Bild hinter der Scheibe.', 'image', 'action', [], { fields: { SCENE: 'city' } }),
  vd_set_rain: act('Regen setzen', 'Stellt die Regenstärke ein.', 'rain', 'action', [{ key: 'VALUE', label: 'Stärke', type: 'num', unit: '%' }], { values: { VALUE: num(60) } }),
  vd_change_rain: act('Regen ändern', 'Macht den Regen stärker oder schwächer.', 'rain', 'action', [{ key: 'DELTA', label: 'Änderung', type: 'num', unit: '%' }], { values: { DELTA: num(10) } }),
  vd_fade: act(
    'Überblenden',
    'Fährt Regen oder Lautstärke sanft auf einen Zielwert.',
    'fade',
    'action',
    [
      { key: 'VALUE', label: 'Ziel', type: 'num', unit: '%' },
      { key: 'SECONDS', label: 'Dauer', type: 'num', unit: 's' }
    ],
    { fields: { CHANNEL: 'rain' }, values: { VALUE: num(80), SECONDS: num(10) } }
  ),
  vd_set_volume: act('Lautstärke', 'Stellt die Lautstärke von Musik oder Regen ein.', 'volume', 'action', [{ key: 'VALUE', label: 'Lautstärke', type: 'num', unit: '%' }], {
    fields: { CHANNEL: 'music' },
    values: { VALUE: num(50) }
  }),
  vd_music_onoff: act('Musik an/aus', 'Schaltet das Lofi-Radio ein oder aus.', 'music', 'action', [], { fields: { ON: 'TRUE' } }),
  vd_play_sound: act('Ton abspielen', 'Spielt den Gong oder einen eigenen Ton.', 'bell', 'action', [], { fields: { SOUND: 'chime' } }),
  vd_focus: act('Fokus-Timer', 'Startet oder stoppt den Fokus-Timer.', 'timer', 'action', [], { fields: { CMD: 'start' } }),

  controls_if: act('Wenn / Sonst', 'Verzweigt je nachdem, ob die Bedingung stimmt.', 'branch', 'logic', [], { cond: hourCond() }, ['yes', 'no']),
  vd_switch: act('Je nach Wert', 'Ein Ausgang pro Fall – ideal für Wochentage, Stunden oder Zähler.', 'switch', 'logic', [{ key: 'VALUE', label: 'Wert', type: 'any' }], {
    values: { VALUE: { k: 'app', what: 'weekday' } },
    cases: ['1', '6', '7']
  }),
  controls_repeat_ext: act('Wiederholen', 'Führt den Schleifen-Zweig mehrmals aus, danach geht es weiter.', 'repeat', 'logic', [{ key: 'TIMES', label: 'Wie oft', type: 'num', unit: '×' }], { values: { TIMES: num(3) } }, [
    'body',
    'next'
  ]),
  vd_forever: act('Endlos', 'Wiederholt den Schleifen-Zweig immer wieder (mind. 0,1 s pro Runde).', 'infinity', 'logic', [], {}, ['body']),
  vd_wait: act('Warten', 'Pausiert, bevor es weitergeht.', 'clock', 'logic', [{ key: 'SECONDS', label: 'Dauer', type: 'num', unit: 's' }], { values: { SECONDS: num(1) } }),
  variables_set: act('Variable setzen', 'Merkt sich einen Wert unter einem Namen.', 'variable', 'logic', [{ key: 'VALUE', label: 'Wert', type: 'any' }], { varName: 'zähler', values: { VALUE: num(0) } }),
  math_change: act('Variable ändern', 'Zählt eine Variable hoch oder runter.', 'variable', 'logic', [{ key: 'DELTA', label: 'Um', type: 'num' }], { varName: 'zähler', values: { DELTA: num(1) } }),
  vd_store_set: act('Dauerhaft merken', 'Speichert einen Wert, der auch einen Neustart überlebt.', 'save', 'logic', [{ key: 'VALUE', label: 'Wert', type: 'any' }], {
    fields: { KEY: 'zähler' },
    values: { VALUE: num(0) }
  }),

  vd_show_notice: act('Hinweis', 'Zeigt einen kurzen Hinweis oben im Bild.', 'message', 'tool', [{ key: 'TEXT', label: 'Text', type: 'text' }], { values: { TEXT: txt('Zeit für eine Pause!') } }),
  vd_ask: act(
    'Frage',
    'Fragt dich mit zwei Knöpfen – je nach Antwort geht es anders weiter.',
    'ask',
    'tool',
    [{ key: 'TEXT', label: 'Frage', type: 'text' }],
    { fields: { YES_LABEL: 'Ja', NO_LABEL: 'Später' }, values: { TEXT: txt('Kurze Pause machen?') } },
    ['yes', 'no']
  ),
  vd_copy_text: act('Zwischenablage', 'Kopiert Text, z. B. eine Prompt-Vorlage.', 'clipboard', 'tool', [{ key: 'TEXT', label: 'Text', type: 'text' }], { values: { TEXT: txt('') } }),

  vd_on_signal: trig('Signal empfangen', 'Startet, wenn irgendwo im Addon dieses Signal gesendet wird.', 'radio', { NAME: 'mein-signal' }, 'advanced'),
  vd_emit: act('Signal senden', 'Löst alle „Signal empfangen“ mit diesem Namen aus – optional wartend wie ein Unterprogramm.', 'send', 'advanced', [], {
    fields: { NAME: 'mein-signal', WAIT: 'FALSE' }
  }),
  vd_parallel: act('Gleichzeitig', 'Startet zwei Zweige parallel; „Danach“ läuft, wenn beide fertig sind.', 'parallel', 'advanced', [], {}, ['a', 'b', 'next']),
  vd_wait_until: act('Warten bis', 'Wartet, bis die Bedingung stimmt – höchstens bis zum Zeitlimit.', 'hourglass', 'advanced', [{ key: 'TIMEOUT', label: 'Höchstens', type: 'num', unit: 's' }], {
    cond: { join: 'AND', items: [{ a: { k: 'app', what: 'waiting_sessions' }, op: 'EQ', b: num(0) }] },
    values: { TIMEOUT: num(300) }
  }),
  vd_gate: act('Drossel', 'Lässt den Ablauf nur alle X Sekunden durch – sonst endet er hier.', 'gate', 'advanced', [{ key: 'SECONDS', label: 'Höchstens alle', type: 'num', unit: 's' }], {
    values: { SECONDS: num(60) }
  }),
  vd_list_add: act('Zur Liste hinzufügen', 'Hängt einen Wert an eine Liste an (max. 500 Einträge).', 'list', 'advanced', [{ key: 'VALUE', label: 'Wert', type: 'any' }], {
    varName: 'liste',
    values: { VALUE: txt('') }
  }),
  vd_list_clear: act('Liste leeren', 'Entfernt alle Einträge einer Liste.', 'list', 'advanced', [], { varName: 'liste' })
}

export const CATEGORY_LABELS: Record<Category, string> = { trigger: 'Auslöser', action: 'Aktionen', logic: 'Logik', tool: 'Werkzeuge', advanced: 'Erweitert' }

export const isTrigger = (type: string): boolean => BLOCKS[type]?.category === 'event'

/** Welche Ausgänge hat dieser Knoten? Bei „Je nach Wert“ einer pro Fall plus „Sonst“. */
export function outputsOf(d: FlowNodeData): Handle[] {
  if (d.type === 'vd_switch') return [...(d.cases ?? []).map((_, i) => `case${i}`), 'default']
  return KINDS[d.type].outputs
}

/** Ausgang → Anweisungs-Eingabe im Programm (null = Verkettung über „next“) */
function stmtInput(type: string, h: Handle): string | null {
  if (isTrigger(type)) return h === 'next' ? 'DO' : null
  const m = /^case(\d+)$/.exec(h)
  if (m) return `CASE${m[1]}`
  const map: Record<string, Record<string, string>> = {
    controls_if: { yes: 'DO0', no: 'ELSE' },
    vd_ask: { yes: 'DO_YES', no: 'DO_NO' },
    vd_switch: { default: 'DEFAULT' },
    vd_parallel: { a: 'A', b: 'B' },
    controls_repeat_ext: { body: 'DO' },
    vd_forever: { body: 'DO' }
  }
  return map[type]?.[h] ?? null
}

let seq = 0
export function newNode(type: string, position: { x: number; y: number }, id = `n${Date.now().toString(36)}${(seq++).toString(36)}`): FlowNode {
  const d = KINDS[type].defaults
  const data: FlowNodeData = { type, fields: { ...(d.fields ?? {}) }, values: structuredClone(d.values ?? {}) }
  if (d.cond) data.cond = structuredClone(d.cond)
  if (d.varName !== undefined) data.varName = d.varName
  if (d.cases) data.cases = [...d.cases]
  return { id, position: { ...position }, data }
}

// ---------- Werte ----------

const varId = (name: string): string => `var:${name}`
const PLACEHOLDER = /\{([^{}]{1,40})\}/g

function valToBlock(v: Val): BlocklyBlock {
  switch (v.k) {
    case 'num':
      return { type: 'math_number', fields: { NUM: v.v } }
    case 'var':
      return { type: 'variables_get', fields: { VAR: { id: varId(v.name) } } }
    case 'app':
      return { type: 'vd_get', fields: { WHAT: v.what } }
    case 'prompt':
      return { type: 'vd_prompt_text', fields: { NAME: v.name } }
    case 'store':
      return { type: 'vd_store_get', fields: { KEY: v.key } }
    case 'random':
      return { type: 'math_random_int', inputs: { FROM: { block: valToBlock(num(v.min)) }, TO: { block: valToBlock(num(v.max)) } } }
    case 'calc':
      return { type: 'vd_calc', fields: { OP: v.op }, inputs: { A: { block: valToBlock(v.a) }, ...(v.b ? { B: { block: valToBlock(v.b) } } : {}) } }
    case 'list':
      return { type: 'vd_list_get', fields: { VAR: { id: varId(v.name) }, OP: v.op }, ...(v.arg ? { inputs: { ARG: { block: valToBlock(v.arg) } } } : {}) }
    case 'text': {
      if (!v.v.match(PLACEHOLDER)) return { type: 'text', fields: { TEXT: v.v } }
      const parts: BlocklyBlock[] = []
      let last = 0
      for (const m of v.v.matchAll(PLACEHOLDER)) {
        if (m.index! > last) parts.push({ type: 'text', fields: { TEXT: v.v.slice(last, m.index) } })
        parts.push({ type: 'variables_get', fields: { VAR: { id: varId(m[1]) } } })
        last = m.index! + m[0].length
      }
      if (last < v.v.length) parts.push({ type: 'text', fields: { TEXT: v.v.slice(last) } })
      return { type: 'text_join', extraState: { itemCount: parts.length }, inputs: Object.fromEntries(parts.map((b, i) => [`ADD${i}`, { block: b }])) }
    }
  }
}

function valNames(v: Val | undefined, out: Set<string>): void {
  if (!v) return
  if (v.k === 'var' || v.k === 'list') out.add(v.name)
  if (v.k === 'text') for (const m of v.v.matchAll(PLACEHOLDER)) out.add(m[1])
  if (v.k === 'calc') {
    valNames(v.a, out)
    valNames(v.b, out)
  }
  if (v.k === 'list') valNames(v.arg, out)
}

function condToBlock(c: Cond): BlocklyBlock {
  const cmps = c.items.map(
    (i): BlocklyBlock => ({ type: 'logic_compare', fields: { OP: i.op }, inputs: { A: { block: valToBlock(i.a) }, B: { block: valToBlock(i.b) } } })
  )
  if (!cmps.length) return { type: 'logic_boolean', fields: { BOOL: 'TRUE' } }
  return cmps.reduce((acc, b) => ({ type: 'logic_operation', fields: { OP: c.join }, inputs: { A: { block: acc }, B: { block: b } } }))
}

type Names = Map<string, string>

function blockToVal(b: BlocklyBlock | undefined, names: Names): Val {
  const f = (k: string): unknown => b?.fields?.[k]
  const nameOf = (bb: BlocklyBlock): string => {
    const id = String((bb.fields?.VAR as { id?: string } | undefined)?.id ?? '')
    return names.get(id) ?? id.replace(/^var:/, '')
  }
  const inp = (k: string): BlocklyBlock | undefined => b?.inputs?.[k]?.block ?? b?.inputs?.[k]?.shadow
  switch (b?.type) {
    case 'math_number':
      return num(Number(f('NUM')) || 0)
    case 'text':
      return txt(String(f('TEXT') ?? ''))
    case 'variables_get':
      return { k: 'var', name: nameOf(b) }
    case 'vd_get':
      return { k: 'app', what: String(f('WHAT')) }
    case 'vd_prompt_text':
      return { k: 'prompt', name: String(f('NAME') ?? '') }
    case 'vd_store_get':
      return { k: 'store', key: String(f('KEY') ?? '') }
    case 'vd_calc': {
      const out: Val = { k: 'calc', op: String(f('OP')), a: blockToVal(inp('A'), names) }
      if (inp('B')) out.b = blockToVal(inp('B'), names)
      return out
    }
    case 'vd_list_get': {
      const out: Val = { k: 'list', name: nameOf(b), op: String(f('OP')) }
      if (inp('ARG')) out.arg = blockToVal(inp('ARG'), names)
      return out
    }
    case 'math_random_int': {
      const lo = blockToVal(inp('FROM'), names)
      const hi = blockToVal(inp('TO'), names)
      return { k: 'random', min: lo.k === 'num' ? lo.v : 1, max: hi.k === 'num' ? hi.v : 10 }
    }
    case 'text_join': {
      const keys = Object.keys(b.inputs ?? {})
        .filter((k) => /^ADD\d+$/.test(k))
        .sort((x, y) => Number(x.slice(3)) - Number(y.slice(3)))
      let s = ''
      for (const k of keys) {
        const part = inp(k)
        if (part?.type === 'variables_get') s += `{${nameOf(part)}}`
        else if (part?.type === 'text') s += String(part.fields?.TEXT ?? '')
      }
      return txt(s)
    }
    default:
      return num(0)
  }
}

function blockToCond(b: BlocklyBlock | undefined, names: Names): Cond {
  if (!b || b.type === 'logic_boolean') return { join: 'AND', items: [] }
  if (b.type === 'logic_operation') {
    const join = b.fields?.OP === 'OR' ? 'OR' : 'AND'
    const items: Cmp[] = []
    const walk = (x: BlocklyBlock | undefined): void => {
      if (x?.type === 'logic_operation' && x.fields?.OP === join) {
        walk(x.inputs?.A?.block)
        walk(x.inputs?.B?.block)
      } else if (x) items.push(...blockToCond(x, names).items)
    }
    walk(b)
    return { join, items }
  }
  return { join: 'AND', items: [{ a: blockToVal(b.inputs?.A?.block, names), op: String(b.fields?.OP ?? 'EQ'), b: blockToVal(b.inputs?.B?.block, names) }] }
}

// ---------- Graph → Programm ----------

export function graphToProgram(nodes: FlowNode[], edges: FlowEdge[]): BlocklyProgram {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const out = new Map<string, string>()
  for (const e of edges) out.set(`${e.source}:${e.sourceHandle}`, e.target)
  const hasInput = new Set(edges.map((e) => e.target))
  const names = new Set<string>()
  const visited = new Set<string>()

  const chain = (id: string | undefined): BlocklyBlock | undefined => {
    if (!id || visited.has(id)) return undefined
    const n = byId.get(id)
    if (!n) return undefined
    visited.add(id)
    return toBlock(n)
  }

  const toBlock = (n: FlowNode): BlocklyBlock => {
    const d = n.data
    const b: BlocklyBlock = { type: d.type, id: n.id, x: Math.round(n.position.x), y: Math.round(n.position.y) }
    const fields: Record<string, unknown> = { ...d.fields }
    const inputs: Record<string, { block: BlocklyBlock }> = {}
    for (const [k, v] of Object.entries(d.values)) {
      valNames(v, names)
      inputs[k] = { block: valToBlock(v) }
    }
    if (d.varName !== undefined) {
      names.add(d.varName)
      fields.VAR = { id: varId(d.varName) }
    }
    if (d.cond) {
      for (const i of d.cond.items) {
        valNames(i.a, names)
        valNames(i.b, names)
      }
      inputs[d.type === 'controls_if' ? 'IF0' : 'COND'] = { block: condToBlock(d.cond) }
    }
    ;(d.cases ?? []).forEach((c, i) => (fields[`V${i}`] = c))
    for (const h of outputsOf(d)) {
      const name = stmtInput(d.type, h)
      if (!name) continue
      const body = chain(out.get(`${n.id}:${h}`))
      if (body) inputs[name] = { block: body }
    }
    if (Object.keys(fields).length) b.fields = fields
    if (Object.keys(inputs).length) b.inputs = inputs
    if (!isTrigger(d.type) && outputsOf(d).includes('next')) {
      const next = chain(out.get(`${n.id}:next`))
      if (next) b.next = { block: next }
    }
    return b
  }

  const roots = nodes
    .filter((n) => !hasInput.has(n.id))
    .sort((a, b) => Number(isTrigger(b.data.type)) - Number(isTrigger(a.data.type)) || a.position.y - b.position.y || a.position.x - b.position.x)
  const blocks = roots.map((r) => chain(r.id)).filter((b): b is BlocklyBlock => !!b)
  return { blocks: { languageVersion: 0, blocks }, variables: [...names].sort().map((name) => ({ name, id: varId(name) })) }
}

// ---------- Programm → Graph ----------

export function programToGraph(program: BlocklyProgram): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const names: Names = new Map((program.variables ?? []).map((v) => [v.id, v.name]))
  const nodes: FlowNode[] = []
  const edges: FlowEdge[] = []
  let auto = 0

  const link = (source: string, handle: Handle, b: BlocklyBlock | undefined, pos: { x: number; y: number }): void => {
    if (!b) return
    const target = visit(b, { x: pos.x, y: pos.y + 140 })
    if (target) edges.push({ id: `${source}-${handle}-${target}`, source, sourceHandle: handle, target })
  }

  const visit = (b: BlocklyBlock, fallback: { x: number; y: number }): string | null => {
    const kind = KINDS[b.type]
    if (!kind) return null
    const id = b.id ?? `auto${auto++}`
    const position = { x: b.x ?? fallback.x, y: b.y ?? fallback.y }
    const data: FlowNodeData = { type: b.type, fields: {}, values: {} }
    for (const [k, v] of Object.entries(b.fields ?? {})) if (k !== 'VAR' && !/^V\d+$/.test(k)) data.fields[k] = v as string | number
    for (const vs of kind.values) data.values[vs.key] = blockToVal(b.inputs?.[vs.key]?.block ?? b.inputs?.[vs.key]?.shadow, names)
    if (kind.defaults.varName !== undefined) {
      const vid = String((b.fields?.VAR as { id?: string } | undefined)?.id ?? '')
      data.varName = names.get(vid) ?? vid.replace(/^var:/, '')
    }
    if (kind.defaults.cond) data.cond = blockToCond(b.inputs?.[b.type === 'controls_if' ? 'IF0' : 'COND']?.block, names)
    if (b.type === 'vd_switch') {
      const idx = Object.keys(b.fields ?? {})
        .map((k) => /^V(\d+)$/.exec(k)?.[1])
        .filter((x): x is string => !!x)
        .map(Number)
        .sort((x, y) => x - y)
      data.cases = idx.map((i) => String(b.fields![`V${i}`]))
    }
    nodes.push({ id, position, data })
    const outs = outputsOf(data)
    outs.forEach((h, i) => {
      const name = stmtInput(b.type, h)
      if (name) link(id, h, b.inputs?.[name]?.block, { x: position.x + (i - (outs.length - 1) / 2) * 260, y: position.y })
    })
    if (!isTrigger(b.type) && outs.includes('next')) link(id, 'next', b.next?.block, position)
    return id
  }

  let x = 0
  for (const top of program.blocks?.blocks ?? []) {
    visit(top, { x, y: 0 })
    x += 320
  }
  return { nodes, edges }
}

// ---------- Verbindungsregeln ----------

/** Ein Eingang je Knoten, Auslöser haben keinen Eingang, ein Ausgang führt zu genau einem Knoten, keine Kreise. */
export function canConnect(nodes: FlowNode[], edges: FlowEdge[], c: { source: string; sourceHandle: string | null; target: string }): boolean {
  const src = nodes.find((n) => n.id === c.source)
  const dst = nodes.find((n) => n.id === c.target)
  if (!src || !dst || c.source === c.target) return false
  if (isTrigger(dst.data.type)) return false
  if (!outputsOf(src.data).includes(c.sourceHandle ?? '')) return false
  if (edges.some((e) => e.target === c.target)) return false
  if (edges.some((e) => e.source === c.source && e.sourceHandle === c.sourceHandle)) return false
  // Kreis: wäre das Ziel ein Vorgänger der Quelle?
  const parent = new Map(edges.map((e) => [e.target, e.source]))
  for (let cur: string | undefined = c.source; cur; cur = parent.get(cur)) if (cur === c.target) return false
  return true
}

/** Knoten, die von keinem Auslöser aus erreichbar sind (werden blass dargestellt). */
export function unreachable(nodes: FlowNode[], edges: FlowEdge[]): Set<string> {
  const reach = new Set<string>()
  const outs = new Map<string, string[]>()
  for (const e of edges) outs.set(e.source, [...(outs.get(e.source) ?? []), e.target])
  const stack = nodes.filter((n) => isTrigger(n.data.type)).map((n) => n.id)
  while (stack.length) {
    const id = stack.pop()!
    if (reach.has(id)) continue
    reach.add(id)
    stack.push(...(outs.get(id) ?? []))
  }
  return new Set(nodes.filter((n) => !reach.has(n.id)).map((n) => n.id))
}

