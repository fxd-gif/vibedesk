// Ruhiger Einstieg: solange keine Session läuft und kein Fenster offen ist, gibt es genau eine Frage.
import { useEffect, useState } from 'react'
import { api } from '../api'
import type { Project } from '../../../shared/types'
import { useSessions } from '../store/sessionStore'
import { useSettings } from '../store/settingsStore'
import { useUi } from '../store/uiStore'
import { relTime } from '../util'
import { openPanel } from '../windows/palette/CommandPalette'
import { newProject } from '../windows/ProjectsWindow'
import { Icon } from './icons'
import { recentProjects } from './recentProjects'
import { t } from '../../../shared/i18n'

export function StartCard(): React.JSX.Element | null {
  const onboarded = useSettings((s) => !!s.s?.onboarded)
  const running = useSessions((s) => s.sessions.length)
  const anyWindow = useUi((s) => s.open.some((id) => !s.minimized.includes(id)))
  const [projects, setProjects] = useState<Project[] | null>(null)
  const show = onboarded && !running && !anyWindow

  useEffect(() => {
    if (show) void api.projects.list().then(setProjects)
  }, [show])

  if (!show || !projects) return null
  const recent = recentProjects(projects)
  const start = (p: Project): void => void useSessions.getState().start(p.id)

  return (
    <div className="start-card" data-testid="start-card">
      <h2>{t('Woran baust du heute?')}</h2>
      {recent.length ? (
        <ul className="start-list">
          {recent.map((p, i) => (
            <li key={p.id}>
              <button className={i === 0 ? 'first' : undefined} onClick={() => start(p)} data-testid={`start-${p.name}`}>
                <Icon name="folder" size={16} />
                <b>{p.name}</b>
                <span>{relTime(p.lastOpenedAt)}</span>
                <Icon name="play" size={13} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>{t('Leg dein erstes Projekt an – VibeDesk startet Claude Code direkt darin.')}</p>
      )}
      <div className="start-actions">
        <button className={`btn${recent.length ? '' : ' primary big'}`} onClick={() => void newProject()} data-testid="start-new">
          <Icon name="plus" size={14} /> {t('Neues Projekt')}
        </button>
        <button className="btn ghost" onClick={() => openPanel('projects')}>
          {recent.length ? t('Alle Projekte') : t('Bestehenden Ordner öffnen')}
        </button>
      </div>
    </div>
  )
}
