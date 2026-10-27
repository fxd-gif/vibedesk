// Prompts an Claude-Sessions schicken – startet sie bei Bedarf und wartet, bis Claude bereit bzw. fertig ist.
import { api } from '../api'
import { bracketedPaste, safePrompt } from '../../../shared/paste'
import { samePath } from '../../../shared/merge'
import { isClaude } from '../../../shared/agents'
import type { SessionStatus } from '../../../shared/types'
import { termWin, useSessions } from './sessionStore'
import { useUi } from './uiStore'
import { useWorkflow } from './workflowStore'

const READY_TIMEOUT_MS = 20_000
/** Claude Code braucht nach dem ersten Hook noch einen Moment, bis die Eingabe steht */
const SETTLE_MS = 1500
/** so lange darf es dauern, bis Claude nach einem Prompt zu arbeiten beginnt */
const START_WORK_MS = 15_000

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

/** Laufende Claude-Session des Projekts – oder neu starten und warten, bis Claude Eingaben annimmt. cwd: nur eine Session in genau diesem Ordner (Worktree) */
export async function ensureSession(projectId: string, cwd?: string): Promise<string | null> {
  // Gemini CLI / Codex bekommen keine Claude-Aufträge (Gehirn, Vorlagen, Addons)
  const running = useSessions.getState().sessions.find((x) => isClaude(x) && x.projectId === projectId && (!cwd || samePath(x.cwd, cwd)))
  if (running) return running.id
  let id: string | undefined
  const ready = waitForFirstHook(() => id)
  const started = await useSessions.getState().start(projectId, undefined, cwd)
  if (!started) return null
  id = started.id
  await ready
  return started.id
}

/** Pause zwischen Einfügen und Enter – kommt beides in einem Rutsch, hält Claude Code das Enter für eingefügten Text */
export const SUBMIT_DELAY_MS = 150

export function sendToSession(sessionId: string, text: string, focus = true): void {
  // Zeilenumbrüche würden die Eingabe vorzeitig abschicken; Steuerzeichen und `!` (Bash-Modus) fliegen raus
  api.sessions.write(sessionId, bracketedPaste(safePrompt(text.replace(/\s*\n\s*/g, ' '))))
  setTimeout(() => api.sessions.write(sessionId, '\r'), SUBMIT_DELAY_MS)
  if (focus) useUi.getState().focus(termWin(sessionId))
}

export async function promptProject(projectId: string, text: string): Promise<boolean> {
  const id = await ensureSession(projectId)
  if (!id) return false
  sendToSession(id, text)
  return true
}

const statusOf = (id: string): SessionStatus | undefined => useWorkflow.getState().sessions[id]?.status

/**
 * Wartet, bis Claude mit dem gerade geschickten Prompt durch ist: erst darauf, dass es loslegt,
 * dann bis es fertig ist oder auf dich wartet. Endet auch, wenn die Session geschlossen wird.
 */
export function waitUntilIdle(sessionId: string, timeoutMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let started = statusOf(sessionId) === 'working'
    const t0 = Date.now()
    const check = (): boolean => {
      const gone = !useSessions.getState().sessions.some((s) => s.id === sessionId)
      const st = statusOf(sessionId)
      if (st === 'working') started = true
      if (gone || Date.now() - t0 >= timeoutMs) return true
      // Claude hat nicht angefangen (z. B. Eingabe verschluckt) – nicht ewig hängen
      if (!started && Date.now() - t0 >= START_WORK_MS) return true
      return started && st !== 'working'
    }
    const done = (): void => {
      unsub()
      clearInterval(iv)
      signal?.removeEventListener('abort', abort)
      resolve()
    }
    const abort = (): void => {
      unsub()
      clearInterval(iv)
      reject(new Error('abgebrochen'))
    }
    const unsub = useWorkflow.subscribe(() => check() && done())
    const iv = setInterval(() => check() && done(), 1000)
    signal?.addEventListener('abort', abort, { once: true })
    if (check()) done()
  })
}
