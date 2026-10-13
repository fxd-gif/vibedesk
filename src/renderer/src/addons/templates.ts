// Vorlagen für den Addon-Maker: fertige, komplexe Abläufe zum Anpassen. Rein und testbar.
import { newNode, outputsOf, type Category, type Cmp, type Cond, type FlowEdge, type FlowNode, type FlowNodeData, type Handle, type Val } from './flowModel'

export interface Template {
  id: string
  name: string
  description: string
  icon: string
  accent: Category
  /** Bausteine, die die Vorlage zeigt (für die Galerie) */
  highlights: string[]
  prompts?: Record<string, string>
  build(b: Builder): void
}

// ---------- kleiner Baukasten ----------

type Patch = Partial<Omit<FlowNodeData, 'fields' | 'values'>> & { fields?: Record<string, string | number>; values?: Record<string, Val> }

export class Builder {
  nodes: FlowNode[] = []
  edges: FlowEdge[] = []
  n(type: string, patch: Patch = {}): string {
    const node = newNode(type, { x: 0, y: 0 })
    const { fields, values, ...rest } = patch
    node.data = { ...node.data, ...rest, fields: { ...node.data.fields, ...(fields ?? {}) }, values: { ...node.data.values, ...(values ?? {}) } }
    this.nodes.push(node)
    return node.id
  }
  link(from: string, handle: Handle, to: string): string {
    this.edges.push({ id: `${from}-${handle}-${to}`, source: from, sourceHandle: handle, target: to })
    return to
  }
  /** Verkettet über „Weiter“ und liefert den ersten Knoten (zum Anhängen der ganzen Kette an einen Zweig). */
  seq(...ids: string[]): string {
    for (let i = 0; i < ids.length - 1; i++) this.link(ids[i], 'next', ids[i + 1])
    return ids[0]
  }
}

const num = (v: number): Val => ({ k: 'num', v })
const txt = (v: string): Val => ({ k: 'text', v })
const app = (what: string): Val => ({ k: 'app', what })
const vr = (name: string): Val => ({ k: 'var', name })
const store = (key: string): Val => ({ k: 'store', key })
const calc = (op: string, a: Val, b?: Val): Val => (b ? { k: 'calc', op, a, b } : { k: 'calc', op, a })
const cmp = (a: Val, op: string, b: Val): Cmp => ({ a, op, b })
const all = (...items: Cmp[]): Cond => ({ join: 'AND', items })
const any = (...items: Cmp[]): Cond => ({ join: 'OR', items })

// häufige Knoten
const fade = (b: Builder, channel: string, to: number, secs: number): string => b.n('vd_fade', { fields: { CHANNEL: channel }, values: { VALUE: num(to), SECONDS: num(secs) } })
const scene = (b: Builder, s: string): string => b.n('vd_set_scene', { fields: { SCENE: s } })
const notice = (b: Builder, text: string): string => b.n('vd_show_notice', { values: { TEXT: txt(text) } })
const setVar = (b: Builder, name: string, value: Val): string => b.n('variables_set', { varName: name, values: { VALUE: value } })
const keep = (b: Builder, key: string, value: Val): string => b.n('vd_store_set', { fields: { KEY: key }, values: { VALUE: value } })
const emit = (b: Builder, name: string): string => b.n('vd_emit', { fields: { NAME: name, WAIT: 'FALSE' } })
const signal = (b: Builder, name: string): string => b.n('vd_on_signal', { fields: { NAME: name } })
const iff = (b: Builder, cond: Cond): string => b.n('controls_if', { cond })
const hotkey = (b: Builder, key: string): string => b.n('vd_on_hotkey', { fields: { KEY: key } })
const sound = (b: Builder): string => b.n('vd_play_sound')
const ask = (b: Builder, text: string, yes: string, no: string): string => b.n('vd_ask', { fields: { YES_LABEL: yes, NO_LABEL: no }, values: { TEXT: txt(text) } })

// ---------- Vorlagen ----------

