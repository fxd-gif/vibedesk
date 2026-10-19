// Das VibeDesk-Gehirn: was Claude über ein Projekt weiß – als lebendiger Graph.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../api'
import { ME_ID, NOTE_TYPES, noteId, type BrainView, type GraphNodeKind } from '../../../../shared/brain'
import { t, tn } from '../../../../shared/i18n'
import type { Project } from '../../../../shared/types'
import { Icon } from '../../desktop/icons'
import { alert } from '../../store/dialogStore'
import { promptProject } from '../../store/sessionPrompt'
import { useSessions } from '../../store/sessionStore'
import { activeProjectId } from '../../store/activeProject'
import { useSettings } from '../../store/settingsStore'
import { Toggle } from '../../desktop/Toggle'
import { BrainGraph, KIND_COLOR, noteTypeLabel, type GraphHandle } from './BrainGraph'
import { BrainSide, emptyDraft, type Draft } from './BrainSide'
import './brain.css'

export const buildPrompt = (): string =>
  t('Erkunde dieses Projekt und baue das VibeDesk-Gehirn auf: Lege mit brain_write für jeden wichtigen Bereich eine kurze Überblicks-Notiz (type module) mit den zentralen Dateien an, dazu die wichtigsten Konventionen und erkennbare Stolperfallen. Verlinke verwandte Notizen mit [[Titel]] und halte jede Notiz kurz (5–15 Zeilen).')
export const tendPrompt = (): string =>
  t('Pflege das VibeDesk-Gehirn: Prüfe mit brain_overview die Notizen „zu prüfen“ gegen den aktuellen Code und aktualisiere oder archiviere sie. Halte danach mit brain_write fest, was du in dieser Session gelernt oder entschieden hast.')

export const meetPrompt = (): string =>
  t('Lerne mich kennen, damit du in allen Projekten besser zu mir passt: Lies ~/.claude/CLAUDE.md (falls vorhanden) und das Gehirn dieses Projekts (brain_overview, vor allem Konventionen). Halte mit brain_write und scope "me" fest, was über dieses Projekt hinaus für mich gilt: wie ich arbeite, wie ich angesprochen werden will, Sprache, Stil, Werkzeuge, was ich nicht mag. Eine Notiz pro Thema, kurz (3–8 Zeilen). Was wörtlich schon in CLAUDE.md steht, nicht doppeln. Projektspezifisches gehört nicht hinein.')

