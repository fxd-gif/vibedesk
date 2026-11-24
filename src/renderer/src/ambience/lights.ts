// „Lichter gegenüber“: Jede Session ist ein erleuchtetes Fenster in der Stadt hinter dem Regen.
// Reine Logik – Plätze, Aussehen je Status und die Ableitung aus Sessions; der Shader zeichnet nur.
import type { SessionStatus } from '../../../shared/types'

export const MAX_LAMPS = 12

/** Platz 0 in der Mitte, dann abwechselnd rechts/links nach außen; zweites Stockwerk versetzt darüber */
const FLOOR_1 = [0, 1, -1, 2, -2, 3]
const FLOOR_2 = [0.5, -0.5, 1.5, -1.5, 2.5, -2.5]
const STEP = 0.12

/** Mitte des Fensters in Bildschirm-Koordinaten 0..1 (y nach unten) */
export function slotPos(slot: number): { x: number; y: number } {
  const floor = slot < FLOOR_1.length ? FLOOR_1 : FLOOR_2
  const i = slot < FLOOR_1.length ? slot : slot - FLOOR_1.length
  return { x: 0.5 + floor[i] * STEP, y: slot < FLOOR_1.length ? 0.4 : 0.27 }
}

/** Jede Session behält ihren Platz, solange sie lebt; neue bekommen den kleinsten freien Platz */
export function assignSlots(prev: Record<string, number>, ids: string[]): Record<string, number> {
  const next: Record<string, number> = {}
  for (const id of ids) if (prev[id] !== undefined) next[id] = prev[id]
  const used = new Set(Object.values(next))
  for (const id of ids) {
    if (next[id] !== undefined) continue
    let slot = 0
    while (used.has(slot)) slot++
    if (slot >= MAX_LAMPS) continue
    next[id] = slot
    used.add(slot)
  }
  return next
}

export interface Lamp {
  id: string
  name: string
  status: SessionStatus
  waitingSince?: number
  slot: number
}

/** Lichter der Sessions, die einen Platz haben – nach Platz sortiert */
export function lampsOf(
  sessions: { id: string; name: string }[],
  workflow: Record<string, { status: SessionStatus; waitingSince?: number } | undefined>,
  slots: Record<string, number>
): Lamp[] {
  return sessions
    .filter((s) => slots[s.id] !== undefined)
    .map((s) => ({ id: s.id, name: s.name, status: workflow[s.id]?.status ?? 'idle', waitingSince: workflow[s.id]?.waitingSince, slot: slots[s.id] }))
    .sort((a, b) => a.slot - b.slot)
}

/** Statusfarben der Website (DESIGN.md): Grün arbeitet, Bernstein wartet, Blau fertig, Rot Fehler; idle warmweiß */
const RGB: Record<SessionStatus, [number, number, number]> = {
  working: [95, 212, 151],
  waiting: [243, 185, 77],
  done: [122, 167, 255],
  error: [255, 138, 138],
  idle: [255, 236, 210]
}

export interface LampLook {
  /** 0..1 */
  rgb: [number, number, number]
  /** Helligkeit des Fensters 0..1 */
  intensity: number
  /** warmer Schein auf der Scheibe 0..1 (Wartende werfen Licht herein) */
  spill: number
}

/** Aussehen zu einem Zeitpunkt t (Sekunden). Ohne animate (Sparmodus) feste Mittelwerte. phase verschiebt den Takt je Fenster. */
export function lampLook(status: SessionStatus, t: number, animate: boolean, phase = 0): LampLook {
  const rgb = RGB[status].map((c) => c / 255) as [number, number, number]
  switch (status) {
    case 'working':
      // leises Flackern wie ein Bildschirm im dunklen Zimmer
      return { rgb, intensity: animate ? 0.72 + 0.08 * Math.sin(2.3 * t + phase) + 0.05 * Math.sin(7.1 * t + 1.7 * phase) : 0.72, spill: 0 }
    case 'waiting':
      // langsames Atmen, Periode 2,4 s
      return { rgb, intensity: animate ? 0.45 + 0.55 * (0.5 + 0.5 * Math.sin((2 * Math.PI * t) / 2.4 - Math.PI / 2 + phase)) : 0.85, spill: 1 }
    case 'done':
      return { rgb, intensity: 0.55, spill: 0 }
    case 'error':
      return { rgb, intensity: 0.8, spill: 0.25 }
    default:
      return { rgb, intensity: 0.22, spill: 0 }
  }
}

/** Bewegt sich gerade ein Licht? Nur dann braucht das Standbild eine Bildschleife. */
export function lampsAnimate(lamps: Pick<Lamp, 'status'>[]): boolean {
  return lamps.some((l) => l.status === 'working' || l.status === 'waiting')
}
