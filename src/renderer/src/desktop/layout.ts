import type { WindowRect } from '../../../shared/types'

export const MARGIN = 16
export const GAP = 12
export const SNAP_ZONE = 24

type Item = { id: string; kind: 'terminal' | 'panel' }
type Screen = { w: number; h: number }

function row(ids: string[], x: number, y: number, w: number, h: number): Record<string, WindowRect> {
  const out: Record<string, WindowRect> = {}
  const cw = Math.floor((w - GAP * (ids.length - 1)) / ids.length)
  ids.forEach((id, i) => {
    out[id] = { x: x + i * (cw + GAP), y, w: cw, h }
  })
  return out
}

/** Größte sinnvolle Panel-Größe beim Anordnen – darüber wirken Panels verloren. */
const PANEL_MAX = { w: 1100, h: 760 }

/** Panels ohne Terminals: Raster statt schmaler Streifen, jedes Panel mittig in seiner Zelle. */
function grid(ids: string[], x: number, y: number, w: number, h: number): Record<string, WindowRect> {
  const cols = Math.ceil(Math.sqrt(ids.length))
  const rows = Math.ceil(ids.length / cols)
  const cw = Math.floor((w - GAP * (cols - 1)) / cols)
  const ch = Math.floor((h - GAP * (rows - 1)) / rows)
  const pw = Math.min(cw, PANEL_MAX.w)
  const ph = Math.min(ch, PANEL_MAX.h)
  const out: Record<string, WindowRect> = {}
  ids.forEach((id, i) => {
    const cx = x + (i % cols) * (cw + GAP)
    const cy = y + Math.floor(i / cols) * (ch + GAP)
    out[id] = { x: cx + Math.floor((cw - pw) / 2), y: cy + Math.floor((ch - ph) / 2), w: pw, h: ph }
  })
  return out
}

/** Alte, beim Anordnen entstandene Streifen (z. B. 145 × 844) – solche Größen nicht wiederverwenden. */
export function isSlimRect(r: WindowRect): boolean {
  return r.w < 260 || r.h > r.w * 2.5
}

/** Kachelt Terminals oben (62 % Höhe) und Panels darunter. */
export function arrange(items: Item[], screen: Screen, dockH: number): Record<string, WindowRect> {
  const x = MARGIN
  const y = MARGIN
  const w = screen.w - 2 * MARGIN
  const h = screen.h - dockH - 2 * MARGIN
  const terms = items.filter((i) => i.kind === 'terminal').map((i) => i.id)
  const panels = items.filter((i) => i.kind === 'panel').map((i) => i.id)
  if (!terms.length) return panels.length ? grid(panels, x, y, w, h) : {}
  if (!panels.length) return row(terms, x, y, w, h)
  const th = Math.round(h * 0.62)
  return { ...row(terms, x, y, w, th), ...row(panels, x, y + th + GAP, w, h - th - GAP) }
}

/** Holt gespeicherte Fenster nach Auflösungswechsel zurück in den sichtbaren Bereich. */
export function clampRect(r: WindowRect, screen: Screen, dockH: number): WindowRect {
  const maxH = screen.h - dockH
  const w = Math.min(r.w, screen.w)
  const h = Math.min(r.h, maxH)
  return { x: Math.min(Math.max(0, r.x), screen.w - w), y: Math.min(Math.max(0, r.y), maxH - h), w, h }
}

/** Einrasten an linkem/rechtem Bildschirmrand → halbe Breite. */
export function snapRect(_rect: WindowRect, pointerX: number, screen: Screen, dockH: number): WindowRect | null {
  const half = Math.round(screen.w / 2)
  const h = screen.h - dockH
  if (pointerX <= SNAP_ZONE) return { x: 0, y: 0, w: half, h }
  if (pointerX >= screen.w - SNAP_ZONE) return { x: screen.w - half, y: 0, w: half, h }
  return null
}

