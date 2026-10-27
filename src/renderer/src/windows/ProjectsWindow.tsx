import { useCallback, useEffect, useState } from 'react'
import { api, errorText } from '../api'
import { Icon } from '../desktop/icons'
import { alert, useDialog, type DialogChoice } from '../store/dialogStore'
import { promptProject } from '../store/sessionPrompt'
import { useSessions } from '../store/sessionStore'
import { BLANK_TEMPLATE, projectTemplates, templateById, templatePrompt } from '../../../shared/projectTemplates'
import { relTime, shortenPath } from '../util'
import { PathInput } from './PathInput'
import type { ClaudeSessionMeta, Project } from '../../../shared/types'
import { Fragment } from 'react'
import { useRedact } from '../store/streamerStore'
import { t } from '../../../shared/i18n'
import { AGENT_KINDS, agentChoiceLabel } from '../../../shared/agents'

/** Kacheln für „Womit willst du starten?“ – „Leer“ zuerst */
function templateChoices(): DialogChoice[] {
  return [
    { id: BLANK_TEMPLATE, icon: '📁', label: t('Leer'), hint: t('Nur der Ordner – du sagst Claude selbst, was entstehen soll.') },
    ...projectTemplates().map((x) => ({ id: x.id, icon: x.icon, label: x.name, hint: x.hint }))
  ]
}

/** Fragt nach Namen und Vorlage, legt das Projekt an und startet gleich eine Session darin – mit Vorlage samt erstem Prompt. */
export async function newProject(afterCreate?: () => Promise<unknown>): Promise<void> {
  const r = await useDialog.getState().ask({
    kind: 'prompt',
    title: t('Neues Projekt'),
    message: t('Der Ordner wird in deinem Projekte-Verzeichnis angelegt.'),
    placeholder: t('Projektname'),
    confirmLabel: t('Anlegen'),
    choicesLabel: t('Womit willst du starten?'),
    choices: templateChoices(),
    detailPlaceholder: t('Worum geht’s? (optional, ein Satz)')
  })
  if (!r.ok || !r.value) return
  const tpl = templateById(r.choice)
  try {
    const p = await api.projects.create(r.value)
    await afterCreate?.()
    if (tpl) await promptProject(p.id, templatePrompt(tpl, { name: p.name, about: r.detail }))
    else await useSessions.getState().start(p.id)
  } catch (err) {
    await alert(t('Projekt konnte nicht angelegt werden'), errorText(err))
  }
}