export const TEMPLATES: Template[] = [
  {
    id: 'adaptive-atmo',
    name: 'Adaptive Atmosphäre',
    description: 'Die Stimmung folgt deiner Arbeitslast: ruhiger Wald, wenn nichts wartet – Tokio und Platzregen, wenn sich Sessions stapeln.',
    icon: 'rain',
    accent: 'action',
    highlights: ['Signale', 'Je nach Wert', 'Gleichzeitig', 'Überblenden', 'Drossel'],
    build(b) {
      b.seq(b.n('vd_on_interval', { fields: { MINUTES: 5 } }), emit(b, 'stimmung'))
      b.seq(b.n('vd_on_session_waiting'), emit(b, 'stimmung'))
      b.seq(b.n('vd_on_session_done'), emit(b, 'stimmung'))
      const sw = b.n('vd_switch', { values: { VALUE: vr('wartend') }, cases: ['0', '1'] })
      b.seq(signal(b, 'stimmung'), setVar(b, 'wartend', app('waiting_sessions')), sw)
      b.link(sw, 'case0', b.seq(fade(b, 'rain', 25, 20), scene(b, 'forest'), fade(b, 'music', 45, 10)))
      b.link(sw, 'case1', b.seq(fade(b, 'rain', 55, 15), scene(b, 'city')))
      const par = b.n('vd_parallel')
      b.link(sw, 'default', par)
      b.link(par, 'a', fade(b, 'rain', 90, 10))
      b.link(par, 'b', fade(b, 'music', 15, 10))
      b.link(par, 'next', b.seq(scene(b, 'tokyo'), b.n('vd_gate', { values: { SECONDS: num(300) } }), notice(b, '{wartend} Sessions warten auf dich')))
    }
  },
  {
    id: 'pomodoro-stats',
    name: 'Pomodoro mit Statistik',
    description: 'Zählt deine Fokus-Runden dauerhaft, kündigt jede Runde an und belohnt jede vierte mit einer langen Pause im Wald.',
    icon: 'timer',
    accent: 'trigger',
    highlights: ['Dauerhaft merken', 'Berechnungen', 'Wenn / Sonst', 'Überblenden'],
    build(b) {
      b.seq(
        b.n('vd_on_focus', { fields: { PHASE: 'work' } }),
        keep(b, 'runden', calc('add', store('runden'), num(1))),
        setVar(b, 'runde', store('runden')),
        notice(b, 'Runde {runde} – los geht’s')
      )
      const lang = iff(b, all(cmp(calc('mod', store('runden'), num(4)), 'EQ', num(0))))
      b.seq(b.n('vd_on_focus', { fields: { PHASE: 'break' } }), setVar(b, 'rest', calc('sub', num(4), calc('mod', store('runden'), num(4)))), lang)
      b.link(lang, 'yes', b.seq(sound(b), scene(b, 'forest'), fade(b, 'music', 60, 8), notice(b, '4 Runden geschafft – lange Pause verdient!')))
      b.link(lang, 'no', notice(b, 'Noch {rest} Runden bis zur langen Pause'))
      b.seq(b.n('vd_on_time', { fields: { HOUR: 0, MINUTE: 0 } }), keep(b, 'gestern', store('runden')), keep(b, 'runden', num(0)))
      b.seq(hotkey(b, 'S'), setVar(b, 'heute', store('runden')), setVar(b, 'gestern', store('gestern')), notice(b, 'Heute {heute} Runden · gestern {gestern}'))
    }
  },
  {
    id: 'daytime-director',
    name: 'Tageszeit-Regisseur',
    description: 'Morgens Wald, tagsüber Stadt, abends Tokio – und nachts fragt VibeDesk, ob du nicht Feierabend machen willst.',
    icon: 'clock',
    accent: 'logic',
    highlights: ['Signale', 'Und/Oder-Bedingungen', 'Überblenden', 'Frage'],
    build(b) {
      b.seq(b.n('vd_on_start'), emit(b, 'tageszeit'))
      b.seq(b.n('vd_on_interval', { fields: { MINUTES: 60 } }), emit(b, 'tageszeit'))
      const morgen = iff(b, all(cmp(app('hour'), 'GTE', num(6)), cmp(app('hour'), 'LT', num(9))))
      b.seq(signal(b, 'tageszeit'), morgen)
      b.link(morgen, 'yes', b.seq(scene(b, 'forest'), fade(b, 'rain', 20, 60), fade(b, 'music', 35, 30)))
      const tag = iff(b, all(cmp(app('hour'), 'GTE', num(9)), cmp(app('hour'), 'LT', num(18))))
      b.link(morgen, 'no', tag)
      b.link(tag, 'yes', b.seq(scene(b, 'city'), fade(b, 'rain', 40, 60), b.n('vd_music_onoff', { fields: { ON: 'TRUE' } })))
      const abend = iff(b, all(cmp(app('hour'), 'GTE', num(18)), cmp(app('hour'), 'LT', num(22))))
      b.link(tag, 'no', abend)
      b.link(abend, 'yes', b.seq(scene(b, 'tokyo'), fade(b, 'rain', 60, 60)))
      const frage = ask(b, 'Schon spät – Feierabend machen?', 'Feierabend', 'Noch nicht')
      b.link(abend, 'no', b.seq(fade(b, 'rain', 90, 120), frage))
      b.link(frage, 'yes', b.seq(b.n('vd_focus', { fields: { CMD: 'stop' } }), fade(b, 'music', 0, 30)))
      b.link(frage, 'no', notice(b, 'Okay – aber trink noch ein Glas Wasser.'))
    }
  },
  {
    id: 'deep-work',
    name: 'Deep-Work-Schalter',
    description: 'Strg + Alt + D schaltet den Tunnelblick an und aus: Fokus-Timer, Tokio, leise Musik – und wartende Sessions melden sich nur noch dezent.',
    icon: 'keyboard',
    accent: 'advanced',
    highlights: ['Dauerhaft merken', 'Gleichzeitig', 'Drossel', 'Ereignis-Info'],
    build(b) {
      const an = iff(b, all(cmp(store('deep'), 'EQ', num(1))))
      b.seq(hotkey(b, 'D'), an)
      b.link(an, 'yes', b.seq(keep(b, 'deep', num(0)), b.n('vd_focus', { fields: { CMD: 'stop' } }), fade(b, 'music', 50, 5), scene(b, 'city'), notice(b, 'Deep Work aus')))
      const par = b.n('vd_parallel')
      b.link(an, 'no', b.seq(keep(b, 'deep', num(1)), b.n('vd_focus', { fields: { CMD: 'start' } }), par))
      b.link(par, 'a', fade(b, 'rain', 70, 5))
      b.link(par, 'b', fade(b, 'music', 10, 5))
      b.link(par, 'next', b.seq(scene(b, 'tokyo'), notice(b, 'Deep Work an – nur noch leise Töne')))
      const leise = iff(b, all(cmp(store('deep'), 'EQ', num(1))))
      b.seq(b.n('vd_on_session_waiting'), setVar(b, 'projekt', app('event_project')), leise)
      b.link(leise, 'yes', b.seq(b.n('vd_gate', { values: { SECONDS: num(120) } }), sound(b)))
      b.link(leise, 'no', b.seq(sound(b), notice(b, '{projekt} wartet auf dich')))
    }
  },
  {
    id: 'cost-guard',
    name: 'Kosten-Wächter',
    description: 'Behält die Claude-Kosten des Tages im Blick, warnt einmal pro Tag am Budget und hebt es auf Wunsch an. Strg + Alt + K zeigt den Stand.',
    icon: 'database',
    accent: 'tool',
    highlights: ['Session-Werte', 'Dauerhaft merken', 'Frage', 'Und-Bedingung'],
    build(b) {
      const init = iff(b, all(cmp(store('limit'), 'EQ', num(0))))
      b.seq(b.n('vd_on_start'), init)
      b.link(init, 'yes', keep(b, 'limit', num(5)))
      const warn = iff(b, all(cmp(vr('kosten'), 'GTE', store('limit')), cmp(store('gewarnt'), 'NEQ', app('day'))))
      b.seq(b.n('vd_on_session_done'), setVar(b, 'kosten', app('cost_today')), warn)
      const frage = ask(b, 'Heute schon {kosten} $ – Budget erreicht. Pause machen?', 'Pause', 'Weiter')
      b.link(warn, 'yes', b.seq(keep(b, 'gewarnt', app('day')), sound(b), frage))
      b.link(frage, 'yes', b.seq(b.n('vd_focus', { fields: { CMD: 'stop' } }), scene(b, 'forest')))
      b.link(frage, 'no', b.seq(keep(b, 'limit', calc('add', store('limit'), num(5))), setVar(b, 'neu', store('limit')), notice(b, 'Okay – neues Budget: {neu} $')))
      b.seq(hotkey(b, 'K'), setVar(b, 'heute', app('cost_today')), setVar(b, 'tokens', app('tokens_today')), notice(b, 'Heute: {heute} $ · {tokens} Tokens'))
    }
  },
  {
    id: 'prompt-toolkit',
    name: 'Prompt-Werkzeugkasten',
    description: 'Drei Tastenkürzel für deine wichtigsten Prompts – und nach jeder fertigen Session das Angebot, eine Zusammenfassung anzufordern.',
    icon: 'clipboard',
    accent: 'tool',
    highlights: ['Prompt-Vorlagen', 'Frage', 'Drossel', 'Ereignis-Info'],
    prompts: {
      'Code-Review':
        'Bitte reviewe die Änderungen dieser Session gründlich: Fehler, Sicherheitslücken, Randfälle, Lesbarkeit. Nenne Fundstellen mit Datei und Zeile und schlage konkrete Verbesserungen vor.',
      'Tests schreiben': 'Schreibe sinnvolle Tests für den Code, den du gerade geändert hast. Decke Randfälle und Fehlerpfade ab und führe die Tests aus.',
      'Refactoring-Plan': 'Analysiere den betroffenen Code und schlage einen schrittweisen Refactoring-Plan vor – ohne das Verhalten zu ändern. Noch nichts umsetzen.',
      Zusammenfassung: 'Fasse zusammen, was du in dieser Session gemacht hast: geänderte Dateien, offene Punkte und sinnvolle nächste Schritte.'
    },
    build(b) {
      const copy = (name: string): string => b.n('vd_copy_text', { values: { TEXT: { k: 'prompt', name } } })
      b.seq(hotkey(b, 'R'), copy('Code-Review'), notice(b, 'Review-Prompt kopiert'))
      b.seq(hotkey(b, 'T'), copy('Tests schreiben'), notice(b, 'Test-Prompt kopiert'))
      b.seq(hotkey(b, 'P'), copy('Refactoring-Plan'), notice(b, 'Refactoring-Prompt kopiert'))
      const frage = ask(b, '{projekt} ist fertig. Zusammenfassung anfordern?', 'Kopieren', 'Nein')
      b.seq(b.n('vd_on_session_done'), b.n('vd_gate', { values: { SECONDS: num(600) } }), setVar(b, 'projekt', app('event_project')), frage)
      b.link(frage, 'yes', b.seq(copy('Zusammenfassung'), notice(b, 'Kopiert – einfach in die Session einfügen')))
    }
  },
  {
    id: 'rain-wave',
    name: 'Regen-Welle',
    description: 'Strg + Alt + W lässt Regen und Regenrauschen in einer sanften Sinuswelle an- und abschwellen – Mathe als Atmosphäre.',
    icon: 'fade',
    accent: 'advanced',
    highlights: ['Signale', 'Endlos', 'Berechnungen (Sinus)', 'Dauerhaft merken'],
    build(b) {
      const toggle = iff(b, all(cmp(store('welle'), 'EQ', num(1))))
      b.seq(hotkey(b, 'W'), toggle)
      b.link(toggle, 'yes', b.seq(keep(b, 'welle', num(0)), notice(b, 'Regen-Welle aus')))
      b.link(toggle, 'no', b.seq(keep(b, 'welle', num(1)), notice(b, 'Regen-Welle an'), emit(b, 'welle')))
      const beimStart = iff(b, all(cmp(store('welle'), 'EQ', num(1))))
      b.seq(b.n('vd_on_start'), beimStart)
      b.link(beimStart, 'yes', emit(b, 'welle'))
      const loop = b.n('vd_forever')
      b.seq(signal(b, 'welle'), setVar(b, 't', num(0)), loop)
      const aktiv = iff(b, all(cmp(store('welle'), 'EQ', num(1))))
      b.link(loop, 'body', aktiv)
      b.link(
        aktiv,
        'yes',
        b.seq(
          b.n('math_change', { varName: 't', values: { DELTA: num(12) } }),
          b.n('vd_set_rain', { values: { VALUE: calc('add', num(50), calc('mul', num(35), calc('sin', vr('t')))) } }),
          b.n('vd_set_volume', { fields: { CHANNEL: 'rain' }, values: { VALUE: calc('add', num(40), calc('mul', num(20), calc('cos', vr('t')))) } }),
          b.n('vd_wait', { values: { SECONDS: num(2) } })
        )
      )
      b.link(aktiv, 'no', b.n('vd_wait', { values: { SECONDS: num(5) } }))
    }
  },
  {
    id: 'daily-report',
    name: 'Tagesbericht',
    description: 'Sammelt den Tag über, in welchen Projekten Claude fertig geworden ist, und bietet dir um 18 Uhr einen fertigen Bericht zum Kopieren an.',
    icon: 'list',
    accent: 'advanced',
    highlights: ['Listen', 'Ereignis-Info', 'Frage', 'Dauerhaft merken'],
    build(b) {
      const neu = iff(b, all(cmp({ k: 'list', name: 'heute', op: 'contains', arg: vr('projekt') }, 'EQ', num(0))))
      b.seq(b.n('vd_on_session_done'), keep(b, 'erledigt', calc('add', store('erledigt'), num(1))), setVar(b, 'projekt', app('event_project')), neu)
      b.link(neu, 'yes', b.n('vd_list_add', { varName: 'heute', values: { VALUE: vr('projekt') } }))
      const hatWas = iff(b, all(cmp({ k: 'list', name: 'heute', op: 'length' }, 'GT', num(0))))
      b.seq(b.n('vd_on_time', { fields: { HOUR: 18, MINUTE: 0 } }), hatWas)
      const frage = ask(b, 'Tagesbericht: {anzahl} erledigte Aufgaben in {bericht}. Kopieren?', 'Kopieren', 'Nein')
      b.link(hatWas, 'yes', b.seq(setVar(b, 'bericht', { k: 'list', name: 'heute', op: 'join' }), setVar(b, 'anzahl', store('erledigt')), frage))
      b.link(frage, 'yes', b.seq(b.n('vd_copy_text', { values: { TEXT: txt('Heute erledigt ({anzahl} Aufgaben): {bericht}') } }), notice(b, 'Bericht kopiert')))
      b.seq(b.n('vd_on_time', { fields: { HOUR: 0, MINUTE: 0 } }), b.n('vd_list_clear', { varName: 'heute' }), keep(b, 'erledigt', num(0)))
    }
  }
]

