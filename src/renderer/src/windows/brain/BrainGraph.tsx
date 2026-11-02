// Lebendiger Graph des Gehirns: Canvas + d3-force. Zoomen (Rad), Verschieben (Hintergrund ziehen),
// Knoten ziehen, Nachbarn beim Überfahren hervorheben. Wenn Claude etwas anfasst, leuchtet der Knoten auf,
// ein Ring breitet sich aus und Funken laufen die Verbindungen entlang – wie auf der Website.
// Leistung: kein shadowBlur, Leucht-Sprites statt Schatten, Kanten gebündelt, Beschriftungen ohne Überlappung,
// Zeichenfläche höchstens 1,5-fach, Ruhe-Treiben nur mit Fokus und gedrosselt.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force'
import type { BrainGraph as Graph, GraphEdge, GraphNode, GraphNodeKind, NoteType } from '../../../../shared/brain'
import { heatColor, type HotNode } from '../../../../shared/hotspots'
import { t, tn } from '../../../../shared/i18n'
import { canvasDpr } from '../../ambience/framePolicy'

export const KIND_COLOR: Record<GraphNodeKind, string> = {
  module: '#9fb8ff',
  decision: '#c4a7ff',
  pitfall: '#f87171',
  convention: '#4ade80',
  task: '#facc15',
  fact: '#67e8f9',
  file: 'rgba(223, 229, 239, 0.45)',
  missing: 'rgba(223, 229, 239, 0.35)'
}

/** Anzeigename eines Notiztyps (gespeicherte Typ-Werte bleiben unverändert) */
export function noteTypeLabel(type: NoteType): string {
  switch (type) {
    case 'module':
      return t('Bereich')
    case 'decision':
      return t('Entscheidung')
    case 'pitfall':
      return t('Stolperfalle')
    case 'convention':
      return t('Konvention')
    case 'task':
      return t('Aufgabe')
    case 'fact':
      return t('Wissen')
  }
}

const PULSE_COLOR = { read: '#67e8f9', edit: '#4ade80', write: '#c4a7ff' } as const
type PulseKind = keyof typeof PULSE_COLOR
const PULSE_MS = 1800
const BORN_MS = 700
/** Datei ohne Commits, solange Hotspots an sind – tritt zurück */
const COLD_FILE = 'rgba(223, 229, 239, 0.22)'
/** Ruhe-Treiben: Bildrate und Ausschlag (Weltkoordinaten) */
const DRIFT_FPS = 24
const DRIFT_AMP = 2.6
/** so lange nach Maus oder Aktivität treibt der Graph, danach Standbild */
const AWAKE_MS = 15000
/** Beschriftungen: weit weg nur die wichtigsten, beim Hineinzoomen mehr */
const labelBudget = (k: number): number => Math.round(Math.max(14, Math.min(80, 14 + (k - 0.5) * 60)))
const MAX_SPARKS = 8

type SimNode = HotNode & SimulationNodeDatum & { r: number; ph: number; px: number; py: number }
type SimLink = SimulationLinkDatum<SimNode> & { kind: GraphEdge['kind']; weight: number }

export interface GraphHandle {
  focusNode(id: string): void
  /** false: Knoten gibt es (noch) nicht – dann lohnt sich Nachladen */
  pulse(id: string, kind: PulseKind): boolean
  fit(): void
}

interface Props {
  graph: Graph
  hidden: ReadonlySet<GraphNodeKind>
  query: string
  selected: string | null
  /** Hotspots an: Dateien nach Commits einfärben */
  heatOn?: boolean
  /** Sparmodus: kein Treiben, kleinere Zeichenfläche */
  calm?: boolean
  onSelect(id: string | null): void
}

const radius = (n: GraphNode): number => (n.kind === 'file' ? 2.5 + n.weight * 1.3 : 5 + n.weight * 2.4)
const shortLabel = (n: GraphNode): string => (n.kind === 'file' ? n.label.split('/').pop() ?? n.label : n.label)
/** feste Phase pro Knoten, damit das Treiben nach dem Nachladen nicht springt */
const phaseOf = (id: string): number => {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return ((h >>> 0) % 6283) / 1000
}
const NOTE_FONT = '500 11.5px Inter, system-ui, sans-serif'
const FILE_FONT = '400 10.5px JetBrains Mono, monospace'

