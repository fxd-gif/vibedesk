// Layout-Rechnung des Gehirn-Graphen – zwei gleichwertige Engines hinter einer Schnittstelle:
// „rust“ (native/layout als WebAssembly, schnell) und „js“ (d3-force, Rückfall ohne WebAssembly).
// Beide bekommen dieselben Arrays und dieselben Kräfte; die Tests laufen für beide (tests/brainLayout.test.ts).
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from 'd3-force'

/** Kräfte – dieselben Werte stecken als Params::default() in native/layout/src/lib.rs */
export const FORCES = { theta: 0.9, distanceMax: 420, center: 0.05, gravity: 0.035, velocityDecay: 0.4 }
/** wie d3: alpha nähert sich dem Ziel um 3 % je Schritt, unter 0,001 ist Ruhe */
export const ALPHA_DECAY = 0.03
export const ALPHA_MIN = 0.001

export interface LayoutInput {
  /** Startposition, NaN = noch keine (dann Spirale um die Mitte) */
  x: Float64Array
  y: Float64Array
  /** Kollisionsradius (Knoten + Luft) */
  r: Float64Array
  /** Ladung, negativ = Abstoßung */
  charge: Float64Array
  src: Uint32Array
  dst: Uint32Array
  /** Wunschlänge und Stärke je Feder */
  dist: Float64Array
  strength: Float64Array
}

export interface LayoutEngine {
  readonly kind: 'rust' | 'js'
  tick(alpha: number): void
  read(x: Float32Array, y: Float32Array): void
  /** Knoten festhalten (ziehen) bzw. loslassen */
  fix(i: number, x: number, y: number): void
  free(i: number): void
  dispose(): void
}

/** d3-force mit derselben Konfiguration wie früher im Fenster */
export function jsEngine(input: LayoutInput): LayoutEngine {
  type N = SimulationNodeDatum & { i: number }
  const n = input.x.length
  const nodes: N[] = Array.from({ length: n }, (_, i) => ({ i, index: i, ...(Number.isFinite(input.x[i]) && Number.isFinite(input.y[i]) ? { x: input.x[i], y: input.y[i] } : {}) }))
  const links = Array.from(input.src, (s, i) => ({ source: s, target: input.dst[i], i }))
  const sim = forceSimulation<N>(nodes)
    .stop()
    .alphaDecay(0)
    .velocityDecay(FORCES.velocityDecay)
    .force(
      'link',
      forceLink<N, { source: number | N; target: number | N; i: number }>(links)
        .id((d) => d.i)
        .distance((l) => input.dist[l.i])
        .strength((l) => input.strength[l.i])
    )
    .force('charge', forceManyBody<N>().strength((d) => input.charge[d.i]).distanceMax(FORCES.distanceMax).theta(FORCES.theta))
    .force('collide', forceCollide<N>((d) => input.r[d.i]))
    .force('center', forceCenter(0, 0).strength(FORCES.center))
    .force('x', forceX(0).strength(FORCES.gravity))
    .force('y', forceY(0).strength(FORCES.gravity))
  return {
    kind: 'js',
    tick(alpha) {
      sim.alpha(alpha).tick()
    },
    read(x, y) {
      for (let i = 0; i < n; i++) {
        x[i] = nodes[i].x!
        y[i] = nodes[i].y!
      }
    },
    fix(i, x, y) {
      nodes[i].fx = x
      nodes[i].fy = y
    },
    free(i) {
      nodes[i].fx = null
      nodes[i].fy = null
    },
    dispose() {
      sim.stop()
    }
  }
}

interface LayoutExports {
  memory: WebAssembly.Memory
  layout_new(n: number, m: number): number
  layout_free(l: number): void
  layout_prepare(l: number): void
  layout_tick(l: number, alpha: number): void
  layout_x(l: number): number
  layout_y(l: number): number
  layout_r(l: number): number
  layout_charge(l: number): number
  layout_fx(l: number): number
  layout_fy(l: number): number
  layout_src(l: number): number
  layout_dst(l: number): number
  layout_dist(l: number): number
  layout_strength(l: number): number
}

/** native/layout als WebAssembly – je Graph eine eigene Instanz, so bleibt kein Speicher liegen */
export function wasmEngine(mod: WebAssembly.Module, input: LayoutInput): LayoutEngine {
  const e = new WebAssembly.Instance(mod, {}).exports as unknown as LayoutExports
  const n = input.x.length
  const m = input.src.length
  const l = e.layout_new(n, m)
  // Ansichten jedes Mal neu: wächst der Speicher, werden alte Ansichten ungültig
  const f64 = (ptr: number, len: number): Float64Array => new Float64Array(e.memory.buffer, ptr, len)
  const u32 = (ptr: number, len: number): Uint32Array => new Uint32Array(e.memory.buffer, ptr, len)
  f64(e.layout_x(l), n).set(input.x)
  f64(e.layout_y(l), n).set(input.y)
  f64(e.layout_r(l), n).set(input.r)
  f64(e.layout_charge(l), n).set(input.charge)
  u32(e.layout_src(l), m).set(input.src)
  u32(e.layout_dst(l), m).set(input.dst)
  f64(e.layout_dist(l), m).set(input.dist)
  f64(e.layout_strength(l), m).set(input.strength)
  e.layout_prepare(l)
  let alive = true
  return {
    kind: 'rust',
    tick(alpha) {
      if (alive) e.layout_tick(l, alpha)
    },
    read(x, y) {
      const X = f64(e.layout_x(l), n)
      const Y = f64(e.layout_y(l), n)
      for (let i = 0; i < n; i++) {
        x[i] = X[i]
        y[i] = Y[i]
      }
    },
    fix(i, x, y) {
      f64(e.layout_fx(l), n)[i] = x
      f64(e.layout_fy(l), n)[i] = y
    },
    free(i) {
      f64(e.layout_fx(l), n)[i] = NaN
      f64(e.layout_fy(l), n)[i] = NaN
    },
    dispose() {
      if (alive) e.layout_free(l)
      alive = false
    }
  }
}
