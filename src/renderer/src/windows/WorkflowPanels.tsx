import { useEffect, useState } from 'react'
import { Icon } from '../desktop/icons'
import { termWin, useSessions } from '../store/sessionStore'
import { centeredRect, useUi } from '../store/uiStore'
import { useWorkflow } from '../store/workflowStore'
import type { FeedEntry } from '../store/workflowReducer'
import { clock, relTime } from '../util'
import { STATUS_TEXT } from './TerminalWindow'
import { openInEditor } from '../store/editorStore'
import { useRedact } from '../store/streamerStore'

function useNow(ms = 15000): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

const NoSessions = () => (
  <div className="panel-empty">
    Keine laufenden Sessions.
    <br />
    Öffne ein Projekt, dann siehst du hier live, was Claude tut.
    <br />
    <button className="btn small primary" style={{ marginTop: 12 }} onClick={() => useUi.getState().openWin('projects', centeredRect(520, 480))}>
      <Icon name="folder" size={14} /> Projekt öffnen
    </button>
  </div>
)

export function StatusPanel(): React.JSX.Element {
  const sessions = useSessions((s) => s.sessions)
  const wf = useWorkflow((s) => s.sessions)
  const now = useNow()
  if (!sessions.length) return <NoSessions />
  return (
    <div className="panel status-grid">
      {sessions.map((s) => {
        const w = wf[s.id]
        const st = w?.status ?? 'idle'
        return (
          <button key={s.id} className={`status-card ${st}`} onClick={() => useUi.getState().focus(termWin(s.id))} data-testid={`status-${s.name}`}>
            <div className="row">
              <span className={`dot ${st}`} />
              <b>{s.name}</b>
            </div>
            <div className="status-text">{STATUS_TEXT[st]}</div>
            <div className="dim small">{w?.lastActivity ? relTime(w.lastActivity, now) : 'noch keine Aktivität'}</div>
          </button>
        )
      })}
    </div>
  )
}

const resultMark = (r: FeedEntry['result']) =>
  r === 'ok' ? <span className="ok">✓</span> : r === 'fail' ? <span className="fail">✗</span> : r === 'stopped' ? <span className="dim" title="abgebrochen">–</span> : <span className="spin" />

export function FeedPanel(): React.JSX.Element {
  const sessions = useSessions((s) => s.sessions)
  const wf = useWorkflow((s) => s.sessions)
  const [filter, setFilter] = useState<string | null>(null)
  const red = useRedact()
  if (!sessions.length) return <NoSessions />
  const names = Object.fromEntries(sessions.map((s) => [s.id, s.name]))
  const entries = sessions
    .filter((s) => !filter || s.id === filter)
    .flatMap((s) => wf[s.id]?.feed ?? [])
    .sort((a, b) => b.id - a.id)
    .slice(0, 300)
  return (
    <div className="panel feed">
      {sessions.length > 1 && (
        <div className="row chips">
          <button className={`chip${!filter ? ' on' : ''}`} onClick={() => setFilter(null)}>
            Alle
          </button>
          {sessions.map((s) => (
            <button key={s.id} className={`chip${filter === s.id ? ' on' : ''}`} onClick={() => setFilter(s.id)}>
              {s.name}
            </button>
          ))}
        </div>
      )}
      {!entries.length && <div className="panel-empty">Noch keine Aktionen.</div>}
      <ul className="feed-list">
        {entries.map((e) => (
          <li
            key={e.id}
            className={`feed-row ${e.result}${e.filePath ? ' link' : ''}`}
            data-testid="feed-row"
            onClick={e.filePath ? () => openInEditor(e.filePath!, e.find) : undefined}
            title={e.filePath ? `Im Editor öffnen: ${e.filePath}` : undefined}
          >
            <span className="mono dim">{clock(e.ts)}</span>
            {sessions.length > 1 && <span className="feed-sess">{names[e.sessionId]}</span>}
            <span className="feed-tool">{e.tool}</span>
            <span className="feed-target mono">
              {red(e.target)}
            </span>
            {resultMark(e.result)}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function TodoPanel(): React.JSX.Element {
  const sessions = useSessions((s) => s.sessions)
  const wf = useWorkflow((s) => s.sessions)
  if (!sessions.length) return <NoSessions />
  const withTodos = sessions.filter((s) => wf[s.id]?.todos.length)
  if (!withTodos.length) return <div className="panel-empty">Noch keine Todo-Listen.<br />Sobald Claude plant, erscheinen sie hier.</div>
  return (
    <div className="panel">
      {withTodos.map((s) => {
        const todos = wf[s.id].todos
        const done = todos.filter((t) => t.status === 'completed').length
        return (
          <section key={s.id} className="todo-block">
            <div className="row">
              <b>{s.name}</b>
              <span className="dim" style={{ marginLeft: 'auto' }}>
                {done}/{todos.length}
              </span>
            </div>
            <div className="progress">
              <i style={{ width: `${(done / todos.length) * 100}%` }} />
            </div>
            <ul className="todo-list">
              {todos.map((t, i) => (
                <li key={i} className={t.status}>
                  <span className="todo-mark">{t.status === 'completed' ? <Icon name="check" size={12} /> : null}</span>
                  {t.content}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

export function AgentPanel(): React.JSX.Element {
  const sessions = useSessions((s) => s.sessions)
  const wf = useWorkflow((s) => s.sessions)
  if (!sessions.length) return <NoSessions />
  return (
    <div className="panel">
      <ul className="tree">
        {sessions.map((s) => {
          const agents = wf[s.id]?.agents ?? []
          const st = wf[s.id]?.status ?? 'idle'
          return (
            <li key={s.id}>
              <div className="row tree-root">
                <span className={`dot ${st}`} />
                <b>{s.name}</b>
                <span className="dim">· Hauptsession</span>
              </div>
              {agents.length > 0 && (
                <ul>
                  {agents.map((a) => (
                    <li key={a.id} className={`tree-node${a.done ? ' done' : ''}`} title={a.result ?? (a.done ? 'fertig' : 'arbeitet …')}>
                      {a.done ? <span className="ok">✓</span> : <span className="spin" />}
                      <b>{a.type}</b>
                      <span className="dim">{a.description || (a.done ? 'fertig' : 'arbeitet …')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
