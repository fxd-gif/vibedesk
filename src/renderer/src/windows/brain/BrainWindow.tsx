// Das VibeDesk-Gehirn: was Claude über ein Projekt weiß – als lebendiger Graph.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../api'
import { ME_ID, NOTE_TYPES, noteId, type BrainView, type GraphNodeKind } from '../../../../shared/brain'
import { heatColor, withHotspots, type Hotspot } from '../../../../shared/hotspots'
import { t, tn } from '../../../../shared/i18n'
import type { Project } from '../../../../shared/types'
import { Icon } from '../../desktop/icons'
import { alert } from '../../store/dialogStore'
import { inform } from '../../store/notifyStore'
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

export const hotspotNotePrompt = (file: string, commits: number): string =>
  t('Die Datei {file} wurde in den letzten 90 Tagen in {n} Commits geändert, im Gehirn steht aber noch nichts dazu. Lies sie und halte mit brain_write fest, was man darüber wissen sollte: wofür sie da ist, wie sie mit dem Rest zusammenhängt und worauf man beim Ändern achten muss. Gib die Datei unter files an, verlinke passende Notizen mit [[Titel]] und halte die Notiz kurz (5–15 Zeilen).', { file, n: commits })

// Hotspots-Chip merken (pro Rechner, wie die Inspector-Reiter)
const HOT_KEY = 'vibedesk.brainHotspots'
const hotInitial = (): boolean => {
  try {
    return localStorage.getItem(HOT_KEY) === '1'
  } catch {
    return false
  }
}

const filters = (): { kind: GraphNodeKind; label: string }[] => [...NOTE_TYPES.map((k) => ({ kind: k as GraphNodeKind, label: noteTypeLabel(k) })), { kind: 'file', label: t('Dateien') }]

export function BrainWindow(): React.JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState<string | null>(null)
  const [view, setView] = useState<BrainView | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [query, setQuery] = useState('')
  const [hidden, setHidden] = useState<ReadonlySet<GraphNodeKind>>(new Set())
  const [heatOn, setHeatOn] = useState(hotInitial)
  const [hot, setHot] = useState<Hotspot[]>([])
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

  // leeres Gehirn: gibt es CLAUDE.md oder README, aus denen VibeDesk sofort Startnotizen machen kann?
  const [sources, setSources] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const isEmpty = !!view && view.notes === 0
  useEffect(() => {
    setSources([])
    if (!isEmpty || !projectId || projectId === ME_ID) return
    let live = true
    void api.brain.importable(projectId).then((s) => live && setSources(s), () => undefined)
    return () => {
      live = false
    }
  }, [isEmpty, projectId])

  const importDocs = async (): Promise<void> => {
    if (!projectId) return
    setImporting(true)
    try {
      const n = await api.brain.importDocs(projectId)
      inform(n ? tn(n, '{n} Startnotiz übernommen', '{n} Startnotizen übernommen') : t('Nichts Passendes gefunden'), n ? t('Aus {files}. Claude ergänzt sie, sobald es im Projekt arbeitet.', { files: sources.join(', ') }) : undefined)
      load()
    } catch (err) {
      await alert(t('Übernehmen fehlgeschlagen'), String(err instanceof Error ? err.message : err))
    } finally {
      setImporting(false)
    }
  }

  // Hotspots aus git log – nur wenn der Chip an ist (Main cacht einige Minuten)
  useEffect(() => {
    setHot([])
    if (!heatOn || !projectId || projectId === ME_ID) return
    let live = true
    void api.brain
      .hotspots(projectId)
      .then((h) => live && setHot(h))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [heatOn, projectId])

  const toggleHeat = (): void => {
    const v = !heatOn
    setHeatOn(v)
    try {
      localStorage.setItem(HOT_KEY, v ? '1' : '0')
    } catch {
      // egal
    }
  }

  const shown = useMemo(() => (view && heatOn && hot.length ? withHotspots(view.graph, hot) : view?.graph), [view, heatOn, hot])
  const hotOf = useMemo(() => new Map(hot.map((h) => [h.path, h.commits])), [hot])

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
  // Hotspots nur zeigen, wenn git auch welche geliefert hat (kein Repo → Graph wie bisher)
  const heatShown = heatOn && !isMe && hot.length > 0

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
        <span className="brain-sep" />
        <button
          className={`brain-filter${heatOn ? '' : ' off'}`}
          onClick={toggleHeat}
          disabled={isMe}
          title={t('Färbt Dateien danach, wie oft sie in den letzten 90 Tagen geändert wurden – dort lohnt sich Wissen im Gehirn')}
          data-testid="brain-hotspots"
        >
          <i style={{ background: heatColor(1) }} />
          {t('Hotspots')}
        </button>
        <span className="brain-spacer" />
        <button className="brain-filter" onClick={() => graph.current?.fit()} title={t('Alles einpassen')}>
          <Icon name="grid" size={12} /> {t('Einpassen')}
        </button>
      </div>
      <div className="brain-main">
        <div className="brain-stage">
          {shown && <BrainGraph ref={graph} graph={shown} hidden={hidden} query={query} selected={selected} heatOn={heatShown} onSelect={select} />}
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
                {sources.length > 0 && (
                  <button className="btn" disabled={importing} onClick={() => void importDocs()} title={t('Sofort und ohne Tokens: Abschnitte aus {files} werden zu Notizen', { files: sources.join(', ') })} data-testid="brain-import">
                    {importing ? <span className="spin" /> : <Icon name="plus" size={14} />} {t('Aus {files} übernehmen', { files: sources.map((s) => s.replace(/^.*\//, '')).join(' & ') })}
                  </button>
                )}
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
              {heatShown && (
                <>
                  <span>
                    <i className="heat" /> {t('selten → oft geändert')}
                  </span>
                  <span>
                    <i className="unlinked" /> {t('Hotspot ohne Notiz')}
                  </span>
                </>
              )}
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
              commits={heatShown && selected?.startsWith('f:') ? hotOf.get(selected.slice(2)) : undefined}
              onAskNote={(file, n) => void ask(hotspotNotePrompt(file, n))}
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