// ---------- automatische Anordnung ----------

const COL = 300
const ROW = 170

/** Baumlayout: Kinder nebeneinander unter ihrem Elternknoten, Bäume von links nach rechts. */
function layout(nodes: FlowNode[], edges: FlowEdge[]): void {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const kids = new Map<string, string[]>()
  const hasParent = new Set(edges.map((e) => e.target))
  for (const n of nodes) {
    const outs = outputsOf(n.data)
    // Zweige zuerst, „Weiter“ zuletzt – so landet die Fortsetzung rechts außen
    const order = [...outs.filter((h) => h !== 'next'), 'next']
    kids.set(
      n.id,
      order.flatMap((h) => edges.filter((e) => e.source === n.id && e.sourceHandle === h).map((e) => e.target))
    )
  }
  const width = new Map<string, number>()
  const w = (id: string): number => {
    if (width.has(id)) return width.get(id)!
    const c = kids.get(id) ?? []
    const v = Math.max(1, c.reduce((s, k) => s + w(k), 0))
    width.set(id, v)
    return v
  }
  const place = (id: string, left: number, depth: number): void => {
    const n = byId.get(id)!
    n.position = { x: Math.round((left + (w(id) - 1) / 2) * COL), y: depth * ROW }
    let x = left
    for (const k of kids.get(id) ?? []) {
      place(k, x, depth + 1)
      x += w(k)
    }
  }
  let left = 0
  for (const r of nodes.filter((n) => !hasParent.has(n.id))) {
    place(r.id, left, 0)
    left += w(r.id)
  }
}

export function templateGraph(t: Template): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const b = new Builder()
  t.build(b)
  layout(b.nodes, b.edges)
  return { nodes: b.nodes, edges: b.edges }
}
