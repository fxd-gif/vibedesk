// Pomodoro-Zustandsautomat – rein, mit echter Uhrzeit (überlebt Schlaf/Drosselung korrekt).
import type { FocusSettings } from '../../../shared/types'

export type Phase = 'idle' | 'work' | 'short' | 'long'

export interface FocusState {
  phase: Phase
  endsAt: number | null
  /** Restzeit, solange pausiert */
  pausedLeft: number | null
  /** aktuelle Fokus-Runde 1..rounds */
  round: number
}

export type FocusAction = { type: 'start' | 'pause' | 'resume' | 'skip' | 'reset' | 'tick'; now: number }

const MIN = 60_000
export const idleFocus = (): FocusState => ({ phase: 'idle', endsAt: null, pausedLeft: null, round: 0 })

const minutes = (phase: Phase, c: FocusSettings): number => (phase === 'work' ? c.work : phase === 'short' ? c.short : c.long)

function next(s: FocusState, now: number, c: FocusSettings): FocusState {
  if (s.phase === 'work') {
    const phase: Phase = s.round >= c.rounds ? 'long' : 'short'
    return { phase, endsAt: now + minutes(phase, c) * MIN, pausedLeft: null, round: s.round }
  }
  const round = s.phase === 'long' ? 1 : s.round + 1
  return { phase: 'work', endsAt: now + c.work * MIN, pausedLeft: null, round }
}

export function focusReducer(s: FocusState, a: FocusAction, c: FocusSettings): FocusState {
  switch (a.type) {
    case 'start':
      return { phase: 'work', endsAt: a.now + c.work * MIN, pausedLeft: null, round: 1 }
    case 'reset':
      return idleFocus()
    case 'pause':
      return s.phase === 'idle' || s.pausedLeft !== null ? s : { ...s, pausedLeft: Math.max(0, (s.endsAt ?? a.now) - a.now), endsAt: null }
    case 'resume':
      return s.pausedLeft === null ? s : { ...s, endsAt: a.now + s.pausedLeft, pausedLeft: null }
    case 'skip':
      return s.phase === 'idle' ? s : next(s, a.now, c)
    case 'tick':
      if (s.phase === 'idle' || s.endsAt === null || a.now < s.endsAt) return s
      return next(s, a.now, c)
  }
}

export function remaining(s: FocusState, now: number): number {
  if (s.pausedLeft !== null) return s.pausedLeft
  if (s.endsAt === null) return 0
  return Math.max(0, s.endsAt - now)
}

export function phaseTotal(s: FocusState, c: FocusSettings): number {
  return s.phase === 'idle' ? 0 : minutes(s.phase, c) * MIN
}
