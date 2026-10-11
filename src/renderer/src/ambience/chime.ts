// Sanfter, synthetischer Zwei-Ton-Gong (keine Audiodatei nötig).
import { useSettings } from '../store/settingsStore'
import { useUi } from '../store/uiStore'
import { useWorkflow } from '../store/workflowStore'
import { termWin } from '../store/sessionStore'
import { shouldChime } from './chimeRule'
import type { SessionStatus } from '../../../shared/types'

let ctx: AudioContext | null = null

export function playChime(volume: number, notes: number[] = [659.25, 987.77]): void {
  if (volume <= 0) return
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') ctx.resume()
  const t0 = ctx.currentTime
  notes.forEach((freq, i) => {
    const t = t0 + i * 0.18
    for (const [mult, amp] of [
      [1, 1],
      [2.01, 0.25],
      [3.0, 0.08]
    ]) {
      const o = ctx!.createOscillator()
      const g = ctx!.createGain()
      o.type = 'sine'
      o.frequency.value = freq * mult
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(volume * 0.22 * amp, t + 0.012)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6)
      o.connect(g).connect(ctx!.destination)
      o.start(t)
      o.stop(t + 1.7)
    }
  })
}

let wired = false
export function wireChime(): void {
  if (wired) return
  wired = true
  const prev: Record<string, SessionStatus> = {}
  const last: Record<string, number> = {}
  useWorkflow.subscribe((st) => {
    const s = useSettings.getState().s
    for (const [id, w] of Object.entries(st.sessions)) {
      const before = prev[id]
      prev[id] = w.status
      if (!s?.chimeOn) continue
      const ui = useUi.getState()
      const win = termWin(id)
      const sessionOnTop = ui.open[ui.open.length - 1] === win && !ui.minimized.includes(win)
      const now = Date.now()
      if (shouldChime(before, w.status, { appFocused: document.hasFocus(), sessionOnTop, lastChime: last[id], now })) {
        last[id] = now
        playChime(s.chimeVolume)
      }
    }
  })
}
