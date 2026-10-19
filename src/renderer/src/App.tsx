import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { centeredRect, useUi } from './store/uiStore'
import { GlassWindow } from './desktop/GlassWindow'
import { DialogHost } from './desktop/Dialog'
import { Dock, type DockItem } from './desktop/Dock'
import { Sidebar } from './desktop/Sidebar'
import { StatusBar } from './desktop/StatusBar'
import { migratePanels, PANELS, PANEL_IDS, panelDef } from './windows/panels'
import { checkWhatsNew, WhatsNew } from './changelog/WhatsNew'
import { checkWrapped, VibeWrapped } from './wrapped/VibeWrapped'
import { checkSetupOnStart, SetupPrompt, wireSetup } from './windows/ToolSetup'
import { CommandPalette, usePalette, wirePalette } from './windows/palette/CommandPalette'
import type { PanelId } from '../../shared/types'
import './desktop/desktop.css'
import './desktop/social.css'
import { kindOf, restoreSessions, termWin, useSessions, wireSessions } from './store/sessionStore'
import { useWorkflow, wireWorkflow } from './store/workflowStore'
import { wireStats } from './store/statsStore'
import { wireChime } from './ambience/chime'
import { usePreview, wirePreview } from './store/previewStore'
import { wireAttachments } from './store/attachStore'
import { wireResume } from './store/resumeStore'
import { About } from './desktop/About'
import { PreviewWindow } from './windows/PreviewWindow'
import { TerminalWindow } from './windows/TerminalWindow'
import { ShellWindow } from './windows/ShellWindow'
import { restoreShells, useShells, wireShells } from './store/shellStore'
import { RainCanvas } from './ambience/RainCanvas'
import { useSettings } from './store/settingsStore'
import { ambienceAudio } from './ambience/audio'
import { isMuted } from './ambience/toggles'
import { useSpotify } from './store/spotifyStore'
import { useFocus, wireFocus } from './store/focusStore'
import { phaseTotal, remaining } from './store/focusTimer'
import { Ring, toneOf } from './windows/FocusPanel'
import { Icon } from './desktop/icons'
import { wireDiscord } from './store/discordStore'
import { wireWebhook } from './store/webhookStore'
import { wireUpdate } from './store/updateStore'
import { Onboarding } from './windows/Onboarding'
import { EDITOR_ID, toggleEditor, wireEditor } from './store/editorStore'
import { startAddonRuntime } from './addons/runtime'
import { InstallDialog, openInstallDialog, wireAddonImport } from './windows/addons/InstallDialog'
import { AskToast } from './addons/AskToast'
import { useLounge, wireLounge } from './store/loungeStore'
import { wireStreamer } from './store/streamerStore'
import { LoungeFloaters } from './windows/LoungeWindow'
import { Curtain, StreamerPill } from './windows/StreamerWindow'
import { ShareDialogs } from './windows/ShareDialogs'
import { openPanel } from './windows/palette/CommandPalette'
import { NotifyPanel, ToastStack } from './desktop/NotifyCenter'
import { setPanel as setNotifyPanel, useNotify, wireNotify } from './store/notifyStore'
import { wireWatcher } from './store/watcher'
import { wireQueue } from './store/queueStore'
import { wireQuick } from './store/quickStore'
import { StartCard } from './desktop/StartCard'
import { MoreMenu } from './desktop/MoreMenu'
import { dockPlan, earned, showPreviewInDock } from './desktop/dockPlan'
import { useAddons } from './store/addonStore'
import { useBrainUsed, wireBrainActivity } from './store/brainActivity'
import { hasEdits } from './store/workflowReducer'
import { wireCalm } from './desktop/calm'
import { ZenBar } from './desktop/ZenBar'
import { Tour } from './desktop/Tour'
import { wireHints } from './store/hintStore'
import { wireLimits } from './store/limitStore'
import { wirePermissions } from './store/permissionStore'
import { wireCompanion } from './store/companionStore'
import { t } from '../../shared/i18n'


const initials = (n: string): string => {
  const parts = n.split(/[\s\-_.]+/).filter(Boolean)
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : n.slice(0, 2)).toUpperCase()
}

