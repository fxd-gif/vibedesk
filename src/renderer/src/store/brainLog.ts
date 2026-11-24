// Protokoll fürs Gehirn-Fenster: was Claude seit dem Start von VibeDesk im Gehirn gelesen und festgehalten hat.
// Nur Notizen (keine Dateien) – die Datei-Pulse sind zu häufig und gehören in den Graphen.
import { create } from 'zustand'
import { api } from '../api'
import { addPulse, type BrainLogState } from './brainLogModel'

export type { BrainLogEntry, NoteMark } from './brainLogModel'

export const useBrainLog = create<BrainLogState>(() => ({ entries: {}, marks: {} }))

let wired = false
export function wireBrainLog(): void {
  if (wired) return
  wired = true
  api.on.brainPulse((p) => useBrainLog.setState((s) => addPulse(s, p, Date.now())))
}
