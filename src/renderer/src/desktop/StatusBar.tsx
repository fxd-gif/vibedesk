// Studio-Aufbau: Statusleiste unten – Projekt, Branch, offene Änderungen und was Claude gerade tut.
import { useEffect, useState } from 'react'
import { api } from '../api'
import type { GitState } from '../../../shared/git'
import type { Project, SessionStatus } from '../../../shared/types'
import { activeProjectId } from '../store/activeProject'
import { useSessions } from '../store/sessionStore'
import { useUi } from '../store/uiStore'
import { useWorkflow } from '../store/workflowStore'
import { openPanel } from '../windows/palette/CommandPalette'
import { Icon } from './icons'
import { t, tn } from '../../../shared/i18n'

const POLL_MS = 5000
/** wichtigster Zustand zuerst: wartet > Fehler > arbeitet > fertig > ruhig */
const RANK: SessionStatus[] = ['waiting', 'error', 'working', 'done', 'idle']

export function StatusBar(): React.JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [git, setGit] = useState<GitState | null>(null)
  const sessions = useSessions((s) => s.sessions)
  // neu berechnen, wenn ein anderes Fenster nach vorn kommt (oberste Session bestimmt das Projekt)
  const top = useUi((s) => s.open[s.open.length - 1])
  const statusKey = useWorkflow((w) => sessions.map((s) => w.sessions[s.id]?.status ?? 'idle').join(','))
  const projectId = activeProjectId(projects)
  const project = projects.find((p) => p.id === projectId)

  useEffect(() => {
    void api.projects.list().then(setProjects)
  }, [sessions.length, top])

  useEffect(() => {
    if (!projectId) return setGit(null)
    let alive = true
    const load = (): void => {
      if (document.visibilityState !== 'visible') return
      api.git
        .status(projectId)
        .then((s) => alive && setGit(s))
        .catch(() => alive && setGit(null))
    }
    load()
    const timer = setInterval(load, POLL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [projectId])

  const statuses = statusKey ? (statusKey.split(',') as SessionStatus[]) : []
  const lead = RANK.find((r) => statuses.includes(r)) ?? 'idle'
  const label =
    lead === 'waiting' ? t('Claude wartet auf dich') : lead === 'error' ? t('Fehler in einer Session') : lead === 'working' ? t('Claude arbeitet') : lead === 'done' ? t('Claude ist fertig') : t('Claude Code')

  return (
    <footer className="statusbar" data-testid="statusbar">
      <span className="stb-chip">{t('Projekt')}</span>
      <button className="stb-btn" onClick={() => openPanel('projects')} title={project?.path}>
        <Icon name="folder" size={13} />
        {project?.name ?? t('kein Projekt')}
      </button>
      <span className="stb-spacer" />
      {git?.repo && (
        <>
          <button className="stb-btn" onClick={() => openPanel('git')} title={t('Git & GitHub öffnen')} data-testid="statusbar-branch">
            <Icon name="branch" size={13} />
            {git.branch}
            {git.ahead > 0 && <span className="dim">↑{git.ahead}</span>}
            {git.behind > 0 && <span className="dim">↓{git.behind}</span>}
          </button>
          <button className="stb-btn" onClick={() => openPanel('git')}>
            <Icon name="pen" size={13} />
            {git.files.length ? tn(git.files.length, '{n} ungespeicherte Änderung', '{n} ungespeicherte Änderungen') : t('alles committet')}
          </button>
        </>
      )}
      <button className="stb-btn" onClick={() => openPanel('inspector')} title={tn(sessions.length, '{n} Session', '{n} Sessions')}>
        <span className={`dot ${lead}`} />
        {label}
        {sessions.length > 1 && <span className="dim">· {sessions.length}</span>}
      </button>
    </footer>
  )
}
