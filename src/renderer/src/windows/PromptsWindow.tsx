import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { Icon } from '../desktop/icons'
import { confirm } from '../store/dialogStore'
import { termWin, useSessions } from '../store/sessionStore'
import { useSettings } from '../store/settingsStore'
import { useUi } from '../store/uiStore'
import { bracketedPaste } from '../../../shared/paste'
import type { Project, Prompt } from '../../../shared/types'
import { sharePrompts } from '../store/shareStore'

/** Session des obersten Terminal-Fensters (sonst die erste). */
function useActiveSession(): string | null {
  const sessions = useSessions((s) => s.sessions)
  const open = useUi((s) => s.open)
  const top = [...open].reverse().find((id) => id.startsWith('term:'))
  return top?.slice(5) ?? sessions[0]?.id ?? null
}

function PromptCard({ p, target, onEdit }: { p: Prompt; target: string | null; onEdit(): void }): React.JSX.Element {
  const send = (submit: boolean): void => {
    if (!target) return
    api.sessions.write(target, bracketedPaste(p.text) + (submit ? '\r' : ''))
    useUi.getState().focus(termWin(target))
  }
  return (
    <li className="prompt">
      <div className="row">
        <b>{p.title}</b>
        <div className="prompt-actions">
          <button className="btn small ghost" title="Bearbeiten" onClick={onEdit}>
            <Icon name="pen" size={13} />
          </button>
          <button className="btn small ghost" title="Als Code teilen" onClick={() => sharePrompts([p])}>
            <Icon name="share" size={13} />
          </button>
          <button className="btn small" disabled={!target} onClick={() => send(false)} title="Ins Terminal einfügen (nicht abschicken)">
            Einfügen
          </button>
          <button className="btn small primary" disabled={!target} onClick={() => send(true)} title="Einfügen und abschicken" data-testid={`send-${p.id}`}>
            Senden
          </button>
        </div>
      </div>
      <div className="prompt-text">{p.text}</div>
    </li>
  )
}

function PromptEditor({ p, onDone }: { p: Prompt; onDone(): void }): React.JSX.Element {
  const s = useSettings((x) => x.s)!
  const set = useSettings((x) => x.set)
  const [title, setTitle] = useState(p.title)
  const [text, setText] = useState(p.text)
  const save = (): void => {
    if (!text.trim()) return
    const next = { ...p, title: title.trim() || text.trim().slice(0, 30), text }
    const exists = s.prompts.some((x) => x.id === p.id)
    set({ prompts: exists ? s.prompts.map((x) => (x.id === p.id ? next : x)) : [...s.prompts, next] })
    onDone()
  }
  const remove = async (): Promise<void> => {
    if (await confirm({ title: `„${p.title || 'Prompt'}“ löschen?`, confirmLabel: 'Löschen', danger: true })) {
      set({ prompts: s.prompts.filter((x) => x.id !== p.id) })
      onDone()
    }
  }
  return (
    <li className="prompt editing">
      <input className="field small" placeholder="Titel" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      <textarea className="field small mono" rows={5} placeholder="Prompt-Text …" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="row">
        {s.prompts.some((x) => x.id === p.id) && (
          <button className="btn small ghost" onClick={remove}>
            <Icon name="trash" size={13} /> Löschen
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button className="btn small ghost" onClick={onDone}>
          Abbrechen
        </button>
        <button className="btn small primary" disabled={!text.trim()} onClick={save}>
          Speichern
        </button>
      </div>
    </li>
  )
}

function Notes(): React.JSX.Element {
  const sessions = useSessions((s) => s.sessions)
  const active = useActiveSession()
  const [projects, setProjects] = useState<Project[]>([])
  const [pid, setPid] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'dirty' | 'saved'>('idle')
  const hide = useSettings((x) => !!x.s?.streamer.enabled && !!x.s?.streamer.hideNotes)
  const [revealed, setRevealed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    api.projects.list().then((p) => {
      setProjects(p)
      setPid((cur) => cur ?? sessions.find((s) => s.id === active)?.projectId ?? p[0]?.id ?? null)
    })
  }, [active, sessions])

  useEffect(() => {
    if (!pid) return
    api.notes.get(pid).then((t) => {
      setText(t)
      setState('idle')
    })
  }, [pid])

  const change = (t: string): void => {
    setText(t)
    setState('dirty')
    clearTimeout(timer.current)
    const id = pid
    timer.current = setTimeout(() => id && api.notes.set(id, t).then(() => setState('saved')), 600)
  }

  if (!projects.length) return <div className="panel-empty">Leg zuerst ein Projekt an.</div>
  return (
    <div className="notes">
      <div className="row chips">
        {projects.map((p) => (
          <button key={p.id} className={`chip${pid === p.id ? ' on' : ''}`} onClick={() => setPid(p.id)}>
            {p.name}
          </button>
        ))}
        <span className="dim small" style={{ marginLeft: 'auto' }}>
          {state === 'dirty' ? 'speichert …' : state === 'saved' ? 'gespeichert' : ''}
        </span>
      </div>
      <div className="notes-wrap">
        <textarea className={`field notes-area${hide && !revealed ? ' veiled' : ''}`} placeholder="Ideen, Todos, Links für dieses Projekt …" value={text} onChange={(e) => change(e.target.value)} />
        {hide && !revealed && (
          <button className="veil" onClick={() => setRevealed(true)}>
            Notizen verdeckt (Streamer-Modus) · zum Anzeigen klicken
          </button>
        )}
      </div>
    </div>
  )
}

export function PromptsWindow(): React.JSX.Element {
  const prompts = useSettings((x) => x.s?.prompts ?? [])
  const sessions = useSessions((s) => s.sessions)
  const active = useActiveSession()
  const [tab, setTab] = useState<'prompts' | 'notes'>('prompts')
  const [editing, setEditing] = useState<Prompt | null>(null)
  const target = sessions.find((s) => s.id === active)

  return (
    <div className="panel">
      <div className="row tabs">
        <button className={`tab${tab === 'prompts' ? ' on' : ''}`} onClick={() => setTab('prompts')}>
          Prompts
        </button>
        <button className={`tab${tab === 'notes' ? ' on' : ''}`} onClick={() => setTab('notes')}>
          Notizen
        </button>
        {tab === 'prompts' && (
          <span className="dim small" style={{ marginLeft: 'auto' }}>
            {target ? `→ ${target.name}` : 'keine Session offen'}
          </span>
        )}
      </div>
      {tab === 'notes' ? (
        <Notes />
      ) : (
        <>
          <ul className="prompt-list">
            {prompts.map((p) =>
              editing?.id === p.id ? (
                <PromptEditor key={p.id} p={p} onDone={() => setEditing(null)} />
              ) : (
                <PromptCard key={p.id} p={p} target={active} onEdit={() => setEditing(p)} />
              )
            )}
            {editing && !prompts.some((p) => p.id === editing.id) && <PromptEditor p={editing} onDone={() => setEditing(null)} />}
          </ul>
          {!editing && (
            <div className="row">
              <button className="btn small" onClick={() => setEditing({ id: crypto.randomUUID(), title: '', text: '' })}>
                <Icon name="plus" size={13} /> Neuer Prompt
              </button>
              {prompts.length > 1 && (
                <button className="btn small ghost" onClick={() => sharePrompts(prompts)}>
                  <Icon name="share" size={13} /> Alle teilen
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
