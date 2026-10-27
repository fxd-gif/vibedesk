// Für welches Projekt ein Werkzeugfenster (Gehirn, Git) aufgeht: oberste Session, sonst zuletzt genutzt.
import type { Project } from '../../../shared/types'
import { recentProjects } from '../desktop/recentProjects'
import { termWin, useSessions } from './sessionStore'
import { useUi } from './uiStore'
import { useScreen } from './screenStore'

export function activeProjectId(projects: Project[]): string | null {
  // im Zweitfenster liegen die Terminals im Hauptfenster – deren Reihenfolge kommt gespiegelt (sonst leer)
  const open = [...useScreen.getState().terms, ...useUi.getState().open]
  const sessions = useSessions.getState().sessions
  for (let i = open.length - 1; i >= 0; i--) {
    const s = sessions.find((x) => termWin(x.id) === open[i])
    if (s) return s.projectId
  }
  if (sessions[0]) return sessions[0].projectId
  return recentProjects(projects, 1)[0]?.id ?? null
}
