// „Lichter gegenüber“ und der Ausblick: welche Session an welchem Fenster leuchtet, ob der Ausblick offen ist.
import { useMemo } from 'react'
import { create } from 'zustand'
import { assignSlots, lampsOf, type Lamp } from '../ambience/lights'
import { useSessions } from './sessionStore'
import { useSettings } from './settingsStore'
import { useWorkflow } from './workflowStore'

interface LightsState {
  /** Session-ID → Fensterplatz (stabil, solange die Session lebt) */
  slots: Record<string, number>
  /** Ausblick: Fenster treten zurück, die Lichter sind beschriftet und anklickbar */
  outlook: boolean
  /** im Ausblick per Tastatur gewähltes Licht */
  selected: string | null
  setOutlook(on: boolean): void
  select(id: string | null): void
}

export const useLights = create<LightsState>((set) => ({
  slots: {},
  outlook: false,
  selected: null,
  setOutlook: (on) => set({ outlook: on, selected: null }),
  select: (id) => set({ selected: id })
}))

const sameSlots = (a: Record<string, number>, b: Record<string, number>): boolean => {
  const ka = Object.keys(a)
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k])
}

let wired = false
/** Plätze mit den eigenen Sessions synchron halten (übernommene Sessions ohne Terminal bekommen kein Licht) */
export function wireLights(): void {
  if (wired) return
  wired = true
  const sync = (): void => {
    const prev = useLights.getState().slots
    const next = assignSlots(
      prev,
      useSessions.getState().sessions.map((s) => s.id)
    )
    if (!sameSlots(prev, next)) useLights.setState({ slots: next })
  }
  sync()
  useSessions.subscribe(sync)
}

/** Lichter, die gerade leuchten: im Alltag nur mit Schalter (Standard an), im Ausblick immer */
export function currentLamps(): Lamp[] {
  const lights = useLights.getState()
  if (useSettings.getState().s?.sessionLights === false && !lights.outlook) return []
  return lampsOf(useSessions.getState().sessions, useWorkflow.getState().sessions, lights.slots)
}

/** Für den Shader: meldet sich nur, wenn sich Platz, Status oder Sichtbarkeit eines Lichts ändert */
export function subscribeLamps(cb: (lamps: Lamp[]) => void): () => void {
  let key: string | null = null
  const check = (): void => {
    const lamps = currentLamps()
    const k = lamps.map((l) => `${l.id}:${l.slot}:${l.status}`).join('|')
    if (k === key) return
    key = k
    cb(lamps)
  }
  const offs = [useSessions.subscribe(check), useWorkflow.subscribe(check), useLights.subscribe(check), useSettings.subscribe(check)]
  check()
  return () => offs.forEach((off) => off())
}

/** Für den Ausblick: alle Lichter mit Status, rendert bei Änderungen neu */
export function useLamps(): Lamp[] {
  const sessions = useSessions((s) => s.sessions)
  const workflow = useWorkflow((s) => s.sessions)
  const slots = useLights((s) => s.slots)
  return useMemo(() => lampsOf(sessions, workflow, slots), [sessions, workflow, slots])
}
