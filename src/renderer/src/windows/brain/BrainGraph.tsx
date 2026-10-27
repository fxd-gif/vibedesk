// Lebendiger Graph des Gehirns: Canvas + d3-force. Zoomen (Rad), Verschieben (Hintergrund ziehen),
// Knoten ziehen, Nachbarn beim Überfahren hervorheben, Knoten leuchten auf, wenn Claude sie anfasst.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force'
import type { BrainGraph as Graph, GraphEdge, GraphNode, GraphNodeKind, NoteType } from '../../../../shared/brain'
import { heatColor, type HotNode } from '../../../../shared/hotspots'
import { t, tn } from '../../../../shared/i18n'

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
const PULSE_MS = 1800
/** Datei ohne Commits, solange Hotspots an sind – tritt zurück */
const COLD_FILE = 'rgba(223, 229, 239, 0.22)'

type SimNode = HotNode & SimulationNodeDatum & { r: number }
type SimLink = SimulationLinkDatum<SimNode> & { kind: GraphEdge['kind']; weight: number }

export interface GraphHandle {
  focusNode(id: string): void
  pulse(id: string, kind: keyof typeof PULSE_COLOR): boolean
  fit(): void
}

interface Props {
  graph: Graph
  hidden: ReadonlySet<GraphNodeKind>
  query: string
  selected: string | null
  /** Hotspots an: Dateien nach Commits einfärben */
  heatOn?: boolean
  onSelect(id: string | null): void
}

const radius = (n: GraphNode): number => (n.kind === 'file' ? 2.5 + n.weight * 1.3 : 5 + n.weight * 2.4)
const shortLabel = (n: GraphNode): string => (n.kind === 'file' ? n.label.split('/').pop() ?? n.label : n.label)

