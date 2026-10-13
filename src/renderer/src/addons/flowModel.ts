// Flowchart-Modell des Addon-Makers: Knoten + Verbindungen ↔ BlocklyProgram (das Format, das Prüfung und Interpreter kennen).
// Rein und ohne UI-Abhängigkeiten, damit testbar.
import type { BlocklyBlock, BlocklyProgram } from '../../../shared/addonBlocks'

export type Handle = 'next' | 'yes' | 'no' | 'body'
export type Category = 'trigger' | 'action' | 'logic' | 'tool'

export type Val =
  | { k: 'num'; v: number }
  | { k: 'text'; v: string }
  | { k: 'var'; name: string }
  | { k: 'app'; what: string }
  | { k: 'prompt'; name: string }
  | { k: 'random'; min: number; max: number }

export interface Cond {
  a: Val
  op: string
  b: Val
}

export interface FlowNodeData {
  type: string
  fields: Record<string, string | number>
  values: Record<string, Val>
  cond?: Cond
  varName?: string
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
  /** welche Wertarten angeboten werden */
  type: 'num' | 'text'
  unit?: string
}

export interface KindDef {
  label: string
  desc: string
  category: Category
  icon: string
  outputs: Handle[]
  values: ValueSetting[]
  defaults: { fields?: Record<string, string | number>; values?: Record<string, Val>; cond?: Cond; varName?: string }
}

const num = (v: number): Val => ({ k: 'num', v })
const txt = (v: string): Val => ({ k: 'text', v })

