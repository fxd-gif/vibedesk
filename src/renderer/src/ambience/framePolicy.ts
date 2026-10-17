// Wie oft und wie fein der Regen-Hintergrund gezeichnet wird – reine Logik, testbar.
import type { EnergySaver } from '../../../shared/types'

export const FPS_FOCUS = 30
export const FPS_SAVER = 15
export const FPS_IDLE = 5

export interface FrameState {
  paused: boolean
  /** Fenster unsichtbar oder ohne Fokus */
  idle: boolean
  saver: boolean
}

/** Mindestabstand zwischen zwei Bildern in ms – null heißt: gar nicht laufend zeichnen (Standbild). */
export function frameInterval(s: FrameState): number | null {
  if (s.paused) return null
  if (s.idle) return 1000 / FPS_IDLE
  return 1000 / (s.saver ? FPS_SAVER : FPS_FOCUS)
}

/** Soll jetzt ein Bild gezeichnet werden? Kleine Toleranz, damit 60 Hz sauber auf 30 FPS halbiert wird. */
export function shouldDraw(now: number, last: number, interval: number): boolean {
  return now - last >= interval - 2
}

export function saverActive(mode: EnergySaver | undefined, onBattery: boolean): boolean {
  if (mode === 'on') return true
  if (mode === 'off') return false
  return onBattery
}

/** Pixeldichte der Zeichenfläche: im Sparmodus 1, sonst höchstens 1,5 */
export function canvasDpr(saver: boolean, devicePixelRatio: number): number {
  return saver ? 1 : Math.min(devicePixelRatio || 1, 1.5)
}