function useEscHold(): boolean {
  const [holding, setHolding] = useState(false)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null
    const down = (e: KeyboardEvent): void => {
      if (e.key === 'F11') {
        e.preventDefault()
        api.app.toggleFullscreen()
        return
      }
      if (e.key !== 'Escape' || e.repeat || t) return
      // In Terminals gehört Esc Claude Code (Unterbrechen)
      if ((e.target as HTMLElement | null)?.closest?.('.xterm')) return
      setHolding(true)
      t = setTimeout(() => {
        api.app.exitFullscreen()
        setHolding(false)
        t = null
      }, 1000)
    }
    const up = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      if (t) clearTimeout(t)
      t = null
      setHolding(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])
  return holding
}

export default function App(): React.JSX.Element {
  const open = useUi((s) => s.open)
  const minimized = useUi((s) => s.minimized)
  const [ready, setReady] = useState(false)
  const holding = useEscHold()
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const sessions = useSessions((s) => s.sessions)
  const shells = useShells((s) => s.shells)
  const settings = useSettings((s) => s.s)
  const previews = usePreview((s) => s.open)
  const focusPhase = useFocus((s) => s.state.phase)
  // nur minutengenau – sonst würde die ganze App jede Sekunde neu rendern
  const focusMinutes = useFocus((s) => Math.ceil(remaining(s.state, s.now) / 60_000))
  const focusBanner = useFocus((s) => s.banner)
  const paletteOpen = usePalette((s) => s.open)
  const spotifyPlaying = useSpotify((s) => !!s.player?.playing)
  const [audioState, setAudioState] = useState({ musicOffline: false, musicPlaying: false })

  useEffect(() => ambienceAudio.onState(setAudioState), [])
  useEffect(() => {
    if (settings) ambienceAudio.setMusic(settings.musicOn, settings.musicVolume, settings.streamUrl)
  }, [settings?.musicOn, settings?.musicVolume, settings?.streamUrl])
  useEffect(() => {
    if (settings) ambienceAudio.setRain(settings.rainSoundOn, settings.rainSoundVolume, settings.rainIntensity)
  }, [settings?.rainSoundOn, settings?.rainSoundVolume, settings?.rainIntensity])
  const statusKey = useWorkflow((s) => sessions.map((x) => s.sessions[x.id]?.status ?? 'idle').join(','))
  const statuses = statusKey.split(',')
  const loungeState = useLounge((s) => s.state)
  const loungePeers = useLounge((s) => Object.keys(s.peers).length)
  const loungeUnread = useLounge((s) => s.unread)
  const notifyUnread = useNotify((s) => s.unread)
  const notifyOpen = useNotify((s) => s.panel)
  const addonCount = useAddons((s) => s.list.length)
  const edits = useWorkflow(hasEdits)
  const brainUsed = useBrainUsed()
  const zen = useUi((s) => s.zen)
  const detected = usePreview((s) => Object.values(s.urls).flat().length)
  /** einmal verdiente Dock-Symbole bleiben bis zum Neustart */
  const sticky = useRef(new Set<PanelId>())
  const [more, setMore] = useState(false)
  const closeMore = useCallback(() => setMore(false), [])

  useEffect(() => {
    wireWorkflow()
    wireSessions()
    wireShells()
    wireStats()
    wireChime()
    wirePreview()
    wireAttachments()
    wireResume()
    wireFocus()
    wireDiscord()
    wireWebhook()
    wireUpdate()
    wireEditor()
    wirePalette()
    wireSetup()
    wireAddonImport()
    wireLounge()
    wireStreamer()
    wireNotify()
    wireWatcher()
    wireQueue()
    wireQuick()
    wireBrainActivity()
    wirePermissions()
    wireCompanion()
    wireCalm()
    wireHints()
    wireLimits()
    useSettings.getState().load().then((s) => {
      const ui = useUi.getState()
      ui.initRects(s.windowRects)
      const migrated = migratePanels(s.visiblePanels)
      // ohne gemerkte Fenster begrüßt die Startkarte
      migrated.forEach((id) => {
        const def = panelDef(id)
        if (def) ui.openWin(id, centeredRect(def.w, def.h))
      })
      // Sessions und Shells, die ein Neuladen des Fensters überlebt haben
      void restoreSessions()
      void restoreShells()
      setReady(true)
      startAddonRuntime()
      // per Doppelklick geöffnete .vibeaddon-Datei
      void api.addons.takePending().then((p) => {
        if (p) void openInstallDialog(p)
      })
      checkWhatsNew()
      void checkWrapped()
      if (s.onboarded) checkSetupOnStart()
    })
  }, [])

  // Fensterpositionen + sichtbare Panels persistieren (debounced)
  useEffect(() => {
    if (!ready) return
    return useUi.subscribe((s) => {
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        const rects = Object.fromEntries(Object.entries(s.rects).filter(([id]) => !id.startsWith('term:') && !id.startsWith('shell:')))
        const visiblePanels = s.open.filter((id) => PANEL_IDS.includes(id)) as PanelId[]
        api.settings.set({ windowRects: rects, visiblePanels })
      }, 500)
    })
  }, [ready])

  const ui = useUi.getState()
  const isOn = (id: string) => open.includes(id) && !minimized.includes(id)
  const panelItem = (id: PanelId): DockItem => {
    const def = panelDef(id)!
    return { id, icon: def.icon, label: def.title, hint: def.hint, active: isOn(id), onClick: () => ui.toggleWin(id, centeredRect(def.w, def.h)) }
  }
  const dockCtx = {
    // die Seitenleiste hat Platz – dort stehen die Werkzeuge immer
    all: !!settings?.dockAll || settings?.layout === 'studio',
    sessions: sessions.length,
    addons: addonCount,
    loungeOn: loungeState !== 'off',
    isOpen: (id: PanelId) => open.includes(id),
    edits,
    brainUsed: brainUsed && settings?.brainOn !== false,
    off: settings?.modulesOff ?? [],
    sticky: sticky.current
  }
  const plan = dockPlan(dockCtx)
  for (const id of plan.dock) if (earned(id, dockCtx)) sticky.current.add(id)
  const toolItem = (id: PanelId): DockItem => {
    if (id === 'editor') return { ...panelItem('editor'), onClick: () => void toggleEditor() }
    if (id === 'lounge')
      return {
        ...panelItem('lounge'),
        label: loungeState === 'off' ? t('Vibe-Lounge') : loungeUnread ? t('Vibe-Lounge · {n} online · {unread} neu', { n: loungePeers + 1, unread: loungeUnread }) : t('Vibe-Lounge · {n} online', { n: loungePeers + 1 }),
        badge: loungeUnread ? <span className="dock-count">{loungeUnread > 9 ? '9+' : loungeUnread}</span> : loungeState !== 'off' ? <span className="dot done" /> : undefined
      }
    return panelItem(id)
  }

  // Aufbau-Theme: Desktop (Dock) oder Studio (Seitenleiste + Statusleiste) – beide bekommen dieselben Gruppen
  const studio = settings?.layout === 'studio'
  const Nav = studio ? Sidebar : Dock

  return (
    <div className={`app${zen ? ' zen' : ''}`} data-layout={studio ? 'studio' : 'desktop'}>
      {settings && (
        <RainCanvas
          scene={settings.scene}
          customImage={settings.scene.startsWith('custom:') ? settings.scene.slice(7) : undefined}
          intensity={settings.rainIntensity}
          blur={settings.blur}
        />
      )}
      {/* Feste DOM-Reihenfolge: Umsortieren beim Fokussieren würde Klicks verschlucken; Ebenen nur per z-index */}
      {PANELS.filter((p) => open.includes(p.id)).map((def) => {
        const id = def.id
        return (
          <GlassWindow key={id} id={id} title={def.title} onClose={def.onClose} minW={id === EDITOR_ID ? 520 : undefined} minH={id === EDITOR_ID ? 300 : undefined}>
            {def.render()}
          </GlassWindow>
        )
      })}
      {sessions.map((s) => (
        <TerminalWindow key={s.id} session={s} />
      ))}
      {shells
        .filter((s) => !s.attachedTo)
        .map((s) => (
          <ShellWindow key={s.id} shell={s} />
        ))}
      {Object.keys(previews).map((k) => (
        <PreviewWindow key={k} id={k} />
      ))}
      {/* im Zen-Modus holt die Maus am unteren Rand das Dock zurück – steht vor dem Dock, damit CSS (~) es findet */}
      {zen && <div className="zen-reveal" aria-hidden />}
      <Nav
        groups={[
          [
            { id: 'palette', icon: 'command', label: t('Befehle (Strg+K)'), hint: t('Alles per Suche: Fenster, Projekte, Aktionen'), active: paletteOpen, onClick: () => usePalette.getState().show(!paletteOpen) },
            panelItem('projects')
          ],
          [
            {
              ...panelItem('ambience'),
              label: settings?.musicOn && audioState.musicOffline ? t('Atmosphäre · Lofi-Radio offline') : t('Atmosphäre & Musik'),
              className: settings?.musicOn && audioState.musicOffline ? 'offline' : undefined,
              badge: (settings?.musicOn && !isMuted(settings.musicVolume) && !audioState.musicOffline) || spotifyPlaying ? <span className="dock-eq" aria-hidden><i /><i /><i /></span> : undefined
            },
            (() => {
              const def = panelDef('focus')!
              return {
                id: 'focus',
                label: focusPhase === 'idle' ? t('Fokus-Timer') : focusPhase === 'work' ? t('Fokus · noch {n} min', { n: focusMinutes }) : t('Pause · noch {n} min', { n: focusMinutes }),
                active: isOn('focus'),
                onClick: () => ui.toggleWin('focus', centeredRect(def.w, def.h)),
                content: <FocusRing />
              }
            })()
          ],
          sessions.map((s, i) => {
            const id = termWin(s.id)
            const st = statuses[i] || 'idle'
            return {
              // die ID der Session, nicht der Name – mehrere Sessions pro Projekt haben denselben Namen
              id: 'sess-' + s.id,
              testId: 'sess-' + s.name,
              label: s.name,
              active: isOn(id),
              className: 'dock-session',
              content: <span>{initials(s.name)}</span>,
              badge: <span className={`dot ${st}`} />,
              onClick: () => {
                const u = useUi.getState()
                const topId = u.open[u.open.length - 1]
                if (topId === id && !u.minimized.includes(id)) u.minimize(id)
                else u.focus(id)
              }
            }
          }),
          [
            ...plan.dock.map(toolItem),
            ...(showPreviewInDock(dockCtx, Object.keys(previews).length + detected)
              ? [{ id: 'preview', icon: 'globe', label: t('Browser-Vorschau'), hint: t('Deine App live ansehen – Dev-Server werden erkannt'), active: Object.keys(previews).length > 0, onClick: () => usePreview.getState().openPreview(Object.values(usePreview.getState().urls).flat()[0]) }]
              : [])
          ],
          [
            {
              id: 'notify',
              icon: 'bell',
              label: notifyUnread ? t('Mitteilungen · {n} neu', { n: notifyUnread }) : t('Mitteilungen'),
              active: notifyOpen,
              badge: notifyUnread ? <span className="dock-count">{notifyUnread > 9 ? '9+' : notifyUnread}</span> : undefined,
              onClick: () => setNotifyPanel(!notifyOpen)
            },
            { id: 'more', icon: 'more', label: t('Mehr'), hint: t('Weitere Fenster und Werkzeuge'), active: more, onClick: () => setMore((m) => !m) }
          ]
        ]}
      />
      {studio && <StatusBar />}
      <ZenBar />
      <LoungeFloaters />
      <StreamerPill onClick={() => openPanel('streamer')} />
      <CommandPalette />
      <StartCard />
      <ToastStack />
      <NotifyPanel />
      {more && <MoreMenu items={plan.more} onClose={closeMore} />}
      <WhatsNew />
      <VibeWrapped />
      <SetupPrompt />
      <Onboarding />
      <Tour />
      <InstallDialog />
      <AskToast />
      <ShareDialogs />
      <DialogHost />
      <About />
      <Curtain />
      {focusBanner && (
        <div className="focus-banner" key={focusBanner.text}>
          {focusBanner.text}
        </div>
      )}
      {holding && (
        <div className="esc-hint">
          {t('Esc gedrückt halten, um das Vollbild zu verlassen')}
          <i />
        </div>
      )}
    </div>
  )
}

/** Fortschrittsring des Fokus-Timers im Dock – tickt für sich, ohne die App neu zu rendern */
function FocusRing(): React.JSX.Element {
  const state = useFocus((s) => s.state)
  const now = useFocus((s) => s.now)
  const cfg = useSettings((s) => s.s?.focus)
  const total = cfg ? phaseTotal(state, cfg) : 0
  const left = remaining(state, now)
  return (
    <Ring progress={total ? 1 - left / total : 0} size={30} stroke={2.5} tone={toneOf(state.phase)}>
      <Icon name="timer" size={14} />
    </Ring>
  )
}