/** Gespeicherte Fenster beim Start: Streifen verwerfen (öffnen dann in Standardgröße), Rest auf den Bildschirm holen. */
export function restoreRects(rects: Record<string, WindowRect>, screen: Screen, dockH: number): Record<string, WindowRect> {
  return Object.fromEntries(
    Object.entries(rects)
      .filter(([, r]) => !isSlimRect(r))
      .map(([id, r]) => [id, clampRect(r, screen, dockH)])
  )
}

// ---------- Unsichtbares Raster ----------

/** feines Raster für alles, was nirgends einrastet */
export const GRID = 8
/** so nah (px) muss eine Kante kommen, damit sie magnetisch einrastet */
export const MAGNET = 12
/** Teilungslinien des Bildschirms: Hälften, Drittel, Viertel */
const FRACTIONS = [1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4]

/** Hilfslinie, an der gerade eingerastet wurde (Bildschirmkoordinate) */
export interface Guide {
  axis: 'x' | 'y'
  at: number
}

interface Lines {
  /** Kandidaten für die Anfangskante (links/oben) */
  start: number[]
  /** Kandidaten für die Endkante (rechts/unten) */
  end: number[]
}

function lines(axis: 'x' | 'y', others: WindowRect[], screen: Screen, dockH: number): Lines {
  const lo = MARGIN
  const hi = axis === 'x' ? screen.w - MARGIN : screen.h - dockH - MARGIN
  const start = [lo]
  const end = [hi]
  for (const f of FRACTIONS) {
    const at = Math.round(lo + (hi - lo) * f)
    // zwei Fenster an derselben Teilungslinie lassen genau GAP Abstand
    start.push(at + Math.ceil(GAP / 2))
    end.push(at - Math.floor(GAP / 2))
  }
  for (const o of others) {
    const a = axis === 'x' ? o.x : o.y
    const b = axis === 'x' ? o.x + o.w : o.y + o.h
    start.push(a, b + GAP) // bündig mit dessen Anfang / mit Abstand dahinter
    end.push(b, a - GAP) // bündig mit dessen Ende / mit Abstand davor
  }
  return { start, end }
}

function nearest(v: number, cands: number[]): number | null {
  let best: number | null = null
  for (const c of cands) if (Math.abs(c - v) <= MAGNET && (best === null || Math.abs(c - v) < Math.abs(best - v))) best = c
  return best
}

const toGrid = (v: number): number => MARGIN + Math.round((v - MARGIN) / GRID) * GRID

/**
 * Lässt ein gezogenes oder skaliertes Fenster einrasten: zuerst an Fenster-, Bildschirmkanten und Teilungslinien,
 * sonst aufs feine Raster. Beim Verschieben bleibt die Größe, beim Skalieren die linke obere Ecke.
 */
export function magnetize(
  r: WindowRect,
  others: WindowRect[],
  screen: Screen,
  dockH: number,
  mode: 'move' | 'resize',
  min: { w: number; h: number } = { w: 0, h: 0 }
): { rect: WindowRect; guides: Guide[] } {
  const out = { ...r }
  const guides: Guide[] = []
  for (const axis of ['x', 'y'] as const) {
    const pos = axis === 'x' ? 'x' : 'y'
    const size = axis === 'x' ? 'w' : 'h'
    const L = lines(axis, others, screen, dockH)
    if (mode === 'move') {
      const s = nearest(r[pos], L.start)
      const e = nearest(r[pos] + r[size], L.end)
      const ds = s === null ? Infinity : Math.abs(s - r[pos])
      const de = e === null ? Infinity : Math.abs(e - (r[pos] + r[size]))
      if (s !== null && ds <= de) {
        out[pos] = s
        guides.push({ axis, at: s })
      } else if (e !== null) {
        out[pos] = e - r[size]
        guides.push({ axis, at: e })
      } else out[pos] = toGrid(r[pos])
    } else {
      const e = nearest(r[pos] + r[size], L.end)
      const want = e !== null ? e - r[pos] : toGrid(r[pos] + r[size]) - r[pos]
      out[size] = Math.max(min[size], want)
      if (e !== null && out[size] === want) guides.push({ axis, at: e })
    }
  }
  return { rect: out, guides }
}
