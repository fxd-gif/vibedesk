import { create } from 'zustand'
import { api, errorText } from '../api'
import type { SessionInfo } from '../../../shared/types'
import { alert } from './dialogStore'
import { useUi } from './uiStore'
import { useWorkflow } from './workflowStore'
import { createTerminal, disposeTerminal } from './terminals'

export const termWin = (sessionId: string): string => `term:${sessionId}`
export const kindOf = (id: string): 'terminal' | 'panel' => (id.startsWith('term:') ? 'terminal' : 'panel')

interface SessionStore {
  sessions: SessionInfo[]
  exited: Record<string, number>
  start(projectId: string, resumeId?: string): Promise<SessionInfo | null>
  close(id: string): Promise<void>
  restart(id: string): Promise<void>
}

export const useSessions = create<SessionStore>((set, get) => ({
  sessions: [],
  exited: {},
  start: async (projectId, resumeId) => {
    try {
      const info = await api.sessions.start(projectId, resumeId)
      createTerminal(info.id)
      useWorkflow.getState().dispatch({ type: 'start', sessionId: info.id })
      set((s) => ({ sessions: [...s.sessions, info] }))
      const ui = useUi.getState()
      ui.openWin(termWin(info.id))
      ui.arrangeAll(kindOf)
      return info
    } catch (err) {
      await alert('Session konnte nicht gestartet werden', errorText(err))
      return null
    }
  },
  close: async (id) => {
    await api.sessions.stop(id)
    disposeTerminal(id)
    useUi.getState().closeWin(termWin(id))
    useWorkflow.getState().dispatch({ type: 'remove', sessionId: id })
    set((s) => {
      const { [id]: _x, ...exited } = s.exited
      return { sessions: s.sessions.filter((x) => x.id !== id), exited }
    })
  },
  restart: async (id) => {
    const old = get().sessions.find((s) => s.id === id)
    if (!old) return
    await get().close(id)
    await get().start(old.projectId)
  }
}))

let wired = false
export function wireSessions(): void {
  if (wired) return
  wired = true
  api.on.sessionExit((id, code) => useSessions.setState((s) => ({ exited: { ...s.exited, [id]: code } })))
}
