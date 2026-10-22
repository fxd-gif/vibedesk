// Tray-Status: der dringendste Zustand aller Sessions als farbiger Punkt im Infobereich (und an der Taskleiste).
import type { SessionStatus } from './types'

export interface TraySession {
  id: string
  name: string
  status: SessionStatus
}

/** wichtigster zuerst: wer wartet, schlägt alles */
const RANK: SessionStatus[] = ['waiting', 'error', 'working', 'done', 'idle']

export function trayState(list: TraySession[]): SessionStatus {
  let best = RANK.length - 1
  for (const s of list) best = Math.min(best, Math.max(0, RANK.indexOf(s.status)))
  return RANK[best]
}

/** Punktfarbe als [r, g, b]; null = kein Punkt */
export function dotColor(s: SessionStatus): [number, number, number] | null {
  switch (s) {
    case 'waiting':
      return [245, 196, 66]
    case 'error':
      return [235, 87, 87]
    case 'working':
      return [76, 201, 120]
    case 'done':
      return [96, 156, 255]
    default:
      return null
  }
}

export const cleanTrayList = (x: unknown): TraySession[] =>
  Array.isArray(x)
    ? x
        .filter((s): s is TraySession => !!s && typeof s.id === 'string' && typeof s.name === 'string' && RANK.includes(s.status))
        .slice(0, 40)
        .map((s) => ({ id: s.id.slice(0, 80), name: s.name.replace(/[\u0000-\u001f&]+/g, ' ').slice(0, 60), status: s.status }))
    : []

/**
 * Malt einen Punkt mit dunklem Rand unten rechts in ein BGRA-Bitmap (wie nativeImage.toBitmap()).
 * size = Kantenlänge des Bilds; der Punkt nimmt gut die Hälfte ein, damit er auch bei 16 px auffällt.
 */
export function paintDot(bgra: Uint8Array, size: number, rgb: [number, number, number]): Uint8Array {
  const out = new Uint8Array(bgra)
  const ring = Math.max(1, size / 16)
  const r = size * 0.3
  const cx = size - r - ring
  const cy = size - r - ring
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      if (d > r + ring) continue
      const i = (y * size + x) * 4
      // Kante weich: 1 innen, 0 außen
      const a = Math.min(1, Math.max(0, r + ring - d))
      const [cr, cg, cb] = d > r ? [16, 18, 24] : rgb
      out[i] = Math.round(out[i] * (1 - a) + cb * a)
      out[i + 1] = Math.round(out[i + 1] * (1 - a) + cg * a)
      out[i + 2] = Math.round(out[i + 2] * (1 - a) + cr * a)
      out[i + 3] = Math.round(Math.max(out[i + 3], 255 * a))
    }
  }
  return out
}

/** Tooltip, z. B. „VibeDesk – 1 wartet auf dich“ (Texte kommen übersetzt rein) */
export function trayCounts(list: TraySession[]): Record<SessionStatus, number> {
  const c: Record<SessionStatus, number> = { idle: 0, working: 0, waiting: 0, done: 0, error: 0 }
  for (const s of list) c[s.status]++
  return c
}
