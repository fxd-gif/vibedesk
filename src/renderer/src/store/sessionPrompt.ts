// Schickt einen Prompt an die Session eines Projekts – startet sie bei Bedarf und wartet, bis Claude bereit ist.
import { api } from '../api'
import { termWin, useSessions } from './sessionStore'
import { useUi } from './uiStore'

const READY_TIMEOUT_MS = 20_000
/** Claude Code braucht nach dem ersten Hook noch einen Moment, bis die Eingabe steht */
const SETTLE_MS = 1500

function waitForFirstHook(sessionId: () => string | undefined): Promise<void> {
  return new Promise((resolve) => {
    const stop = api.on.hookEvent((e) => {
      if (e.sessionId !== sessionId()) return
      cleanup()
      setTimeout(resolve, SETTLE_MS)
    })
    const t = setTimeout(() => (cleanup(), resolve()), READY_TIMEOUT_MS)
    const cleanup = (): void => {
      stop()
      clearTimeout(t)
    }
  })
}

export async function promptProject(projectId: string, text: string): Promise<boolean> {
  let s = useSessions.getState().sessions.find((x) => x.projectId === projectId)
  if (!s) {
    let id: string | undefined
    const ready = waitForFirstHook(() => id)
    const started = await useSessions.getState().start(projectId)
    if (!started) return false
    id = started.id
    s = started
    await ready
  }
  // Zeilenumbrüche würden die Eingabe vorzeitig abschicken
  api.sessions.write(s.id, text.replace(/\s*\n\s*/g, ' ') + '\r')
  useUi.getState().focus(termWin(s.id))
  return true
}
