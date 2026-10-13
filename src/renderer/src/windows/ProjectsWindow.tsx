import { useCallback, useEffect, useState } from 'react'
import { api, errorText } from '../api'
import { Icon } from '../desktop/icons'
import { alert, prompt, useDialog } from '../store/dialogStore'
import { useSessions } from '../store/sessionStore'
import { relTime, shortenPath } from '../util'
import { PathInput } from './PathInput'
import type { ClaudeSessionMeta, Project } from '../../../shared/types'
import { Fragment } from 'react'
import { useRedact } from '../store/streamerStore'

export function ProjectsWindow(): React.JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [adding, setAdding] = useState(false)
  const [dir, setDir] = useState('')
  const sessions = useSessions((s) => s.sessions)
  const [histFor, setHistFor] = useState<string | null>(null)
  const [hist, setHist] = useState<ClaudeSessionMeta[] | null>(null)
  const red = useRedact()

  const toggleHist = (id: string): void => {
    if (histFor === id) return setHistFor(null)
    setHistFor(id)
    setHist(null)
    api.history.list(id).then(setHist)
  }
  const reload = useCallback(() => api.projects.list().then(setProjects), [])

  useEffect(() => {
    reload()
  }, [reload, sessions.length])

  const create = async (): Promise<void> => {
    const name = await prompt({ title: 'Neues Projekt', message: 'Der Ordner wird in deinem Projekte-Verzeichnis angelegt.', placeholder: 'Projektname', confirmLabel: 'Anlegen' })
    if (!name) return
    try {
      const p = await api.projects.create(name)
      await reload()
      await useSessions.getState().start(p.id)
    } catch (err) {
      await alert('Projekt konnte nicht angelegt werden', errorText(err))
    }
  }

  const addExisting = async (path: string): Promise<void> => {
    if (!path.trim()) return
    try {
      await api.projects.add(path.trim().replace(/[\\/]+$/, ''))
      setAdding(false)
      setDir('')
      await reload()
    } catch (err) {
      await alert('Ordner konnte nicht hinzugefügt werden', errorText(err))
    }
  }

  const remove = async (p: Project): Promise<void> => {
    const r = await useDialog.getState().ask({
      kind: 'confirm',
      title: `„${p.name}“ entfernen?`,
      message: 'Das Projekt verschwindet aus der Liste. Der Ordner bleibt erhalten, außer du wählst unten den Papierkorb.',
      checkbox: 'Ordner auch in den Papierkorb verschieben',
      confirmLabel: 'Entfernen',
      danger: true
    })
    if (!r.ok) return
    if (r.checked) {
      const sure = await useDialog.getState().ask({
        kind: 'confirm',
        title: 'Wirklich in den Papierkorb?',
        message: `${red(p.path)}\n\nDer komplette Ordner wird in den Windows-Papierkorb verschoben.`,
        confirmLabel: 'In den Papierkorb',
        danger: true
      })
      if (!sure.ok) return
    }
    try {
      await api.projects.remove(p.id, r.checked)
    } catch (err) {
      await alert('Entfernen fehlgeschlagen', errorText(err))
    }
    reload()
  }

  const running = new Set(sessions.map((s) => s.projectId))

  return (
    <div className="panel projects">
      <div className="row" style={{ marginBottom: 4 }}>
        <button className="btn primary small" onClick={create} data-testid="project-new">
          <Icon name="plus" size={14} /> Neu
        </button>
        <button className="btn small" onClick={() => setAdding((a) => !a)}>
          <Icon name="folder" size={14} /> Ordner hinzufügen
        </button>
      </div>
      {adding && <PathInput value={dir} onChange={setDir} onSubmit={addExisting} autoFocus />}
      {projects.length === 0 && (
        <div className="panel-empty">
          Noch keine Projekte.
          <br />
          Leg mit <b>Neu</b> eins an oder füg einen bestehenden Ordner hinzu.
        </div>
      )}
      <ul className="plist">
        {projects.map((p) => (
          <Fragment key={p.id}>
          <li className={`pitem${p.missing ? ' missing' : ''}`} onDoubleClick={() => !p.missing && useSessions.getState().start(p.id)}>
            <div className="pinfo">
              <div className="pname">
                {running.has(p.id) && <span className="dot working" />}
                {p.name}
                {p.missing && <span className="badge">fehlt</span>}
              </div>
              <div className="ppath mono" title={red(p.path)}>
                {shortenPath(red(p.path))} · {relTime(p.lastOpenedAt)}
              </div>
            </div>
            <div className="pactions">
              <button className={`btn small ghost${histFor === p.id ? ' on' : ''}`} title="Frühere Sessions" disabled={p.missing} onClick={() => toggleHist(p.id)} data-testid={`hist-${p.name}`}>
                <Icon name="history" size={14} />
              </button>
              <button className="btn small primary" disabled={p.missing} onClick={() => useSessions.getState().start(p.id)} data-testid={`open-${p.name}`}>
                <Icon name="play" size={13} /> Öffnen
              </button>
              <button className="btn small ghost" title="Entfernen" onClick={() => remove(p)} data-testid={`remove-${p.name}`}>
                <Icon name="trash" size={14} />
              </button>
            </div>
          </li>
          {histFor === p.id && (
            <li className="hist">
              {!hist && <span className="spin" />}
              {hist && !hist.length && <span className="dim small">Noch keine Claude-Sessions in diesem Ordner.</span>}
              {hist?.map((h) => (
                <div key={h.id} className="hist-row">
                  <span className="hist-title" title={h.title}>{h.title}</span>
                  <span className="dim small">{relTime(h.mtime)}</span>
                  <button className="btn small" onClick={() => useSessions.getState().start(p.id, h.id)}>
                    Fortsetzen
                  </button>
                </div>
              ))}
            </li>
          )}
          </Fragment>
        ))}
      </ul>
    </div>
  )
}