const trig = (label: string, desc: string, icon: string, fields?: Record<string, string | number>): KindDef => ({
  label,
  desc,
  category: 'trigger',
  icon,
  outputs: ['next'],
  values: [],
  defaults: { fields }
})
const act = (label: string, desc: string, icon: string, category: Category, values: ValueSetting[] = [], defaults: KindDef['defaults'] = {}): KindDef => ({
  label,
  desc,
  category,
  icon,
  outputs: ['next'],
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
  vd_set_volume: act('Lautstärke', 'Stellt die Lautstärke von Musik oder Regen ein.', 'volume', 'action', [{ key: 'VALUE', label: 'Lautstärke', type: 'num', unit: '%' }], {
    fields: { CHANNEL: 'music' },
    values: { VALUE: num(50) }
  }),
  vd_music_onoff: act('Musik an/aus', 'Schaltet das Lofi-Radio ein oder aus.', 'music', 'action', [], { fields: { ON: 'TRUE' } }),
  vd_play_sound: act('Ton abspielen', 'Spielt den Gong oder einen eigenen Ton.', 'bell', 'action', [], { fields: { SOUND: 'chime' } }),
  vd_focus: act('Fokus-Timer', 'Startet oder stoppt den Fokus-Timer.', 'timer', 'action', [], { fields: { CMD: 'start' } }),

  controls_if: {
    label: 'Wenn / Sonst',
    desc: 'Verzweigt je nachdem, ob die Bedingung stimmt.',
    category: 'logic',
    icon: 'branch',
    outputs: ['yes', 'no'],
    values: [],
    defaults: { cond: { a: { k: 'app', what: 'hour' }, op: 'GTE', b: num(22) } }
  },
  controls_repeat_ext: {
    label: 'Wiederholen',
    desc: 'Führt den Schleifen-Zweig mehrmals aus, danach geht es weiter.',
    category: 'logic',
    icon: 'repeat',
    outputs: ['body', 'next'],
    values: [{ key: 'TIMES', label: 'Wie oft', type: 'num', unit: '×' }],
    defaults: { values: { TIMES: num(3) } }
  },
  vd_forever: {
    label: 'Endlos',
    desc: 'Wiederholt den Schleifen-Zweig immer wieder (mind. 0,1 s pro Runde).',
    category: 'logic',
    icon: 'infinity',
    outputs: ['body'],
    values: [],
    defaults: {}
  },
  vd_wait: act('Warten', 'Pausiert, bevor es weitergeht.', 'clock', 'logic', [{ key: 'SECONDS', label: 'Dauer', type: 'num', unit: 's' }], { values: { SECONDS: num(1) } }),
  variables_set: act('Variable setzen', 'Merkt sich einen Wert unter einem Namen.', 'variable', 'logic', [{ key: 'VALUE', label: 'Wert', type: 'num' }], { varName: 'zähler', values: { VALUE: num(0) } }),
  math_change: act('Variable ändern', 'Zählt eine Variable hoch oder runter.', 'variable', 'logic', [{ key: 'DELTA', label: 'Um', type: 'num' }], { varName: 'zähler', values: { DELTA: num(1) } }),

  vd_show_notice: act('Hinweis', 'Zeigt einen kurzen Hinweis oben im Bild.', 'message', 'tool', [{ key: 'TEXT', label: 'Text', type: 'text' }], { values: { TEXT: txt('Zeit für eine Pause!') } }),
  vd_copy_text: act('Zwischenablage', 'Kopiert Text, z. B. eine Prompt-Vorlage.', 'clipboard', 'tool', [{ key: 'TEXT', label: 'Text', type: 'text' }], { values: { TEXT: txt('') } })
}

export const CATEGORY_LABELS: Record<Category, string> = { trigger: 'Auslöser', action: 'Aktionen', logic: 'Logik', tool: 'Werkzeuge' }
export const HANDLE_LABELS: Record<Handle, string> = { next: 'Weiter', yes: 'Ja', no: 'Nein', body: 'Schleife' }

let seq = 0
export function newNode(type: string, position: { x: number; y: number }, id = `n${Date.now().toString(36)}${(seq++).toString(36)}`): FlowNode {
  const d = KINDS[type].defaults
  const data: FlowNodeData = { type, fields: { ...(d.fields ?? {}) }, values: { ...(d.values ?? {}) } }
  if (d.cond) data.cond = structuredClone(d.cond)
  if (d.varName !== undefined) data.varName = d.varName
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
    case 'random':
      return { type: 'math_random_int', inputs: { FROM: { block: valToBlock(num(v.min)) }, TO: { block: valToBlock(num(v.max)) } } }
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
  if (v.k === 'var') out.add(v.name)
  if (v.k === 'text') for (const m of v.v.matchAll(PLACEHOLDER)) out.add(m[1])
}

function blockToVal(b: BlocklyBlock | undefined, names: Map<string, string>): Val {
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
  const child = (n: FlowNode, h: Handle): { block: BlocklyBlock } | undefined => {
    const b = chain(out.get(`${n.id}:${h}`))
    return b ? { block: b } : undefined
  }

  const toBlock = (n: FlowNode): BlocklyBlock => {
    const d = n.data
    const kind = KINDS[d.type]
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
    if (kind.category === 'trigger') {
      const body = child(n, 'next')
      if (body) inputs.DO = body
    } else if (d.type === 'controls_if') {
      const c = d.cond!
      valNames(c.a, names)
      valNames(c.b, names)
      inputs.IF0 = { block: { type: 'logic_compare', fields: { OP: c.op }, inputs: { A: { block: valToBlock(c.a) }, B: { block: valToBlock(c.b) } } } }
      const yes = child(n, 'yes')
      const no = child(n, 'no')
      if (yes) inputs.DO0 = yes
      if (no) inputs.ELSE = no
    } else if (kind.outputs.includes('body')) {
      const body = child(n, 'body')
      if (body) inputs.DO = body
    }
    if (Object.keys(fields).length) b.fields = fields
    if (Object.keys(inputs).length) b.inputs = inputs
    if (kind.category !== 'trigger' && kind.outputs.includes('next')) {
      const next = child(n, 'next')
      if (next) b.next = next
    }
    return b
  }

  const roots = nodes
    .filter((n) => !hasInput.has(n.id))
    .sort((a, b) => Number(KINDS[b.data.type].category === 'trigger') - Number(KINDS[a.data.type].category === 'trigger') || a.position.y - b.position.y || a.position.x - b.position.x)
  const blocks = roots.map((r) => chain(r.id)).filter((b): b is BlocklyBlock => !!b)
  return { blocks: { languageVersion: 0, blocks }, variables: [...names].sort().map((name) => ({ name, id: varId(name) })) }
}

// ---------- Programm → Graph ----------

export function programToGraph(program: BlocklyProgram): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const names = new Map((program.variables ?? []).map((v) => [v.id, v.name]))
  const nodes: FlowNode[] = []
  const edges: FlowEdge[] = []
  let auto = 0

  const link = (source: string, handle: Handle, b: BlocklyBlock | undefined, pos: { x: number; y: number }): void => {
    if (!b) return
    const target = visit(b, { x: pos.x, y: pos.y + 120 })
    if (target) edges.push({ id: `${source}-${handle}-${target}`, source, sourceHandle: handle, target })
  }

  const visit = (b: BlocklyBlock, fallback: { x: number; y: number }): string | null => {
    const kind = KINDS[b.type]
    if (!kind) return null
    const id = b.id ?? `auto${auto++}`
    const position = { x: b.x ?? fallback.x, y: b.y ?? fallback.y }
    const data: FlowNodeData = { type: b.type, fields: {}, values: {} }
    for (const [k, v] of Object.entries(b.fields ?? {})) if (k !== 'VAR') data.fields[k] = v as string | number
    for (const vs of kind.values) data.values[vs.key] = blockToVal(b.inputs?.[vs.key]?.block ?? b.inputs?.[vs.key]?.shadow, names)
    if (kind.defaults.varName !== undefined) {
      const vid = String((b.fields?.VAR as { id?: string } | undefined)?.id ?? '')
      data.varName = names.get(vid) ?? vid.replace(/^var:/, '')
    }
    const inp = (k: string): BlocklyBlock | undefined => b.inputs?.[k]?.block
    if (b.type === 'controls_if') {
      const cmp = inp('IF0')
      data.cond = { a: blockToVal(cmp?.inputs?.A?.block, names), op: String(cmp?.fields?.OP ?? 'EQ'), b: blockToVal(cmp?.inputs?.B?.block, names) }
    }
    nodes.push({ id, position, data })
    if (kind.category === 'trigger') link(id, 'next', inp('DO'), position)
    else if (b.type === 'controls_if') {
      link(id, 'yes', inp('DO0'), { x: position.x - 160, y: position.y })
      link(id, 'no', inp('ELSE'), { x: position.x + 160, y: position.y })
    } else if (kind.outputs.includes('body')) link(id, 'body', inp('DO'), { x: position.x + 260, y: position.y })
    if (kind.category !== 'trigger' && kind.outputs.includes('next')) link(id, 'next', b.next?.block, position)
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
  if (KINDS[dst.data.type].category === 'trigger') return false
  if (!KINDS[src.data.type].outputs.includes(c.sourceHandle as Handle)) return false
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
  const stack = nodes.filter((n) => KINDS[n.data.type].category === 'trigger').map((n) => n.id)
  while (stack.length) {
    const id = stack.pop()!
    if (reach.has(id)) continue
    reach.add(id)
    stack.push(...(outs.get(id) ?? []))
  }
  return new Set(nodes.filter((n) => !reach.has(n.id)).map((n) => n.id))
}
