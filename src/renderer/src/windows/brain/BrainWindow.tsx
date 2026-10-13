// Das VibeDesk-Gehirn: was Claude über ein Projekt weiß – als lebendiger Graph.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../api'
import { NOTE_TYPES, NOTE_TYPE_LABEL, noteId, type BrainView, type GraphNodeKind } from '../../../../shared/brain'
import type { Project } from '../../../../shared/types'
import { recentProjects } from '../../desktop/recentProjects'
import { Icon } from '../../desktop/icons'
import { alert } from '../../store/dialogStore'
import { promptProject } from '../../store/sessionPrompt'
import { termWin, useSessions } from '../../store/sessionStore'
import { useSettings } from '../../store/settingsStore'
import { useUi } from '../../store/uiStore'
import { Toggle } from '../AmbienceMenu'
import { BrainGraph, KIND_COLOR, type GraphHandle } from './BrainGraph'
import { BrainSide, emptyDraft, type Draft } from './BrainSide'
import './brain.css'

export const BUILD_PROMPT =
  'Erkunde dieses Projekt und baue das VibeDesk-Gehirn auf: Lege mit brain_write für jeden wichtigen Bereich eine kurze Überblicks-Notiz (type module) mit den zentralen Dateien an, dazu die wichtigsten Konventionen und erkennbare Stolperfallen. Verlinke verwandte Notizen mit [[Titel]] und halte jede Notiz kurz (5–15 Zeilen).'
export const TEND_PROMPT =
  'Pflege das VibeDesk-Gehirn: Prüfe mit brain_overview die Notizen „zu prüfen“ gegen den aktuellen Code und aktualisiere oder archiviere sie. Halte danach mit brain_write fest, was du in dieser Session gelernt oder entschieden hast.'

const FILTERS: { kind: GraphNodeKind; label: string }[] = [...NOTE_TYPES.map((t) => ({ kind: t as GraphNodeKind, label: NOTE_TYPE_LABEL[t] })), { kind: 'file', label: 'Dateien' }]

/** Projekt der obersten Session, sonst das zuletzt geöffnete */
function defaultProject(projects: Project[]): string | null {
  const ui = useUi.getState()
  const sessions = useSessions.getState().sessions
  for (let i = ui.open.length - 1; i >= 0; i--) {
    const s = sessions.find((x) => termWin(x.id) === ui.open[i])
    if (s) return s.projectId
  }
  if (sessions[0]) return sessions[0].projectId
  return recentProjects(projects, 1)[0]?.id ?? null
}