const filters = (): { kind: GraphNodeKind; label: string }[] => [...NOTE_TYPES.map((k) => ({ kind: k as GraphNodeKind, label: noteTypeLabel(k) })), { kind: 'file', label: t('Dateien') }]

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
      setProjectId((cur) => cur ?? activeProjectId(list))
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

  const ask = async (prompt: string, target = projectId): Promise<void> => {
    if (!target || target === ME_ID) return
    if (!brainOn) {
      await alert(t('Gehirn ist ausgeschaltet'), t('Schalte oben „Claude nutzt das Gehirn“ ein – neue Sessions bekommen es dann automatisch.'))
      return
    }
    await promptProject(target, prompt)
  }

  const toggleKind = (k: GraphNodeKind): void => {
    const next = new Set(hidden)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    setHidden(next)
  }

  const project = projects.find((p) => p.id === projectId)
  const empty = view && view.notes === 0
  // persönliches Gehirn: kein Projekt dahinter, also keine Session zum Pflegen
  const isMe = projectId === ME_ID
  // „Lerne mich kennen“ läuft in einer Session des zuletzt genutzten Projekts
  const meetIn = isMe ? activeProjectId(projects) : null

  return (
    <div className="brain" data-testid="brain-window">
      <div className="brain-bar">
        <select className="field small brain-project" value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value)} data-testid="brain-project">
          {!projectId && <option value="">{t('Projekt wählen')}</option>}
          {projects
            .filter((p) => !p.missing)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          <option value={ME_ID}>{t('Über dich (alle Projekte)')}</option>
        </select>
        <div className="brain-search">
          <Icon name="search" size={14} />
          <input
            className="field small"
            placeholder={t('Suchen …')}
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
            {tn(view.notes, '{n} Notiz', '{n} Notizen')}{view.stale ? <b> · {t('{n} zu prüfen', { n: view.stale })}</b> : null}
          </span>
        )}
        <span className="brain-spacer" />
        <label className="brain-on" title={t('Neue Sessions bekommen das Gehirn als Werkzeug und einen Überblick beim Start')}>
          <span>{t('Claude nutzt das Gehirn')}</span>
          <Toggle on={brainOn} onChange={(v) => useSettings.getState().set({ brainOn: v })} label={t('Claude nutzt das Gehirn')} />
        </label>
        <button className="btn small" disabled={!projectId} onClick={() => (select(null), setDraft(emptyDraft()))} data-testid="brain-new">
          <Icon name="plus" size={13} /> {t('Notiz')}
        </button>
        <button className="btn small primary" disabled={!projectId || isMe || empty === true} onClick={() => void ask(tendPrompt())} title={sessionCount ? t('Schickt den Auftrag an die laufende Session') : t('Startet eine Session und schickt den Auftrag')}>
          <Icon name="spark" size={13} /> {t('Gehirn pflegen')}
        </button>
        <button className="btn small ghost" disabled={!view?.notes} title={t('Ordner öffnen (auch in Obsidian nutzbar)')} onClick={() => projectId && void api.brain.reveal(projectId)}>
          <Icon name="folder" size={14} />
        </button>
      </div>
      <div className="brain-filters">
        {filters().map((f) => (
          <button key={f.kind} className={`brain-filter${hidden.has(f.kind) ? ' off' : ''}`} onClick={() => toggleKind(f.kind)}>
            <i style={{ background: KIND_COLOR[f.kind] }} />
            {f.label}
          </button>
        ))}
        <span className="brain-spacer" />
        <button className="brain-filter" onClick={() => graph.current?.fit()} title={t('Alles einpassen')}>
          <Icon name="grid" size={12} /> {t('Einpassen')}
        </button>
      </div>
      <div className="brain-main">
        <div className="brain-stage">
          {view && <BrainGraph ref={graph} graph={view.graph} hidden={hidden} query={query} selected={selected} onSelect={select} />}
          {!projectId && <div className="brain-empty">{t('Lege zuerst ein Projekt an – dann wächst hier sein Gehirn.')}</div>}
          {empty && isMe && (
            <div className="brain-empty card" data-testid="brain-empty-me">
              <Icon name="brain" size={34} />
              <h3>{t('Claude kennt dich noch nicht')}</h3>
              <p>
                {t('Hier sammelt sich, was Claude über dich lernt – in allen Projekten: wie du arbeitest, was du magst und was nicht. Jede neue Session startet mit diesem Wissen. Die Notizen bleiben auf deinem PC und landen nie im Projekt.')}
              </p>
              <div className="row">
                <button className="btn primary" disabled={!meetIn} title={meetIn ? undefined : t('Lege zuerst ein Projekt an')} onClick={() => void ask(meetPrompt(), meetIn)} data-testid="brain-meet">
                  <Icon name="spark" size={14} /> {t('Claude lernt mich kennen')}
                </button>
                <button className="btn ghost" onClick={() => setDraft(emptyDraft())}>
                  {t('Selbst eine Notiz schreiben')}
                </button>
              </div>
            </div>
          )}
          {empty && !isMe && (
            <div className="brain-empty card" data-testid="brain-empty">
              <Icon name="brain" size={34} />
              <h3>{project ? t('Das Gehirn von {name} ist noch leer', { name: project.name }) : t('Das Gehirn dieses Projekts ist noch leer')}</h3>
              <p>
                {t('Hier sammelt sich, was Claude über dein Projekt lernt: Bereiche, Entscheidungen, Stolperfallen und Konventionen – als verlinkte Notizen. Jede neue Session startet mit diesem Wissen, statt alles neu zu erkunden.')}
              </p>
              <div className="row">
                <button className="btn primary" onClick={() => void ask(buildPrompt())} data-testid="brain-build">
                  <Icon name="spark" size={14} /> {t('Gehirn aufbauen lassen')}
                </button>
                <button className="btn ghost" onClick={() => setDraft(emptyDraft())}>
                  {t('Selbst eine Notiz schreiben')}
                </button>
              </div>
              {view.graph.nodes.length > 0 && <small className="dim">{t('Die Punkte im Hintergrund sind Dateien, an denen Claude schon gearbeitet hat.')}</small>}
            </div>
          )}
          {view && !empty && (
            <div className="brain-legend">
              <span>
                <i className="pulse read" /> {t('liest')}
              </span>
              <span>
                <i className="pulse edit" /> {t('ändert')}
              </span>
              <span>
                <i className="pulse write" /> {t('lernt')}
              </span>
              <span>
                <i className="stale" /> {t('zu prüfen')}
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
