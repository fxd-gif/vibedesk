import { t } from '../../../shared/i18n'
import { useMemo } from 'react'
import { create } from 'zustand'
import { api, errorText } from '../api'
import type { AgentKind, SessionInfo } from '../../../shared/types'
import { claudeMissingMessage } from '../../../shared/setupHints'
import { AGENT_LINKS, agentInstallCommand, agentName, agentOf, missingAgentIn } from '../../../shared/agents'
import { openSetup } from '../windows/ToolSetup'
import { alert, choose, confirm } from './dialogStore'
import { useUi } from './uiStore'
import { useWorkflow } from './workflowStore'
import { createTerminal, disposeTerminal } from './terminals'

export const termWin = (sessionId: string): string => `term:${sessionId}`
export const shellWin = (shellId: string): string => `shell:${shellId}`
export const kindOf = (id: string): 'terminal' | 'panel' => (id.startsWith('term:') || id.startsWith('shell:') ? 'terminal' : 'panel')

interface SessionStore {
  sessions: SessionInfo[]
  /** Sessions aus einem früheren App-Start, die sich per Hook melden – nur Inspector, kein Terminal */
  external: SessionInfo[]
  exited: Record<string, number>
  /** cwd: Worktree im Projekt (Merge Studio); agent: Gemini CLI / Codex (Beta) statt Claude */
  start(projectId: string, resumeId?: string, cwd?: string, agent?: AgentKind): Promise<SessionInfo | null>
  close(id: string): Promise<void>
  restart(id: string): Promise<void>
}

export const useSessions = create<SessionStore>((set, get) => ({
  sessions: [],
  external: [],
  exited: {},
  start: async (projectId, resumeId, cwd, agent) => {
    try {
      const info = await api.sessions.start(projectId, resumeId, cwd, agent)
      createTerminal(info.id, { cwd: info.cwd, agent: agentOf(info) })
      useWorkflow.getState().dispatch({ type: 'start', sessionId: info.id })
      set((s) => ({ sessions: [...s.sessions, info] }))
      const ui = useUi.getState()
      ui.openWin(termWin(info.id))
      ui.arrangeAll(kindOf)
      return info
    } catch (err) {
      const msg = errorText(err)
      const missing = missingAgentIn(msg)
      if (missing) {
        // Gemini CLI / Codex fehlt: Befehl zum Kopieren und die offizielle Anleitung
        const r = await choose({ title: t('{name} fehlt noch', { name: agentName(missing) }), message: msg, confirmLabel: t('Anleitung öffnen'), altLabel: t('Befehl kopieren') })
        if (r === 'ok') api.openExternal(AGENT_LINKS[missing])
        else if (r === 'alt') api.clipboard.write(agentInstallCommand(missing))
      } else if (msg.includes(claudeMissingMessage())) {
        // Statt einer Sackgasse: gleich die Einrichtung anbieten
        if (await confirm({ title: t('Claude Code fehlt noch'), message: msg, confirmLabel: t('Jetzt einrichten') })) openSetup()
      } else await alert(t('Session konnte nicht gestartet werden'), msg)
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
    await get().start(old.projectId, undefined, old.cwd, agentOf(old))
  }
}))

const addExternal = (info: SessionInfo): void => {
  if (useSessions.getState().external.some((x) => x.id === info.id)) return
  useWorkflow.getState().dispatch({ type: 'start', sessionId: info.id })
  useSessions.setState((s) => ({ external: [...s.external, info] }))
}

let wired = false
export function wireSessions(): void {
  if (wired) return
  wired = true
  api.on.sessionExit((id, code) => useSessions.setState((s) => ({ exited: { ...s.exited, [id]: code } })))
  api.on.sessionExternal(addExternal)
  api.on.sessionExternalEnd((id) => {
    useWorkflow.getState().dispatch({ type: 'remove', sessionId: id })
    useSessions.setState((s) => ({ external: s.external.filter((x) => x.id !== id) }))
  })
  void api.sessions.externals().then((list) => list.forEach(addExternal))
}

/** Nach einem Neuladen des Fensters laufen die Sessions in Main weiter – wieder anzeigen (erst nach initRects aufrufen) */
export async function restoreSessions(): Promise<void> {
  await api.sessions.list().then((list) => {
    const known = new Set(useSessions.getState().sessions.map((s) => s.id))
    const fresh = list.filter((s) => !known.has(s.id))
    if (!fresh.length) return
    for (const info of fresh) {
      createTerminal(info.id, { cwd: info.cwd, agent: agentOf(info) })
      useWorkflow.getState().dispatch({ type: 'start', sessionId: info.id })
    }
    useSessions.setState((s) => ({ sessions: [...s.sessions, ...fresh] }))
    const ui = useUi.getState()
    fresh.forEach((s) => ui.openWin(termWin(s.id)))
    ui.arrangeAll(kindOf)
  })
}

/** Agent einer eigenen Session – unbekannte und übernommene Sessions sind Claude */
export const sessionAgent = (id: string): AgentKind => agentOf(useSessions.getState().sessions.find((s) => s.id === id))

/** Alle Sessions für den Inspector: eigene plus übernommene aus einem früheren App-Start */
export function useAllSessions(): SessionInfo[] {
  const sessions = useSessions((s) => s.sessions)
  const external = useSessions((s) => s.external)
  return useMemo(() => (external.length ? [...sessions, ...external] : sessions), [sessions, external])
}