export function BrainWindow(): React.JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState<string | null>(null)
  const [view, setView] = useState<BrainView | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [query, setQuery] = useState('')
  const [hidden, setHidden] = useState<ReadonlySet<GraphNodeKind>>(new Set())
  const graph = useRef<GraphHandle>(null)
  const brainOn = useSettings((s) => s.s?.brainOn ?? true)
  const sessionCount = useSessions((s) => s.sessions.filter((x) => x.projectId === projectId).length)

  useEffect(() => {
    void api.projects.list().then((list) => {
      setProjects(list)
      setProjectId((cur) => cur ?? defaultProject(list))
    })
  }, [])

  const load = useCallback(() => {
    if (!projectId) return
    void api.brain.view(projectId).then((v) => setView(v))
  }, [projectId])

  useEffect(() => {
    setView(null)
    setSelected(null)
    setDraft(null)
    load()
  }, [load])

  // live: Änderungen am Gehirn, Claude liest/ändert Dateien
  useEffect(() => {
    if (!projectId) return
    let refetch: ReturnType<typeof setTimeout> | undefined
    const offChanged = api.on.brainChanged((pid) => pid === projectId && load())
    const offPulse = api.on.brainPulse((p) => {
      if (p.projectId !== projectId) return
      // neue Datei im Spiel → Graph nachladen, damit sie auftaucht
      if (!graph.current?.pulse(p.id, p.kind)) {
        clearTimeout(refetch)
        refetch = setTimeout(load, 1500)
      }
    })
    return () => {
      offChanged()
      offPulse()
      clearTimeout(refetch)
    }
  }, [projectId, load])

  const select = useCallback((id: string | null) => {
    setDraft(null)
    setSelected(id)
    if (id) graph.current?.focusNode(id)
  }, [])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || !view) return []
    return view.graph.nodes.filter((n) => n.label.toLowerCase().includes(q))
  }, [query, view])

  const ask = async (prompt: string): Promise<void> => {
    if (!projectId) return
    if (!brainOn) {
      await alert('Gehirn ist ausgeschaltet', 'Schalte oben „Claude nutzt das Gehirn“ ein – neue Sessions bekommen es dann automatisch.')
      return
    }
    await promptProject(projectId, prompt)
  }

  const toggleKind = (k: GraphNodeKind): void => {
    const next = new Set(hidden)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    setHidden(next)
  }

  const project = projects.find((p) => p.id === projectId)
  const empty = view && view.notes === 0

  return (
    <div className="brain" data-testid="brain-window">
      <div className="brain-bar">
        <select className="field small brain-project" value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value)} data-testid="brain-project">
          {!projectId && <option value="">Projekt wählen</option>}
          {projects
            .filter((p) => !p.missing)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
        <div className="brain-search">
          <Icon name="search" size={14} />
          <input
            className="field small"
            placeholder="Suchen …"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches[0]) select(matches[0].id)
              if (e.key === 'Escape') setQuery('')
            }}
            data-testid="brain-search"
          />
        </div>
        {view && (
          <span className="brain-stats">
            {view.notes} Notizen{view.stale ? <b> · {view.stale} zu prüfen</b> : null}
          </span>
        )}
        <span className="brain-spacer" />
        <label className="brain-on" title="Neue Sessions bekommen das Gehirn als Werkzeug und einen Überblick beim Start">
          <span>Claude nutzt das Gehirn</span>
          <Toggle on={brainOn} onChange={(v) => useSettings.getState().set({ brainOn: v })} label="Claude nutzt das Gehirn" />
        </label>
        <button className="btn small" disabled={!projectId} onClick={() => (select(null), setDraft(emptyDraft()))} data-testid="brain-new">
          <Icon name="plus" size={13} /> Notiz
        </button>
        <button className="btn small primary" disabled={!projectId || empty === true} onClick={() => void ask(TEND_PROMPT)} title={sessionCount ? 'Schickt den Auftrag an die laufende Session' : 'Startet eine Session und schickt den Auftrag'}>
          <Icon name="spark" size={13} /> Gehirn pflegen
        </button>
        <button className="btn small ghost" disabled={!view?.notes} title="Ordner öffnen (auch in Obsidian nutzbar)" onClick={() => projectId && void api.brain.reveal(projectId)}>
          <Icon name="folder" size={14} />
        </button>
      </div>
      <div className="brain-filters">
        {FILTERS.map((f) => (
          <button key={f.kind} className={`brain-filter${hidden.has(f.kind) ? ' off' : ''}`} onClick={() => toggleKind(f.kind)}>
            <i style={{ background: KIND_COLOR[f.kind] }} />
            {f.label}
          </button>
        ))}
        <span className="brain-spacer" />
        <button className="brain-filter" onClick={() => graph.current?.fit()} title="Alles einpassen">
          <Icon name="grid" size={12} /> Einpassen
        </button>
      </div>
      <div className="brain-main">
        <div className="brain-stage">
          {view && <BrainGraph ref={graph} graph={view.graph} hidden={hidden} query={query} selected={selected} onSelect={select} />}
          {!projectId && <div className="brain-empty">Lege zuerst ein Projekt an – dann wächst hier sein Gehirn.</div>}
          {empty && (
            <div className="brain-empty card" data-testid="brain-empty">
              <Icon name="brain" size={34} />
              <h3>Das Gehirn von {project?.name ?? 'diesem Projekt'} ist noch leer</h3>
              <p>
                Hier sammelt sich, was Claude über dein Projekt lernt: Bereiche, Entscheidungen, Stolperfallen und Konventionen – als verlinkte Notizen. Jede neue Session startet mit diesem Wissen, statt alles neu zu erkunden.
              </p>
              <div className="row">
                <button className="btn primary" onClick={() => void ask(BUILD_PROMPT)} data-testid="brain-build">
                  <Icon name="spark" size={14} /> Gehirn aufbauen lassen
                </button>
                <button className="btn ghost" onClick={() => setDraft(emptyDraft())}>
                  Selbst eine Notiz schreiben
                </button>
              </div>
              {view.graph.nodes.length > 0 && <small className="dim">Die Punkte im Hintergrund sind Dateien, an denen Claude schon gearbeitet hat.</small>}
            </div>
          )}
          {view && !empty && (
            <div className="brain-legend">
              <span>
                <i className="pulse read" /> liest
              </span>
              <span>
                <i className="pulse edit" /> ändert
              </span>
              <span>
                <i className="pulse write" /> lernt
              </span>
              <span>
                <i className="stale" /> zu prüfen
              </span>
            </div>
          )}
        </div>
        {projectId && (selected || draft) && (
          <aside className="brain-side">
            <BrainSide
              projectId={projectId}
              selected={selected}
              draft={draft}
              setDraft={setDraft}
              onSelect={select}
              onSaved={(title) => {
                load()
                setTimeout(() => select(noteId(title)), 250)
              }}
            />
          </aside>
        )}
      </div>
    </div>
  )
}
