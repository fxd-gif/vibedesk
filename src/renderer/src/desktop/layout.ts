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

/** Kachelt Terminals oben (62 % Höhe) und Panels darunter. */
export function arrange(items: Item[], screen: Screen, dockH: number): Record<string, WindowRect> {
  const x = MARGIN
  const y = MARGIN
  const w = screen.w - 2 * MARGIN
  const h = screen.h - dockH - 2 * MARGIN
  const terms = items.filter((i) => i.kind === 'terminal').map((i) => i.id)
  const panels = items.filter((i) => i.kind === 'panel').map((i) => i.id)
  if (!terms.length) return panels.length ? row(panels, x, y, w, h) : {}
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
