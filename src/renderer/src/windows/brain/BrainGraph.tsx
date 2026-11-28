// Lebendiger Graph des Gehirns: WebGL + Canvas, Layout im Worker (Rust/WebAssembly, sonst d3-force). Zoomen (Rad), Verschieben (Hintergrund ziehen),
// Knoten ziehen, Nachbarn beim Überfahren hervorheben. Wenn Claude etwas anfasst, leuchtet der Knoten auf,
// ein Ring breitet sich aus und Funken laufen die Verbindungen entlang – wie auf der Website.
// Leistung: kein shadowBlur, Leucht-Sprites statt Schatten, Kanten als gebündelte Haarlinien, Knoten als Bilder,
// nur Sichtbares zeichnen, Beschriftungen ohne Überlappung, Zeichenfläche höchstens 1,5-fach, Ruhe-Treiben nur mit Fokus und gedrosselt.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { BrainGraph as Graph, GraphEdge, GraphNode, GraphNodeKind, NoteType } from '../../../../shared/brain'
import { heatColor, type HotNode } from '../../../../shared/hotspots'
import { t, tn } from '../../../../shared/i18n'
import { canvasDpr } from '../../ambience/framePolicy'
import { DASHED, DISC as DISC_GL, GLOW, GlFrame, GraphGl, RING, rgba } from './graphGl'
import { layoutClient, type LayoutClient } from './layout/client'
import type { LayoutInput } from './layout/engine'

