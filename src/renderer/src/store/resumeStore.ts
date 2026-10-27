// Weiter nach dem Limit: Meldet Claude „limit reached · resets 10:30pm“, schickt VibeDesk nach dem Reset von selbst „mach weiter“.
import { locale, t } from '../../../shared/i18n'
import { create } from 'zustand'
import { api } from '../api'
import { limitFromHook, RESUME_GRACE_MS, resumePrompt, scanLimit } from '../../../shared/limitReset'
import { inform } from './notifyStore'
import { sendToSession } from './sessionPrompt'
import { sessionAgent, useSessions } from './sessionStore'
import { useSettings } from './settingsStore'

interface ResumeState {
  /** Session → Zeitpunkt, zu dem es weitergeht */
  plans: Record<string, number>
}

export const useResume = create<ResumeState>(() => ({ plans: {} }))

const timers: Record<string, ReturnType<typeof setTimeout>> = {}
let ticker: ReturnType<typeof setInterval> | null = null

/**
 * Nach Standby oder Drosselung im Hintergrund kommen lange Timer zu spät – darum zusätzlich alle 30 s auf die echte
 * Uhrzeit schauen. Solange etwas geplant ist, bleibt der PC wach (kein Standby, Bildschirm darf aus).
 */
function syncWatch(): void {
  const pending = Object.keys(useResume.getState().plans).length > 0
  api.app.keepAwake(pending)
  if (pending && !ticker) {
    ticker = setInterval(() => {
      const now = Date.now()
      for (const [id, at] of Object.entries(useResume.getState().plans)) if (now >= at) resume(id)
    }, 30_000)
  } else if (!pending && ticker) {
    clearInterval(ticker)
    ticker = null
  }
}

export const fmtTime = (t: number): string => new Date(t).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })

export function cancelResume(id: string): void {
  clearTimeout(timers[id])
  delete timers[id]
  useResume.setState((s) => {
    const plans = { ...s.plans }
    delete plans[id]
    return { plans }
  })
  syncWatch()
}

function resume(id: string): void {
  cancelResume(id)
  const alive = useSessions.getState().sessions.some((s) => s.id === id) && useSessions.getState().exited[id] === undefined
  if (!alive) return
  // erst ein Esc – falls Claude noch das Limit-Auswahlmenü zeigt –, dann der Auftrag
  api.sessions.write(id, '\x1b')
  setTimeout(() => sendToSession(id, resumePrompt(), false), 700)
  const name = useSessions.getState().sessions.find((s) => s.id === id)?.name ?? 'Claude'
  inform(t('{name} macht weiter', { name }), t('Das Nutzungslimit ist wieder frei.'))
}

export function planResume(id: string, resetAt: number): void {
  const at = resetAt + RESUME_GRACE_MS
  // dieselbe Meldung wird beim Neuzeichnen mehrfach ausgegeben – nur einmal planen
  if (useResume.getState().plans[id] === at) return
  clearTimeout(timers[id])
  timers[id] = setTimeout(() => resume(id), Math.max(0, at - Date.now()))
  useResume.setState((s) => ({ plans: { ...s.plans, [id]: at } }))
  syncWatch()
  const name = useSessions.getState().sessions.find((s) => s.id === id)?.name ?? 'Claude'
  inform(t('Limit erreicht – {name} macht um {time} weiter', { name, time: fmtTime(at) }), t('VibeDesk schickt Claude dann von selbst „mach weiter“. Abbrechen kannst du oben im Terminal.'), [{ label: t('Nicht weitermachen'), run: () => cancelResume(id) }])
}

let wired = false
export function wireResume(): void {
  if (wired) return
  wired = true
  const carry: Record<string, string> = {}
  api.on.sessionData((id, data) => {
    // „Limit-Weiter“ kennt nur die Meldung von Claude Code
    if (useSettings.getState().s?.autoResume === false || sessionAgent(id) !== 'claude') return
    const r = scanLimit(data, carry[id] ?? '', Date.now())
    carry[id] = r.carry
    if (r.at) {
      carry[id] = ''
      planResume(id, r.at)
    }
  })
  // Verlässlicher Weg: Claude Code meldet das Limit selbst per StopFailure-Hook (das Terminal ist seit dem
  // Hintergrund-Dienst nur eine angehängte Ansicht, dort kommt die Meldung nicht immer lesbar an)
  api.on.hookEvent((e) => {
    if (useSettings.getState().s?.autoResume === false) return
    const at = limitFromHook(e.name, e.payload, Date.now())
    if (at) planResume(e.sessionId, at)
  })
  api.on.sessionExit((id) => {
    delete carry[id]
    cancelResume(id)
  })
}