export const BrainGraph = forwardRef<GraphHandle, Props>(function BrainGraph({ graph, hidden, query, selected, heatOn = false, onSelect }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const st = useRef({
    nodes: [] as SimNode[],
    links: [] as SimLink[],
    byId: new Map<string, SimNode>(),
    neighbors: new Map<string, Set<string>>(),
    pos: new Map<string, { x: number; y: number }>(),
    sim: null as Simulation<SimNode, SimLink> | null,
    t: { k: 1, x: 0, y: 0 },
    size: { w: 0, h: 0 },
    hover: null as string | null,
    selected: null as string | null,
    query: '',
    pulses: new Map<string, { kind: keyof typeof PULSE_COLOR; at: number }>(),
    dirty: true,
    anim: null as null | { from: { k: number; x: number; y: number }; to: { k: number; x: number; y: number }; at: number },
    fitted: false,
    heatOn: false
  })
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // ---------- Daten → Simulation ----------
  useEffect(() => {
    const s = st.current
    s.sim?.stop()
    for (const n of s.nodes) if (n.x !== undefined && n.y !== undefined) s.pos.set(n.id, { x: n.x, y: n.y })
    const nodes: SimNode[] = graph.nodes
      .filter((n) => !hidden.has(n.kind) && !(n.kind === 'missing' && hidden.has('fact')))
      .map((n) => {
        const p = s.pos.get(n.id)
        return { ...n, r: radius(n), ...(p ? { x: p.x, y: p.y } : {}) }
      })
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const links: SimLink[] = graph.edges.filter((e) => byId.has(e.source) && byId.has(e.target)).map((e) => ({ source: e.source, target: e.target, kind: e.kind, weight: e.weight }))
    const neighbors = new Map<string, Set<string>>()
    for (const l of links) {
      const a = l.source as string
      const b = l.target as string
      if (!neighbors.has(a)) neighbors.set(a, new Set())
      if (!neighbors.has(b)) neighbors.set(b, new Set())
      neighbors.get(a)!.add(b)
      neighbors.get(b)!.add(a)
    }
    s.nodes = nodes
    s.links = links
    s.byId = byId
    s.neighbors = neighbors
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
      .alpha(fresh ? 1 : 0.35)
      .alphaDecay(0.03)
      .on('tick', () => {
        s.dirty = true
      })
    if (!s.fitted && nodes.length) {
      // nach dem ersten Einpendeln einpassen
      setTimeout(() => {
        if (!s.fitted) fit()
      }, 900)
    }
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

  // ---------- Kamera ----------
  const animateTo = (to: { k: number; x: number; y: number }): void => {
    const s = st.current
    s.anim = { from: { ...s.t }, to, at: performance.now() }
  }

  function fit(): void {
    const s = st.current
    const ns = s.nodes.filter((n) => n.x !== undefined)
    if (!ns.length || !s.size.w) return
    s.fitted = true
    const xs = ns.map((n) => n.x!)
    const ys = ns.map((n) => n.y!)
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const k = Math.max(0.35, Math.min(1.6, Math.min(s.size.w / (x1 - x0 + 160), s.size.h / (y1 - y0 + 160))))
    animateTo({ k, x: s.size.w / 2 - ((x0 + x1) / 2) * k, y: s.size.h / 2 - ((y0 + y1) / 2) * k })
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
      if (!s.byId.has(id)) return false
      s.pulses.set(id, { kind, at: performance.now() })
      s.dirty = true
      return true
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
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(r.width * dpr)
      canvas.height = Math.round(r.height * dpr)
      if (!s.size.w) s.t = { k: 1, x: r.width / 2, y: r.height / 2 }
      s.size = { w: r.width, h: r.height }
      s.dirty = true
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    resize()

    const draw = (now: number): void => {
      raf = requestAnimationFrame(draw)
      if (s.anim) {
        const p = Math.min(1, (now - s.anim.at) / 450)
        const e = 1 - Math.pow(1 - p, 3)
        const { from, to } = s.anim
        s.t = { k: from.k + (to.k - from.k) * e, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e }
        if (p >= 1) s.anim = null
        s.dirty = true
      }
      for (const [id, p] of s.pulses) if (now - p.at > PULSE_MS) s.pulses.delete(id)
      if (!s.dirty && !s.pulses.size) return
      s.dirty = false
      const dpr = window.devicePixelRatio || 1
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, s.size.w, s.size.h)
      ctx.setTransform(dpr * s.t.k, 0, 0, dpr * s.t.k, dpr * s.t.x, dpr * s.t.y)

      const focus = s.hover ?? s.selected
      const near = focus ? new Set([focus, ...(s.neighbors.get(focus) ?? [])]) : null
      const q = s.query
      const matches = (n: SimNode): boolean => !q || n.label.toLowerCase().includes(q)
      const dimmed = (n: SimNode): boolean => (near ? !near.has(n.id) : false) || !matches(n)

      // Kanten
      for (const l of s.links) {
        const a = l.source as SimNode
        const b = l.target as SimNode
        if (a.x === undefined || b.x === undefined) continue
        const hot = near && near.has(a.id) && near.has(b.id) && (a.id === focus || b.id === focus)
        const faded = (near && !hot) || (q && !(matches(a) && matches(b)))
        ctx.beginPath()
        ctx.moveTo(a.x, a.y!)
        ctx.lineTo(b.x, b.y!)
        if (l.kind === 'link') {
          ctx.strokeStyle = hot ? 'rgba(159,184,255,.85)' : faded ? 'rgba(159,184,255,.07)' : 'rgba(159,184,255,.32)'
          ctx.lineWidth = (hot ? 1.8 : 1.1) / Math.sqrt(s.t.k)
          ctx.setLineDash([])
        } else if (l.kind === 'file') {
          ctx.strokeStyle = hot ? 'rgba(223,229,239,.55)' : faded ? 'rgba(223,229,239,.04)' : 'rgba(223,229,239,.14)'
          ctx.lineWidth = 0.9 / Math.sqrt(s.t.k)
          ctx.setLineDash([3, 3])
        } else {
          ctx.strokeStyle = hot ? 'rgba(250,204,21,.55)' : faded ? 'rgba(250,204,21,.03)' : `rgba(250,204,21,${Math.min(0.25, 0.05 * l.weight)})`
          ctx.lineWidth = Math.min(3, 0.6 + l.weight * 0.25) / Math.sqrt(s.t.k)
          ctx.setLineDash([])
        }
        ctx.stroke()
      }
      ctx.setLineDash([])

      // Pulse unter den Knoten
      for (const [id, p] of s.pulses) {
        const n = s.byId.get(id)
        if (!n || n.x === undefined) continue
        const t = (now - p.at) / PULSE_MS
        for (const off of [0, 0.35]) {
          const tt = t - off
          if (tt < 0 || tt > 1) continue
          ctx.beginPath()
          ctx.arc(n.x, n.y!, n.r + 4 + tt * 34, 0, Math.PI * 2)
          ctx.strokeStyle = PULSE_COLOR[p.kind]
          ctx.globalAlpha = (1 - tt) * 0.8
          ctx.lineWidth = 2 / s.t.k
          ctx.stroke()
        }
        ctx.globalAlpha = 1
        ctx.beginPath()
        ctx.arc(n.x, n.y!, n.r + 3, 0, Math.PI * 2)
        ctx.fillStyle = PULSE_COLOR[p.kind]
        ctx.globalAlpha = 0.25 * (1 - t)
        ctx.fill()
        ctx.globalAlpha = 1
      }

      // Knoten
      for (const n of s.nodes) {
        if (n.x === undefined) continue
        const dim = dimmed(n)
        ctx.globalAlpha = dim ? 0.18 : 1
        ctx.beginPath()
        ctx.arc(n.x, n.y!, n.r, 0, Math.PI * 2)
        if (n.kind === 'missing') {
          ctx.setLineDash([2.5, 2.5])
          ctx.strokeStyle = KIND_COLOR.missing
          ctx.lineWidth = 1.2 / s.t.k
          ctx.stroke()
          ctx.setLineDash([])
        } else {
          if (n.kind !== 'file') {
            ctx.shadowColor = KIND_COLOR[n.kind]
            ctx.shadowBlur = dim ? 0 : 14
          }
          ctx.fillStyle = n.kind === 'file' && s.heatOn ? (n.heat !== undefined ? heatColor(n.heat) : COLD_FILE) : KIND_COLOR[n.kind]
          ctx.fill()
          ctx.shadowBlur = 0
        }
        if (s.heatOn && n.unlinked) {
          // Hotspot ohne Notiz: gepunkteter Ring
          ctx.beginPath()
          ctx.arc(n.x, n.y!, n.r + 3.5, 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'
          ctx.lineWidth = 1.3 / s.t.k
          ctx.setLineDash([1.5, 2.5])
          ctx.stroke()
          ctx.setLineDash([])
        }
        if (n.stale) {
          ctx.beginPath()
          ctx.arc(n.x, n.y!, n.r + 3, 0, Math.PI * 2)
          ctx.strokeStyle = '#fb923c'
          ctx.lineWidth = 1.6 / s.t.k
          ctx.setLineDash([4, 3])
          ctx.stroke()
          ctx.setLineDash([])
        }
        if (n.id === s.selected) {
          ctx.beginPath()
          ctx.arc(n.x, n.y!, n.r + 5, 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(255,255,255,.9)'
          ctx.lineWidth = 1.6 / s.t.k
          ctx.stroke()
        }
      }

      // Beschriftungen (konstante Bildschirmgröße)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      for (const n of s.nodes) {
        if (n.x === undefined) continue
        const important = n.id === focus || n.id === s.selected || (near?.has(n.id) ?? false) || (q && matches(n))
        const show = important || (n.kind === 'file' ? s.t.k > 1.5 : s.t.k > 0.55)
        if (!show || (dimmed(n) && !important)) continue
        const size = (n.kind === 'file' ? 10.5 : 12) / s.t.k
        ctx.font = `${n.kind === 'file' ? 400 : 500} ${size}px ${n.kind === 'file' ? 'JetBrains Mono, monospace' : 'Inter, system-ui, sans-serif'}`
        ctx.globalAlpha = dimmed(n) ? 0.3 : n.kind === 'file' ? 0.7 : 0.95
        ctx.fillStyle = n.kind === 'missing' ? 'rgba(223,229,239,.6)' : '#dfe5ef'
        ctx.shadowColor = 'rgba(0,0,0,.9)'
        ctx.shadowBlur = 4
        ctx.fillText(shortLabel(n), n.x, n.y! + n.r + 4 / s.t.k)
        if (s.heatOn && n.commits && (n.id === focus || n.id === s.selected)) {
          ctx.font = `400 ${10 / s.t.k}px Inter, system-ui, sans-serif`
          ctx.fillStyle = heatColor(n.heat ?? 0)
          ctx.globalAlpha = 1
          ctx.fillText(tn(n.commits, '{n} Commit in 90 Tagen', '{n} Commits in 90 Tagen'), n.x, n.y! + n.r + 4 / s.t.k + size * 1.3)
        }
        ctx.shadowBlur = 0
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
        const d = Math.hypot(n.x - p.x, n.y! - p.y)
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
