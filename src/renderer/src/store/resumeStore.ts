// Weiter nach dem Limit: Meldet Claude „limit reached · resets 10:30pm“, schickt VibeDesk nach dem Reset von selbst „mach weiter“.
import { create } from 'zustand'
import { api } from '../api'
import { RESUME_GRACE_MS, RESUME_PROMPT, scanLimit } from '../../../shared/limitReset'
import { inform } from './notifyStore'
import { sendToSession } from './sessionPrompt'
import { useSessions } from './sessionStore'
import { useSettings } from './settingsStore'

interface ResumeState {
  /** Session → Zeitpunkt, zu dem es weitergeht */
  plans: Record<string, number>
}

export const useResume = create<ResumeState>(() => ({ plans: {} }))

const timers: Record<string, ReturnType<typeof setTimeout>> = {}

export const fmtTime = (t: number): string => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })

export function cancelResume(id: string): void {
  clearTimeout(timers[id])
  delete timers[id]
  useResume.setState((s) => {
    const plans = { ...s.plans }
    delete plans[id]
    return { plans }
  })
}

function resume(id: string): void {
  cancelResume(id)
  const alive = useSessions.getState().sessions.some((s) => s.id === id) && useSessions.getState().exited[id] === undefined
  if (!alive) return
  // erst ein Esc – falls Claude noch das Limit-Auswahlmenü zeigt –, dann der Auftrag
  api.sessions.write(id, '\x1b')
  setTimeout(() => sendToSession(id, RESUME_PROMPT, false), 700)
  const name = useSessions.getState().sessions.find((s) => s.id === id)?.name ?? 'Claude'
  inform(`${name} macht weiter`, 'Das Nutzungslimit ist wieder frei.')
}

export function planResume(id: string, resetAt: number): void {
  const at = resetAt + RESUME_GRACE_MS
  // dieselbe Meldung wird beim Neuzeichnen mehrfach ausgegeben – nur einmal planen
  if (useResume.getState().plans[id] === at) return
  clearTimeout(timers[id])
  timers[id] = setTimeout(() => resume(id), Math.max(0, at - Date.now()))
  useResume.setState((s) => ({ plans: { ...s.plans, [id]: at } }))
  const name = useSessions.getState().sessions.find((s) => s.id === id)?.name ?? 'Claude'
  inform(`Limit erreicht – ${name} macht um ${fmtTime(at)} weiter`, 'VibeDesk schickt Claude dann von selbst „mach weiter“. Abbrechen kannst du oben im Terminal.', [{ label: 'Nicht weitermachen', run: () => cancelResume(id) }])
}

let wired = false
export function wireResume(): void {
  if (wired) return
  wired = true
  const carry: Record<string, string> = {}
  api.on.sessionData((id, data) => {
    if (useSettings.getState().s?.autoResume === false) return
    const r = scanLimit(data, carry[id] ?? '', Date.now())
    carry[id] = r.carry
    if (r.at) {
      carry[id] = ''
      planResume(id, r.at)
    }
  })
  api.on.sessionExit((id) => {
    delete carry[id]
    cancelResume(id)
  })
}