export function ProjectsWindow(): React.JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [adding, setAdding] = useState(false)
  const [dir, setDir] = useState('')
  const sessions = useSessions((s) => s.sessions)
  const [histFor, setHistFor] = useState<string | null>(null)
  const [hist, setHist] = useState<ClaudeSessionMeta[] | null>(null)
  /** Projekt, für das gerade die Agenten-Wahl (Claude · Gemini CLI · Codex) offen ist */
  const [agentFor, setAgentFor] = useState<string | null>(null)
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

  const create = (): Promise<void> => newProject(reload)

  const addExisting = async (path: string): Promise<void> => {
    if (!path.trim()) return
    try {
      await api.projects.add(path.trim().replace(/[\\/]+$/, ''))
      setAdding(false)
      setDir('')
      await reload()
    } catch (err) {
      await alert(t('Ordner konnte nicht hinzugefügt werden'), errorText(err))
    }
  }

  const remove = async (p: Project): Promise<void> => {
    const r = await useDialog.getState().ask({
      kind: 'confirm',
      title: t('„{name}“ entfernen?', { name: p.name }),
      message: t('Das Projekt verschwindet aus der Liste. Der Ordner bleibt erhalten, außer du wählst unten den Papierkorb.'),
      checkbox: t('Ordner auch in den Papierkorb verschieben'),
      confirmLabel: t('Entfernen'),
      danger: true
    })
    if (!r.ok) return
    if (r.checked) {
      const sure = await useDialog.getState().ask({
        kind: 'confirm',
        title: t('Wirklich in den Papierkorb?'),
        message: `${red(p.path)}\n\n${t('Der komplette Ordner wird in den Windows-Papierkorb verschoben.')}`,
        confirmLabel: t('In den Papierkorb'),
        danger: true
      })
      if (!sure.ok) return
    }
    try {
      await api.projects.remove(p.id, r.checked)
    } catch (err) {
      await alert(t('Entfernen fehlgeschlagen'), errorText(err))
    }
    reload()
  }

  const running = new Set(sessions.map((s) => s.projectId))

  return (
    <div className="panel projects">
      <div className="row" style={{ marginBottom: 4 }}>
        <button className="btn primary small" onClick={create} data-testid="project-new">
          <Icon name="plus" size={14} /> {t('Neu')}
        </button>
        <button className="btn small" onClick={() => setAdding((a) => !a)}>
          <Icon name="folder" size={14} /> {t('Ordner hinzufügen')}
        </button>
      </div>
      {adding && <PathInput value={dir} onChange={setDir} onSubmit={addExisting} autoFocus />}
      {projects.length === 0 && (
        <div className="panel-empty">
          {t('Noch keine Projekte.')}
          <br />
          {t('Leg mit')} <b>{t('Neu')}</b> {t('eins an oder füg einen bestehenden Ordner hinzu.')}
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
                {p.missing && <span className="badge">{t('fehlt')}</span>}
              </div>
              <div className="ppath mono" title={red(p.path)}>
                {shortenPath(red(p.path))} · {relTime(p.lastOpenedAt)}
              </div>
            </div>
            <div className="pactions">
              <button className={`btn small ghost${histFor === p.id ? ' on' : ''}`} title={t('Frühere Sessions')} disabled={p.missing} onClick={() => toggleHist(p.id)} data-testid={`hist-${p.name}`}>
                <Icon name="history" size={14} />
              </button>
              <button className="btn small primary" disabled={p.missing} onClick={() => useSessions.getState().start(p.id)} data-testid={`open-${p.name}`}>
                <Icon name="play" size={13} /> {t('Öffnen')}
              </button>
              <button
                className={`btn small ghost${agentFor === p.id ? ' on' : ''}`}
                title={t('Mit einem anderen Agenten starten (Beta)')}
                disabled={p.missing}
                onClick={() => setAgentFor((v) => (v === p.id ? null : p.id))}
                data-testid={`agents-${p.name}`}
              >
                <Icon name="more" size={14} />
              </button>
              <button className="btn small ghost" title={t('Entfernen')} onClick={() => remove(p)} data-testid={`remove-${p.name}`}>
                <Icon name="trash" size={14} />
              </button>
            </div>
          </li>
          {agentFor === p.id && (
            <li className="hist">
              <div className="hist-row agent-pick">
                <span className="dim small">{t('Mit … starten:')}</span>
                {AGENT_KINDS.map((a) => (
                  <button
                    key={a}
                    className={`btn small${a === 'claude' ? ' primary' : ''}`}
                    onClick={() => {
                      setAgentFor(null)
                      void useSessions.getState().start(p.id, undefined, undefined, a)
                    }}
                    data-testid={`start-${a}-${p.name}`}
                  >
                    {agentChoiceLabel(a)}
                  </button>
                ))}
              </div>
            </li>
          )}
          {histFor === p.id && (
            <li className="hist">
              {!hist && <span className="spin" />}
              {hist && !hist.length && <span className="dim small">{t('Noch keine Claude-Sessions in diesem Ordner.')}</span>}
              {hist?.map((h) => (
                <div key={h.id} className="hist-row">
                  <span className="hist-title" title={h.title}>{h.title}</span>
                  <span className="dim small">{relTime(h.mtime)}</span>
                  <button className="btn small" onClick={() => useSessions.getState().start(p.id, h.id)}>
                    {t('Fortsetzen')}
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