export const KIND_COLOR: Record<GraphNodeKind, string> = {
  module: '#8fa6c8',
  decision: '#b49cff',
  pitfall: '#ff8a8a',
  convention: '#5fd497',
  task: '#f3b94d',
  fact: '#6ad7e5',
  file: 'rgba(227, 231, 239, 0.45)',
  missing: 'rgba(227, 231, 239, 0.35)'
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

const PULSE_COLOR = { read: '#6ad7e5', edit: '#5fd497', write: '#b49cff' } as const
type PulseKind = keyof typeof PULSE_COLOR
const PULSE_MS = 1800
const BORN_MS = 700
/** Datei ohne Commits, solange Hotspots an sind – tritt zurück */
const COLD_FILE = 'rgba(227, 231, 239, 0.22)'
/** Ruhe-Treiben: Bildrate und Ausschlag (Weltkoordinaten) */
const DRIFT_FPS = 24
const DRIFT_AMP = 2.6
/** so lange nach Maus oder Aktivität treibt der Graph, danach Standbild */
const AWAKE_MS = 15000
/** Beschriftungen: weit weg nur die wichtigsten, beim Hineinzoomen mehr */
const labelBudget = (k: number): number => Math.round(Math.max(14, Math.min(80, 14 + (k - 0.5) * 60)))
const MAX_SPARKS = 8
/** Grundschein höchstens so groß (CSS-Pixel): beim Hineinzoomen überdecken sich sonst Hunderte riesiger Flächen (Füllrate) */
const GLOW_MAX = 56

/** Knoten im Bild: i = Platz in den Layout-Arrays, x/y aus dem Layout (fehlt bis zur ersten Antwort), px/py mit Treiben */
type SimNode = HotNode & { i: number; x?: number; y?: number; r: number; ph: number; px: number; py: number }
type SimLink = { source: SimNode; target: SimNode; kind: GraphEdge['kind']; weight: number }

/** Federn und Ladungen – wie zuvor in der d3-Konfiguration */
const linkDist = (k: GraphEdge['kind']): number => (k === 'link' ? 90 : k === 'file' ? 55 : 70)
const linkStrength = (k: GraphEdge['kind'], w: number): number => (k === 'co' ? Math.min(0.3, 0.05 * w) : k === 'file' ? 0.5 : 0.35)

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
const NOTE_FONT = '500 11.5px "Instrument Sans", system-ui, sans-serif'
const FILE_FONT = '400 10.5px "JetBrains Mono", monospace'

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

/** Knoten als vorgerenderte Scheibe – drawImage ist auf der GPU viel billiger als ein Pfad je Knoten */
const DISC = 64
const discs = new Map<string, HTMLCanvasElement>()
function discSprite(color: string): HTMLCanvasElement {
  let c = discs.get(color)
  if (c) return c
  c = document.createElement('canvas')
  c.width = c.height = DISC
  const g = c.getContext('2d')!
  g.fillStyle = color
  g.beginPath()
  g.arc(DISC / 2, DISC / 2, DISC / 2 - 1, 0, Math.PI * 2)
  g.fill()
  discs.set(color, c)
  return c
}

export const BrainGraph = forwardRef<GraphHandle, Props>(function BrainGraph({ graph, hidden, query, selected, heatOn = false, calm = false, onSelect }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  /** WebGL-Ebene darunter: Kanten, Knoten, Ringe; null = alles auf dem 2D-Canvas */
  const glCanvasRef = useRef<HTMLCanvasElement>(null)
  const glRef = useRef<GraphGl | null>(null)
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
    layout: null as LayoutClient | null,
    /** Generation des Graphen – Positionen eines älteren Graphen werden verworfen */
    gen: 0,
    /** welche Engine rechnet (für Messungen und Diagnose) */
    engine: '' as '' | 'rust' | 'js',
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
    awake: performance.now(),
    frame: new GlFrame()
  })
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // ---------- Layout im Worker: Positionen kommen als Arrays zurück ----------
  useEffect(() => {
    const s = st.current
    s.layout = layoutClient((m) => {
      if (m.gen !== s.gen) return
      for (let i = 0; i < s.nodes.length && i < m.x.length; i++) {
        s.nodes[i].x = m.x[i]
        s.nodes[i].y = m.y[i]
      }
      if (s.engine !== m.engine && canvasRef.current) canvasRef.current.dataset.layout = m.engine
      s.engine = m.engine
      s.dirty = true
    })
    if (s.nodes.length) s.dirty = true
    return () => {
      s.layout?.dispose()
      s.layout = null
    }
  }, [])

  // ---------- Daten → Layout ----------
  useEffect(() => {
    const s = st.current
    for (const n of s.nodes) if (n.x !== undefined && n.y !== undefined) s.pos.set(n.id, { x: n.x, y: n.y })
    const known = new Set(s.nodes.map((n) => n.id))
    const visible = (n: GraphNode): boolean => !hidden.has(n.kind) && !(n.kind === 'missing' && hidden.has('fact'))
    const ids = new Set(graph.nodes.filter(visible).map((n) => n.id))
    const edges = graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target))
    const neighbors = new Map<string, Set<string>>()
    for (const e of edges) {
      if (!neighbors.has(e.source)) neighbors.set(e.source, new Set())
      if (!neighbors.has(e.target)) neighbors.set(e.target, new Set())
      neighbors.get(e.source)!.add(e.target)
      neighbors.get(e.target)!.add(e.source)
    }
    const now = performance.now()
    const nodes: SimNode[] = graph.nodes.filter(visible).map((n, i) => {
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
      return { ...n, i, r: radius(n), ph: phaseOf(n.id), px: p?.x ?? 0, py: p?.y ?? 0, ...(p ? { x: p.x, y: p.y } : {}) }
    })
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const links: SimLink[] = edges.map((e) => ({ source: byId.get(e.source)!, target: byId.get(e.target)!, kind: e.kind, weight: e.weight }))
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
    const input: LayoutInput = {
      x: Float64Array.from(nodes, (n) => n.x ?? NaN),
      y: Float64Array.from(nodes, (n) => n.y ?? NaN),
      r: Float64Array.from(nodes, (n) => n.r + 6),
      charge: Float64Array.from(nodes, (n) => (n.kind === 'file' ? -70 : -260)),
      src: Uint32Array.from(links, (l) => l.source.i),
      dst: Uint32Array.from(links, (l) => l.target.i),
      dist: Float64Array.from(links, (l) => linkDist(l.kind)),
      strength: Float64Array.from(links, (l) => linkStrength(l.kind, l.weight))
    }
    s.gen++
    // beim ersten Öffnen erst einpendeln, dann zeigen – kein wildes Auseinanderfliegen
    const first = fresh && !s.loaded
    s.layout?.send({ type: 'set', gen: s.gen, input, warm: first ? 160 : 0, alpha: first ? 0.06 : fresh ? 0.5 : 0.3 })
    if (first) s.needFit = true
    s.loaded = nodes.length > 0
    s.dirty = true
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

  /** false: noch keine Positionen (Layout rechnet noch) */
  function fitView(instant: boolean): boolean {
    const s = st.current
    const ns = s.nodes.filter((n) => n.x !== undefined)
    if (!ns.length || !s.size.w) return false
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
    return true
  }
  const fit = (): void => void fitView(false)

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
    const glCanvas = glCanvasRef.current!
    // WebGL, außer abgeschaltet (localStorage vibedesk.brainGl = 0, zum Vergleichen) oder nicht verfügbar
    const glWanted = ((): boolean => {
      try {
        return localStorage.getItem('vibedesk.brainGl') !== '0'
      } catch {
        return true
      }
    })()
    glRef.current = glWanted ? GraphGl.create(glCanvas) : null
    // Kontext verloren (Treiber-Neustart, zu viele Kontexte): ab dann Canvas 2D
    const onLost = (e: Event): void => {
      e.preventDefault()
      glRef.current = null
      s.dirty = true
    }
    glCanvas.addEventListener('webglcontextlost', onLost)

    const resize = (): void => {
      const r = canvas.getBoundingClientRect()
      s.dpr = canvasDpr(s.calm, window.devicePixelRatio)
      canvas.width = Math.round(r.width * s.dpr)
      canvas.height = Math.round(r.height * s.dpr)
      glCanvas.width = canvas.width
      glCanvas.height = canvas.height
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
      if (s.needFit && fitView(true)) s.needFit = false
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

      // Sichtbarer Ausschnitt in Weltkoordinaten (mit Rand für Leuchten und Ringe)
      const vx0 = -s.t.x / k - 60
      const vy0 = -s.t.y / k - 60
      const vx1 = (s.size.w - s.t.x) / k + 60
      const vy1 = (s.size.h - s.t.y) / k + 60
      const inView = (n: SimNode): boolean => n.px > vx0 && n.px < vx1 && n.py > vy0 && n.py < vy1
      // Welt → Gerätepixel
      const K = dpr * k
      const OX = dpr * s.t.x
      const OY = dpr * s.t.y
      const sk = Math.sqrt(k)

      // Kanten: Farbe je Art und Zustand; breit sind nur die wenigen am Fokus
      const edgeLook = (l: SimLink, a: SimNode, b: SimNode): { color: string; width: number } => {
        const hot = !!near && near.has(a.id) && near.has(b.id) && (a.id === focus || b.id === focus)
        const faded = (near && !hot) || (q && !(matches(a) && matches(b)))
        let color: string
        if (l.kind === 'link') color = hot ? 'rgba(143, 166, 200, .85)' : faded ? 'rgba(143, 166, 200, .09)' : 'rgba(143, 166, 200, .36)'
        else if (l.kind === 'file') color = hot ? 'rgba(227, 231, 239, .55)' : faded ? 'rgba(227, 231, 239, .04)' : 'rgba(227, 231, 239, .14)'
        else {
          const alpha = Math.round(Math.min(0.35, 0.07 * l.weight) * 20) / 20
          color = hot ? 'rgba(243, 185, 77, .55)' : faded ? 'rgba(243, 185, 77, .03)' : `rgba(243, 185, 77, ${alpha})`
        }
        const width = hot ? Math.round((l.kind === 'co' ? Math.min(3, 0.6 + l.weight * 0.25) : l.kind === 'link' ? 1.8 : 1.1) * sk * dpr * 2) / 2 : 0
        return { color, width }
      }
      const nodeFill = (n: SimNode): string =>
        n.kind === 'file' && s.heatOn ? (n.heat !== undefined ? heatColor(Math.round(n.heat * 12) / 12) : COLD_FILE) : KIND_COLOR[n.kind]
      const visibleLinks = (each: (l: SimLink, a: SimNode, b: SimNode) => void): void => {
        for (const l of s.links) {
          const a = l.source as SimNode
          const b = l.target as SimNode
          if (a.x === undefined || b.x === undefined) continue
          if ((a.px < vx0 && b.px < vx0) || (a.px > vx1 && b.px > vx1) || (a.py < vy0 && b.py < vy0) || (a.py > vy1 && b.py > vy1)) continue
          each(l, a, b)
        }
      }

      const gl = glRef.current
      if (gl) {
        // ---- WebGL: Kanten, Leuchten, Knoten und Ringe in drei Zeichenaufrufen ----
        const f = s.frame
        f.reset()
        visibleLinks((l, a, b) => {
          const { color, width } = edgeLook(l, a, b)
          const x0 = a.px * K + OX
          const y0 = a.py * K + OY
          const x1 = b.px * K + OX
          const y1 = b.py * K + OY
          if (width) f.wide(x0, y0, x1, y1, width, rgba(color))
          else f.line(x0, y0, x1, y1, rgba(color))
        })
        for (const n of s.nodes) {
          if (n.x === undefined || n.kind === 'file' || n.kind === 'missing' || dimmed(n) || !inView(n)) continue
          f.circle(n.px * K + OX, n.py * K + OY, Math.min(n.r * grow(n) * 3.4 * K, GLOW_MAX * dpr), GLOW, rgba(KIND_COLOR[n.kind]), 0.32)
        }
        for (const n of s.nodes) {
          if (n.x === undefined || !inView(n)) continue
          const al = dimmed(n) ? 0.18 : 1
          const r = n.r * grow(n) * K
          const x = n.px * K + OX
          const y = n.py * K + OY
          if (n.kind === 'missing') f.circle(x, y, r, DASHED, rgba(KIND_COLOR.missing), al, 1.2 * dpr)
          else f.circle(x, y, r, DISC_GL, rgba(nodeFill(n)), al)
          if (s.heatOn && n.unlinked) f.circle(x, y, r + 3.5 * K, DASHED, rgba('rgba(255, 255, 255, 0.7)'), al, 1.3 * dpr)
          if (n.stale) f.circle(x, y, r + 3 * K, DASHED, rgba('#f3b94d'), al, 1.6 * dpr)
          if (n.id === s.selected) f.circle(x, y, r + 5 * K, RING, rgba('rgba(255,255,255,.9)'), 1, 1.6 * dpr)
        }
        gl.draw(f, Math.round(s.size.w * dpr), Math.round(s.size.h * dpr))
      } else {
        // ---- Canvas 2D (ohne WebGL): Kanten als gebündelte Haarlinien – breitere Striche schickt Skia auf der GPU
        // in einen langsamen Weg (gemessen mit 2.200 Kanten: 11 → 45 fps) –, Knoten als Bilder ----
        const thin = new Map<string, number[]>()
        const wide = new Map<string, { color: string; width: number; seg: number[] }>()
        visibleLinks((l, a, b) => {
          const { color, width } = edgeLook(l, a, b)
          let seg: number[]
          if (width) {
            const key = color + '|' + width
            let g = wide.get(key)
            if (!g) wide.set(key, (g = { color, width, seg: [] }))
            seg = g.seg
          } else {
            let g = thin.get(color)
            if (!g) thin.set(color, (g = []))
            seg = g
          }
          seg.push(a.px * K + OX, a.py * K + OY, b.px * K + OX, b.py * K + OY)
        })
        const strokeAll = (seg: number[], color: string, width: number): void => {
          ctx.beginPath()
          for (let i = 0; i < seg.length; i += 4) {
            ctx.moveTo(seg[i], seg[i + 1])
            ctx.lineTo(seg[i + 2], seg[i + 3])
          }
          ctx.strokeStyle = color
          ctx.lineWidth = width
          ctx.stroke()
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        for (const [color, seg] of thin) strokeAll(seg, color, 1)
        for (const g of wide.values()) strokeAll(g.seg, g.color, g.width)
        ctx.setTransform(K, 0, 0, K, OX, OY)

        // Grundschein der Notizen (Sprites statt shadowBlur)
        for (const n of s.nodes) {
          if (n.x === undefined || n.kind === 'file' || n.kind === 'missing' || dimmed(n) || !inView(n)) continue
          const r = Math.min(n.r * grow(n) * 3.4, GLOW_MAX / k)
          ctx.globalAlpha = 0.32
          ctx.drawImage(glowSprite(KIND_COLOR[n.kind]), n.px - r, n.py - r, r * 2, r * 2)
        }
        const ring = (n: SimNode, r: number, color: string, width: number, dash: number[]): void => {
          ctx.beginPath()
          ctx.arc(n.px, n.py, r, 0, Math.PI * 2)
          ctx.strokeStyle = color
          ctx.lineWidth = width / k
          ctx.setLineDash(dash)
          ctx.stroke()
          ctx.setLineDash([])
        }
        // Knoten – als Bild; nur bei starkem Zoom (das Bild würde unscharf) als Pfad
        for (const n of s.nodes) {
          if (n.x === undefined || !inView(n)) continue
          const r = n.r * grow(n)
          ctx.globalAlpha = dimmed(n) ? 0.18 : 1
          if (n.kind === 'missing') ring(n, r, KIND_COLOR.missing, 1.2, [2.5, 2.5])
          else if (r * K > DISC / 2) {
            ctx.beginPath()
            ctx.arc(n.px, n.py, r, 0, Math.PI * 2)
            ctx.fillStyle = nodeFill(n)
            ctx.fill()
          } else {
            const R = (r * DISC) / (DISC - 2)
            ctx.drawImage(discSprite(nodeFill(n)), n.px - R, n.py - R, R * 2, R * 2)
          }
          // Hotspot ohne Notiz: gepunkteter Ring
          if (s.heatOn && n.unlinked) ring(n, r + 3.5, 'rgba(255, 255, 255, 0.7)', 1.3, [1.5, 2.5])
          if (n.stale) ring(n, r + 3, '#f3b94d', 1.6, [4, 3])
          if (n.id === s.selected) {
            ctx.globalAlpha = 1
            ring(n, r + 5, 'rgba(255,255,255,.9)', 1.6, [])
          }
        }
        ctx.globalAlpha = 1
      }

      // Aufleuchten bei Aktivität und Funken entlang der Verbindungen – wenige, daher auf dem 2D-Canvas darüber
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

      // Beschriftungen im Bildschirm-Maßstab: wichtigste zuerst, nichts überlappt
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(12, 15, 24, .85)'
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
        ctx.fillStyle = n.kind === 'missing' ? 'rgba(227, 231, 239, .6)' : '#e3e7ef'
        ctx.strokeText(label, x, y)
        ctx.fillText(label, x, y)
        if (s.heatOn && n.commits && (n.id === focus || n.id === s.selected)) {
          ctx.font = '400 10px "Instrument Sans", system-ui, sans-serif'
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
      glCanvas.removeEventListener('webglcontextlost', onLost)
      glRef.current?.dispose()
      glRef.current = null
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
        // sofort hier zeigen, das Layout zieht die Nachbarn nach
        drag.node.x = p.x
        drag.node.y = p.y
        s.layout?.send({ type: 'fix', i: drag.node.i, x: p.x, y: p.y })
        s.layout?.send({ type: 'alpha', target: 0.25 })
      } else {
        s.t = { ...s.t, x: drag.tx + dx, y: drag.ty + dy }
        canvas.style.cursor = 'grabbing'
      }
      s.dirty = true
    }
    const up = (e: PointerEvent): void => {
      if (!drag) return
      if (drag.node && drag.moved) {
        s.layout?.send({ type: 'free', i: drag.node.i })
        s.layout?.send({ type: 'alpha', target: 0 })
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

  return (
    <>
      <canvas ref={glCanvasRef} className="brain-canvas brain-gl" aria-hidden />
      <canvas ref={canvasRef} className="brain-canvas" data-testid="brain-canvas" />
    </>
  )
})

/** Wie wichtig ist eine Beschriftung? Notizen vor Dateien, Bereiche und gut vernetzte zuerst. */
function score(n: SimNode): number {
  if (n.kind === 'file') return n.weight
  if (n.kind === 'missing') return 5
  return 20 + n.weight * 10 + (n.kind === 'module' ? 8 : 0) + (n.stale ? 2 : 0)
}
