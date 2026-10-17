import { create } from 'zustand'
import { api } from '../api'
import { ambienceAudio } from '../ambience/audio'
import { playChime } from '../ambience/chime'
import { focusReducer, idleFocus, type FocusAction, type FocusState, type Phase } from './focusTimer'
import { useSettings } from './settingsStore'

interface FocusStore {
  state: FocusState
  now: number
  banner: { text: string; until: number } | null
  act(type: FocusAction['type']): void
}

const DEFAULT = { work: 25, short: 5, long: 15, rounds: 4 }
const cfg = () => useSettings.getState().s?.focus ?? DEFAULT

const BANNERS: Record<Phase, string> = {
  idle: '',
  work: 'Fokus – los geht’s.',
  short: 'Pause – kurz aufstehen, Augen weg vom Bildschirm.',
  long: 'Lange Pause – Wasser holen, frische Luft.'
}

function applyPhase(prev: Phase, next: Phase): void {
  if (prev === next) return
  const breakNow = next === 'short' || next === 'long'
  // Arbeitsphase zu Ende gebracht → zählt für den Wochenrückblick
  if (prev === 'work' && breakNow) api.vibe.focusDone()
  ambienceAudio.setDuck(breakNow ? 0.25 : 1, breakNow ? 0.6 : 1)
  if (next === 'idle') return
  const vol = useSettings.getState().s?.chimeVolume ?? 0.5
  playChime(vol, breakNow ? [783.99, 523.25] : [523.25, 783.99])
  useFocus.setState({ banner: { text: BANNERS[next], until: Date.now() + (breakNow ? 8000 : 4000) } })
}

export const useFocus = create<FocusStore>((set, get) => ({
  state: idleFocus(),
  now: Date.now(),
  banner: null,
  act: (type) => {
    const prev = get().state
    const now = Date.now()
    const state = focusReducer(prev, { type, now }, cfg())
    set({ state, now })
    applyPhase(prev.phase, state.phase)
  }
}))

let wired = false
export function wireFocus(): void {
  if (wired) return
  wired = true
  setInterval(() => {
    const { state, act, banner } = useFocus.getState()
    if (banner && Date.now() > banner.until) useFocus.setState({ banner: null })
    if (state.phase === 'idle') return
    useFocus.setState({ now: Date.now() })
    act('tick')
  }, 1000)
}

export function fmtClock(ms: number): string {
  const s = Math.ceil(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
