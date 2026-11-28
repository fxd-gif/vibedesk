// Zeichen-Fenster im Zeichenregen: jede Session ein kleines Terminal aus Rahmenzeichen, wie die drei Terminals
// im Hero der Website – an den Plätzen der „Lichter gegenüber“ (lights.ts), Rahmenfarbe = Status.
import { slotPos, type Lamp } from '../ambience/lights'

export interface PaneRect {
  lamp: Lamp
  /** linke obere Ecke in Zellen */
  x: number
  y: number
  w: number
  h: number
}

/** Abstand zweier Plätze (lights.ts): 0,12 Bildbreite nebeneinander, 0,13 Bildhöhe zwischen den Stockwerken */
const SLOT_DX = 0.12
const SLOT_DY = 0.13

/** Fenstergröße aus dem Raster: so breit, dass Nachbarn Luft haben, höchstens 26 × 7 Zellen */
export function paneSize(cols: number, rows: number): { w: number; h: number } {
  const w = Math.max(0, Math.min(26, Math.floor(cols * SLOT_DX) - 3))
  const h = Math.max(0, Math.min(7, Math.floor(rows * SLOT_DY) - 1))
  return { w, h }
}

/** Fenster je Licht; zu kleine Raster (Fenster < 12 × 4) zeigen keine */
export function paneRects(lamps: Lamp[], cols: number, rows: number): PaneRect[] {
  const { w, h } = paneSize(cols, rows)
  if (w < 12 || h < 4) return []
  return lamps.map((lamp) => {
    const p = slotPos(lamp.slot)
    const x = Math.round(p.x * cols - w / 2)
    const y = Math.round(p.y * rows - h / 2)
    return { lamp, x: Math.max(0, Math.min(cols - w, x)), y: Math.max(0, Math.min(rows - h - 3, y)), w, h }
  })
}

/** Text auf n Zeichen kürzen, mit … am Ende */
export function fit(s: string, n: number): string {
  if (n <= 0) return ''
  return s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s
}