/** Weiches Leuchten als vorgerendertes Bild – billiger als shadowBlur bei jedem Knoten */
const sprites = new Map<string, HTMLCanvasElement>()
function glowSprite(color: string): HTMLCanvasElement {
  let c = sprites.get(color)
  if (c) return c
  c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, color)
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.globalAlpha = 0.9
  g.fillRect(0, 0, 64, 64)
  sprites.set(color, c)
  return c
}

export const BrainGraph = forwardRef<GraphHandle, Props>(function BrainGraph({ graph, hidden, query, selected, heatOn = false, calm = false, onSelect }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const st = useRef({
    nodes: [] as SimNode[],
    links: [] as SimLink[],
    byId: new Map<string, SimNode>(),
    neighbors: new Map<string, Set<string>>(),
    /** alle Knoten-IDs der Daten, auch ausgeblendete */
    allIds: new Set<string>(),
    /** Datei → Notizen, die sie nennen (für Pulse auf ausgeblendete Dateien) */
    fileNotes: new Map<string, string[]>(),
    /** Beschriftungs-Reihenfolge: wichtigste zuerst */
    order: [] as SimNode[],
    pos: new Map<string, { x: number; y: number }>(),
    sim: null as Simulation<SimNode, SimLink> | null,
    t: { k: 1, x: 0, y: 0 },
    size: { w: 0, h: 0 },
    dpr: 1,
    hover: null as string | null,
    selected: null as string | null,
    query: '',
    pulses: new Map<string, { kind: PulseKind; at: number; weak: boolean }>(),
    sparks: [] as { a: string; b: string; kind: PulseKind; at: number; dur: number }[],
    born: new Map<string, number>(),
    labelW: new Map<string, number>(),
    dirty: true,
    anim: null as null | { from: { k: number; x: number; y: number }; to: { k: number; x: number; y: number }; at: number },
    fitted: false,
    needFit: false,
    loaded: false,
    heatOn: false,
    calm: false,
    lastDraw: 0,
    awake: performance.now()
  })
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // ---------- Daten → Simulation ----------
  useEffect(() => {
    const s = st.current
    s.sim?.stop()
    for (const n of s.nodes) if (n.x !== undefined && n.y !== undefined) s.pos.set(n.id, { x: n.x, y: n.y })
    const known = new Set(s.nodes.map((n) => n.id))
    const visible = (n: GraphNode): boolean => !hidden.has(n.kind) && !(n.kind === 'missing' && hidden.has('fact'))
    const ids = new Set(graph.nodes.filter(visible).map((n) => n.id))
    const links: SimLink[] = graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => ({ source: e.source, target: e.target, kind: e.kind, weight: e.weight }))
    const neighbors = new Map<string, Set<string>>()
    for (const l of links) {
      const a = l.source as string
      const b = l.target as string
      if (!neighbors.has(a)) neighbors.set(a, new Set())
      if (!neighbors.has(b)) neighbors.set(b, new Set())
      neighbors.get(a)!.add(b)
      neighbors.get(b)!.add(a)
    }
    const now = performance.now()
    const nodes: SimNode[] = graph.nodes.filter(visible).map((n) => {
      let p = s.pos.get(n.id)
      if (!p && s.loaded) {
        // neu dazugekommen: neben einem Nachbarn auftauchen und hineinwachsen
        const nb = [...(neighbors.get(n.id) ?? [])].map((id) => s.pos.get(id)).find(Boolean)
        if (nb) p = { x: nb.x + (Math.random() - 0.5) * 30, y: nb.y + (Math.random() - 0.5) * 30 }
        if (!known.has(n.id) && n.kind !== 'file') {
          s.born.set(n.id, now)
          s.pulses.set(n.id, { kind: 'write', at: now, weak: false })
        }
      }
      return { ...n, r: radius(n), ph: phaseOf(n.id), px: p?.x ?? 0, py: p?.y ?? 0, ...(p ? { x: p.x, y: p.y } : {}) }
    })
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const fileNotes = new Map<string, string[]>()
    for (const e of graph.edges) {
      if (e.kind !== 'file') continue
      const list = fileNotes.get(e.target) ?? []
      list.push(e.source)
      fileNotes.set(e.target, list)
    }
    s.nodes = nodes
    s.links = links
    s.byId = byId
    s.neighbors = neighbors
    s.allIds = new Set(graph.nodes.map((n) => n.id))
    s.fileNotes = fileNotes
    // Notizen vor Dateien, Bereiche und gut vernetzte vor dem Rest
    s.order = [...nodes].sort((a, b) => score(b) - score(a))
    const fresh = nodes.some((n) => n.x === undefined)
    s.sim = forceSimulation<SimNode, SimLink>(nodes)
      .force(
        'link',
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((l) => (l.kind === 'link' ? 90 : l.kind === 'file' ? 55 : 70))
          .strength((l) => (l.kind === 'co' ? Math.min(0.3, 0.05 * l.weight) : l.kind === 'file' ? 0.5 : 0.35))
      )
      .force('charge', forceManyBody<SimNode>().strength((d) => (d.kind === 'file' ? -70 : -260)).distanceMax(420))
      .force('collide', forceCollide<SimNode>((d) => d.r + 6))
      .force('center', forceCenter(0, 0).strength(0.05))
      .force('x', forceX(0).strength(0.035))
      .force('y', forceY(0).strength(0.035))
      .alphaDecay(0.03)
      .on('tick', () => {
        s.dirty = true
      })
    if (fresh && !s.loaded) {
      // erst einpendeln, dann zeigen – kein wildes Auseinanderfliegen beim Öffnen
      s.sim.stop()
      s.sim.alpha(1).tick(160)
      s.sim.alpha(0.06).restart()
      s.needFit = true
    } else s.sim.alpha(fresh ? 0.5 : 0.3).restart()
    s.loaded = nodes.length > 0
    s.dirty = true
    return () => void s.sim?.stop()
  }, [graph, hidden])

  useEffect(() => {
    st.current.selected = selected
    st.current.dirty = true
  }, [selected])
  useEffect(() => {
    st.current.query = query.trim().toLowerCase()
    st.current.dirty = true
  }, [query])
  useEffect(() => {
    st.current.heatOn = heatOn
    st.current.dirty = true
  }, [heatOn])
  useEffect(() => {
    st.current.calm = calm
    st.current.dirty = true
  }, [calm])

  // ---------- Kamera ----------
  const animateTo = (to: { k: number; x: number; y: number }): void => {
    const s = st.current
    s.anim = { from: { ...s.t }, to, at: performance.now() }
  }

  function fitView(instant: boolean): void {
    const s = st.current
    const ns = s.nodes.filter((n) => n.x !== undefined)
    if (!ns.length || !s.size.w) return
    s.fitted = true
    const xs = ns.map((n) => n.x!)
    const ys = ns.map((n) => n.y!)
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    // unten liegt die Leiste mit Typen und Legende
    const h = s.size.h - 44
    const k = Math.max(0.35, Math.min(1.6, Math.min(s.size.w / (x1 - x0 + 200), h / (y1 - y0 + 160))))
    const to = { k, x: s.size.w / 2 - ((x0 + x1) / 2) * k, y: h / 2 + 6 - ((y0 + y1) / 2) * k }
    if (instant) {
      s.t = to
      s.anim = null
      s.dirty = true
    } else animateTo(to)
  }
  const fit = (): void => fitView(false)

  const startPulse = (id: string, kind: PulseKind): void => {
    const s = st.current
    const now = performance.now()
    s.pulses.set(id, { kind, at: now, weak: false })
    // Funken zu den Nachbarn – Wissen wandert durchs Gehirn
    const nbs = [...(s.neighbors.get(id) ?? [])].slice(0, MAX_SPARKS)
    for (const b of nbs) s.sparks.push({ a: id, b, kind, at: now, dur: 700 + Math.random() * 600 })
    if (s.sparks.length > 60) s.sparks.splice(0, s.sparks.length - 60)
    s.awake = now
    s.dirty = true
  }

  useImperativeHandle(ref, () => ({
    focusNode(id) {
      const s = st.current
      const n = s.byId.get(id)
      if (!n || n.x === undefined) return
      const k = Math.max(s.t.k, 1.1)
      animateTo({ k, x: s.size.w / 2 - n.x * k, y: s.size.h / 2 - n.y! * k })
    },
    pulse(id, kind) {
      const s = st.current
      if (s.byId.has(id)) {
        startPulse(id, kind)
        return true
      }
      // ausgeblendete Datei: das Wissen dazu leuchtet stattdessen
      const notes = (s.fileNotes.get(id) ?? []).filter((n) => s.byId.has(n))
      for (const n of notes.slice(0, 4)) startPulse(n, kind)
      return notes.length > 0 || s.allIds.has(id)
    },
    fit
  }))

  // ---------- Zeichnen ----------
  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const s = st.current
    let raf = 0

    const resize = (): void => {
      const r = canvas.getBoundingClientRect()
      s.dpr = canvasDpr(s.calm, window.devicePixelRatio)
      canvas.width = Math.round(r.width * s.dpr)
      canvas.height = Math.round(r.height * s.dpr)
      if (!s.size.w) s.t = { k: 1, x: r.width / 2, y: r.height / 2 }
      s.size = { w: r.width, h: r.height }
      s.dirty = true
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    const textW = (n: SimNode, label: string): number => {
      let w = s.labelW.get(n.id)
      if (w === undefined) {
        ctx.font = n.kind === 'file' ? FILE_FONT : NOTE_FONT
        w = ctx.measureText(label).width
        s.labelW.set(n.id, w)
      }
      return w
    }

    const draw = (now: number): void => {
      raf = requestAnimationFrame(draw)
      if (canvasDpr(s.calm, window.devicePixelRatio) !== s.dpr) resize()
      // minimiert oder versteckt: nichts zu zeichnen
      if (!s.size.w || !s.size.h) return
      if (s.needFit) {
        s.needFit = false
        fitView(true)
      }
      if (s.anim) {
        const p = Math.min(1, (now - s.anim.at) / 450)
        const e = 1 - Math.pow(1 - p, 3)
        const { from, to } = s.anim
        s.t = { k: from.k + (to.k - from.k) * e, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e }
        if (p >= 1) s.anim = null
        s.dirty = true
      }
      for (const [id, p] of s.pulses) if (now - p.at > PULSE_MS) s.pulses.delete(id)
      for (const [id, at] of s.born) if (now - at > BORN_MS) s.born.delete(id)
      if (s.sparks.length) {
        const left = s.sparks.filter((sp) => {
          if (now - sp.at < sp.dur) return true
          // angekommen: das Ziel glimmt kurz nach
          if (!s.pulses.has(sp.b)) s.pulses.set(sp.b, { kind: sp.kind, at: now, weak: true })
          return false
        })
        s.sparks = left
      }
      const busy = s.dirty || s.pulses.size > 0 || s.sparks.length > 0 || s.born.size > 0
      // Treiben nur, solange man hinschaut oder Claude etwas tut – danach Standbild ohne Kosten
      const since = now - s.awake
      const drift = !s.calm && !document.hidden && document.hasFocus() && since < AWAKE_MS
      if (!busy && !(drift && now - s.lastDraw >= 1000 / DRIFT_FPS - 2)) return
      s.dirty = false
      s.lastDraw = now
      const dpr = s.dpr
      const k = s.t.k
      const amp = drift ? DRIFT_AMP * Math.min(1, (AWAKE_MS - since) / 2500) : 0
      for (const n of s.nodes) {
        if (n.x === undefined) continue
        n.px = n.x + (amp ? Math.cos(now / 1700 + n.ph) * amp : 0)
        n.py = n.y! + (amp ? Math.sin(now / 2100 + n.ph) * amp : 0)
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, s.size.w, s.size.h)
      ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * s.t.x, dpr * s.t.y)

      const focus = s.hover ?? s.selected
      const near = focus ? new Set([focus, ...(s.neighbors.get(focus) ?? [])]) : null
      const q = s.query
      const matches = (n: SimNode): boolean => !q || n.label.toLowerCase().includes(q)
      const dimmed = (n: SimNode): boolean => (near ? !near.has(n.id) : false) || !matches(n)
      const grow = (n: SimNode): number => {
        const b = s.born.get(n.id)
        if (b === undefined) return 1
        const p = Math.min(1, (now - b) / BORN_MS)
        return 0.4 + 0.6 * (1 - Math.pow(1 - p, 3))
      }

      // Kanten – nach Aussehen gebündelt, ein Strich-Aufruf pro Gruppe
      const groups = new Map<string, { color: string; width: number; dash: boolean; seg: number[] }>()
      const add = (color: string, width: number, dash: boolean, a: SimNode, b: SimNode): void => {
        const key = color + '|' + width + '|' + dash
        let g = groups.get(key)
        if (!g) groups.set(key, (g = { color, width, dash, seg: [] }))
        g.seg.push(a.px, a.py, b.px, b.py)
      }
      const sk = Math.sqrt(k)
      for (const l of s.links) {
        const a = l.source as SimNode
        const b = l.target as SimNode
        if (a.x === undefined || b.x === undefined) continue
        const hot = !!near && near.has(a.id) && near.has(b.id) && (a.id === focus || b.id === focus)
        const faded = (near && !hot) || (q && !(matches(a) && matches(b)))
        if (l.kind === 'link') add(hot ? 'rgba(159,184,255,.85)' : faded ? 'rgba(159,184,255,.07)' : 'rgba(159,184,255,.26)', (hot ? 1.8 : 1.1) / sk, false, a, b)
        else if (l.kind === 'file') add(hot ? 'rgba(223,229,239,.55)' : faded ? 'rgba(223,229,239,.04)' : 'rgba(223,229,239,.13)', 0.9 / sk, true, a, b)
        else {
          const alpha = Math.round(Math.min(0.25, 0.05 * l.weight) * 20) / 20
          add(hot ? 'rgba(250,204,21,.55)' : faded ? 'rgba(250,204,21,.03)' : `rgba(250,204,21,${alpha})`, Math.round(Math.min(3, 0.6 + l.weight * 0.25) * 2) / 2 / sk, false, a, b)
        }
      }
      for (const g of groups.values()) {
        ctx.beginPath()
        for (let i = 0; i < g.seg.length; i += 4) {
          ctx.moveTo(g.seg[i], g.seg[i + 1])
          ctx.lineTo(g.seg[i + 2], g.seg[i + 3])
        }
        ctx.setLineDash(g.dash ? [3, 3] : [])
        ctx.strokeStyle = g.color
        ctx.lineWidth = g.width
        ctx.stroke()
      }
      ctx.setLineDash([])

      // Leuchten: Grundschein der Notizen + Aufleuchten bei Aktivität (Sprites statt shadowBlur)
      for (const n of s.nodes) {
        if (n.x === undefined || n.kind === 'file' || n.kind === 'missing' || dimmed(n)) continue
        const r = n.r * grow(n) * 3.4
        ctx.globalAlpha = 0.32
        ctx.drawImage(glowSprite(KIND_COLOR[n.kind]), n.px - r, n.py - r, r * 2, r * 2)
      }
      for (const [id, p] of s.pulses) {
        const n = s.byId.get(id)
        if (!n || n.x === undefined) continue
        const tt = (now - p.at) / PULSE_MS
        const r = n.r * (p.weak ? 3 : 4.5)
        ctx.globalAlpha = (1 - tt) * (p.weak ? 0.45 : 0.85)
        ctx.drawImage(glowSprite(PULSE_COLOR[p.kind]), n.px - r, n.py - r, r * 2, r * 2)
        if (p.weak) continue
        for (const off of [0, 0.3]) {
          const u = tt - off
          if (u < 0 || u > 1) continue
          ctx.beginPath()
          ctx.arc(n.px, n.py, n.r + 4 + u * 30, 0, Math.PI * 2)
          ctx.strokeStyle = PULSE_COLOR[p.kind]
          ctx.globalAlpha = (1 - u) * 0.75
          ctx.lineWidth = 1.6 / k
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1

      // Funken entlang der Verbindungen
      for (const sp of s.sparks) {
        const a = s.byId.get(sp.a)
        const b = s.byId.get(sp.b)
        if (!a || !b || a.x === undefined || b.x === undefined) continue
        const u = Math.min(1, (now - sp.at) / sp.dur)
        const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2
        const x = a.px + (b.px - a.px) * e
        const y = a.py + (b.py - a.py) * e
        const r = 9 / Math.max(0.6, sk)
        ctx.globalAlpha = 0.9
        ctx.drawImage(glowSprite(PULSE_COLOR[sp.kind]), x - r, y - r, r * 2, r * 2)
        ctx.globalAlpha = 1
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(x, y, 1.5 / Math.max(0.6, sk), 0, Math.PI * 2)
        ctx.fill()
      }

      // Knoten
      for (const n of s.nodes) {
        if (n.x === undefined) continue
        const dim = dimmed(n)
        const r = n.r * grow(n)
        ctx.globalAlpha = dim ? 0.18 : 1
        ctx.beginPath()
        ctx.arc(n.px, n.py, r, 0, Math.PI * 2)
        if (n.kind === 'missing') {
          ctx.setLineDash([2.5, 2.5])
          ctx.strokeStyle = KIND_COLOR.missing
          ctx.lineWidth = 1.2 / k
          ctx.stroke()
          ctx.setLineDash([])
        } else {
          ctx.fillStyle = n.kind === 'file' && s.heatOn ? (n.heat !== undefined ? heatColor(n.heat) : COLD_FILE) : KIND_COLOR[n.kind]
          ctx.fill()
        }
        if (s.heatOn && n.unlinked) {
          // Hotspot ohne Notiz: gepunkteter Ring
          ctx.beginPath()
          ctx.arc(n.px, n.py, r + 3.5, 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'
          ctx.lineWidth = 1.3 / k
          ctx.setLineDash([1.5, 2.5])
          ctx.stroke()
          ctx.setLineDash([])
        }
        if (n.stale) {
          ctx.beginPath()
          ctx.arc(n.px, n.py, r + 3, 0, Math.PI * 2)
          ctx.strokeStyle = '#fb923c'
          ctx.lineWidth = 1.6 / k
          ctx.setLineDash([4, 3])
          ctx.stroke()
          ctx.setLineDash([])
        }
        if (n.id === s.selected) {
          ctx.beginPath()
          ctx.arc(n.px, n.py, r + 5, 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(255,255,255,.9)'
          ctx.lineWidth = 1.6 / k
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1

      // Beschriftungen im Bildschirm-Maßstab: wichtigste zuerst, nichts überlappt
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(6, 8, 14, .85)'
      const placed: number[] = []
      const free = (x0: number, y0: number, x1: number, y1: number): boolean => {
        for (let i = 0; i < placed.length; i += 4) if (x0 < placed[i + 2] && x1 > placed[i] && y0 < placed[i + 3] && y1 > placed[i + 1]) return false
        return true
      }
      const important = (n: SimNode): boolean => n.id === focus || n.id === s.selected || (near?.has(n.id) ?? false) || (!!q && matches(n))
      const first = s.order.filter(important)
      let count = 0
      const budget = labelBudget(k) + first.length
      for (const n of first.length ? [...first, ...s.order] : s.order) {
        if (count >= budget) break
        if (n.x === undefined) continue
        const imp = important(n)
        if (!imp && (dimmed(n) || (n.kind === 'file' && k < 1.5) || (n.kind === 'missing' && k < 0.9))) continue
        const label = shortLabel(n)
        const w = textW(n, label)
        const x = s.t.x + n.px * k
        const y = s.t.y + n.py * k + n.r * k + 4
        if (x + w / 2 < 0 || x - w / 2 > s.size.w || y > s.size.h || y + 14 < 0) continue
        // etwas Luft um jede Beschriftung, damit es nicht zur Textwand wird
        const box = imp ? [x - w / 2 - 3, y - 1, x + w / 2 + 3, y + 14] : [x - w / 2 - 10, y - 5, x + w / 2 + 10, y + 19]
        if (!free(box[0], box[1], box[2], box[3])) continue
        placed.push(...box)
        count++
        ctx.font = n.kind === 'file' ? FILE_FONT : NOTE_FONT
        ctx.globalAlpha = dimmed(n) ? 0.35 : n.kind === 'file' || n.kind === 'missing' ? 0.7 : 0.95
        ctx.fillStyle = n.kind === 'missing' ? 'rgba(223,229,239,.6)' : '#dfe5ef'
        ctx.strokeText(label, x, y)
        ctx.fillText(label, x, y)
        if (s.heatOn && n.commits && (n.id === focus || n.id === s.selected)) {
          ctx.font = '400 10px Inter, system-ui, sans-serif'
          ctx.fillStyle = heatColor(n.heat ?? 0)
          ctx.globalAlpha = 1
          const txt = tn(n.commits, '{n} Commit in 90 Tagen', '{n} Commits in 90 Tagen')
          ctx.strokeText(txt, x, y + 15)
          ctx.fillText(txt, x, y + 15)
          placed.push(x - 60, y + 14, x + 60, y + 28)
        }
      }
      ctx.globalAlpha = 1
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  // ---------- Maus ----------
  useEffect(() => {
    const canvas = canvasRef.current!
    const s = st.current
    const world = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
      const r = canvas.getBoundingClientRect()
      return { x: (e.clientX - r.left - s.t.x) / s.t.k, y: (e.clientY - r.top - s.t.y) / s.t.k }
    }
    const hit = (e: { clientX: number; clientY: number }): SimNode | null => {
      const p = world(e)
      let best: SimNode | null = null
      let bestD = Infinity
      for (const n of s.nodes) {
        if (n.x === undefined) continue
        const d = Math.hypot(n.px - p.x, n.py - p.y)
        if (d < n.r + 6 / s.t.k && d < bestD) {
          best = n
          bestD = d
        }
      }
      return best
    }

    let drag: null | { node: SimNode | null; sx: number; sy: number; tx: number; ty: number; moved: boolean } = null
    const down = (e: PointerEvent): void => {
      if (e.button !== 0) return
      canvas.setPointerCapture(e.pointerId)
      const node = hit(e)
      drag = { node, sx: e.clientX, sy: e.clientY, tx: s.t.x, ty: s.t.y, moved: false }
      s.anim = null
    }
    const move = (e: PointerEvent): void => {
      s.awake = performance.now()
      if (!drag) {
        const h = hit(e)?.id ?? null
        if (h !== s.hover) {
          s.hover = h
          s.dirty = true
          canvas.style.cursor = h ? 'pointer' : 'grab'
        }
        return
      }
      const dx = e.clientX - drag.sx
      const dy = e.clientY - drag.sy
      if (!drag.moved && Math.hypot(dx, dy) < 4) return
      drag.moved = true
      if (drag.node) {
        const p = world(e)
        drag.node.fx = p.x
        drag.node.fy = p.y
        s.sim?.alphaTarget(0.25).restart()
      } else {
        s.t = { ...s.t, x: drag.tx + dx, y: drag.ty + dy }
        canvas.style.cursor = 'grabbing'
      }
      s.dirty = true
    }
    const up = (e: PointerEvent): void => {
      if (!drag) return
      if (drag.node) {
        drag.node.fx = null
        drag.node.fy = null
        s.sim?.alphaTarget(0)
      }
      if (!drag.moved) onSelectRef.current(drag.node?.id ?? null)
      drag = null
      canvas.style.cursor = hit(e) ? 'pointer' : 'grab'
    }
    const leave = (): void => {
      if (s.hover) {
        s.hover = null
        s.dirty = true
      }
    }
    const wheel = (e: WheelEvent): void => {
      e.preventDefault()
      s.awake = performance.now()
      const r = canvas.getBoundingClientRect()
      const mx = e.clientX - r.left
      const my = e.clientY - r.top
      const k = Math.max(0.2, Math.min(4, s.t.k * Math.exp(-e.deltaY * 0.0015)))
      s.t = { k, x: mx - ((mx - s.t.x) / s.t.k) * k, y: my - ((my - s.t.y) / s.t.k) * k }
      s.anim = null
      s.dirty = true
    }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointerleave', leave)
    canvas.addEventListener('wheel', wheel, { passive: false })
    return () => {
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointerleave', leave)
      canvas.removeEventListener('wheel', wheel)
    }
  }, [])

  return <canvas ref={canvasRef} className="brain-canvas" data-testid="brain-canvas" />
})

/** Wie wichtig ist eine Beschriftung? Notizen vor Dateien, Bereiche und gut vernetzte zuerst. */
function score(n: SimNode): number {
  if (n.kind === 'file') return n.weight
  if (n.kind === 'missing') return 5
  return 20 + n.weight * 10 + (n.kind === 'module' ? 8 : 0) + (n.stale ? 2 : 0)
}
