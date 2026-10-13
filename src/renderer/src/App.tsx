import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { centeredRect, useUi } from './store/uiStore'
import { GlassWindow } from './desktop/GlassWindow'
import { DialogHost } from './desktop/Dialog'
import { Dock, type DockItem } from './desktop/Dock'
import { migratePanels, PANELS, PANEL_IDS, panelDef } from './windows/panels'
import { checkWhatsNew, WhatsNew } from './changelog/WhatsNew'
import { checkSetupOnStart, SetupPrompt, wireSetup } from './windows/ToolSetup'
import { CommandPalette, usePalette, wirePalette } from './windows/palette/CommandPalette'
import type { PanelId } from '../../shared/types'
import './desktop/desktop.css'
import './desktop/social.css'
import { kindOf, termWin, useSessions, wireSessions } from './store/sessionStore'
import { useWorkflow, wireWorkflow } from './store/workflowStore'
import { wireStats } from './store/statsStore'
import { wireChime } from './ambience/chime'
import { usePreview, wirePreview } from './store/previewStore'
import { PreviewWindow } from './windows/PreviewWindow'
import { TerminalWindow } from './windows/TerminalWindow'
import { RainCanvas } from './ambience/RainCanvas'
import { useSettings } from './store/settingsStore'
import { ambienceAudio } from './ambience/audio'
import { isMuted } from './ambience/toggles'
import { AmbienceMenu } from './windows/AmbienceMenu'
import { fmtClock, useFocus, wireFocus } from './store/focusStore'
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
import { StartCard } from './desktop/StartCard'
import { MoreMenu } from './desktop/MoreMenu'
import { dockPlan, showPreviewInDock } from './desktop/dockPlan'
import { useAddons } from './store/addonStore'
import { wireBrainNudge } from './store/brainNudge'
import { TEND_PROMPT } from './windows/brain/BrainWindow'


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
  const settings = useSettings((s) => s.s)
  const previews = usePreview((s) => s.open)
  const focus = useFocus()
  const [menu, setMenu] = useState(false)
  const paletteOpen = usePalette((s) => s.open)
  const openAmbience = useCallback(() => setMenu(true), [])
  const [audioState, setAudioState] = useState({ musicOffline: false, musicPlaying: false })

  useEffect(() => ambienceAudio.onState(setAudioState), [])
  useEffect(() => {
    if (settings) ambienceAudio.setMusic(settings.musicOn, settings.musicVolume, settings.streamUrl)
  }, [settings?.musicOn, settings?.musicVolume, settings?.streamUrl])
  useEffect(() => {
    if (settings) ambienceAudio.setRain(settings.rainSoundOn, settings.rainSoundVolume, settings.rainIntensity)
  }, [settings?.rainSoundOn, settings?.rainSoundVolume, settings?.rainIntensity])
  const statuses = useWorkflow((s) => s.sessions)
  const loungeState = useLounge((s) => s.state)
  const loungePeers = useLounge((s) => Object.keys(s.peers).length)
  const loungeUnread = useLounge((s) => s.unread)
  const notifyUnread = useNotify((s) => s.unread)
  const notifyOpen = useNotify((s) => s.panel)
  const addonCount = useAddons((s) => s.list.length)
  const [more, setMore] = useState(false)
  const closeMore = useCallback(() => setMore(false), [])

  useEffect(() => {
    wireWorkflow()
    wireSessions()
    wireStats()
    wireChime()
    wirePreview()
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
    wireBrainNudge(TEND_PROMPT)
    useSettings.getState().load().then((s) => {
      const ui = useUi.getState()
      ui.initRects(s.windowRects)
      const migrated = migratePanels(s.visiblePanels)
      // ohne gemerkte Fenster begrüßt die Startkarte
      migrated.forEach((id) => {
        const def = panelDef(id)
        if (def) ui.openWin(id, centeredRect(def.w, def.h))
      })
      setReady(true)
      startAddonRuntime()
      // per Doppelklick geöffnete .vibeaddon-Datei
      void api.addons.takePending().then((p) => {
        if (p) void openInstallDialog(p)
      })
      checkWhatsNew()
      if (s.onboarded) checkSetupOnStart()
    })
  }, [])

  // Fensterpositionen + sichtbare Panels persistieren (debounced)
  useEffect(() => {
    if (!ready) return
    return useUi.subscribe((s) => {
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        const rects = Object.fromEntries(Object.entries(s.rects).filter(([id]) => !id.startsWith('term:')))
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
    all: !!settings?.dockAll,
    sessions: sessions.length,
    addons: addonCount,
    loungeOn: loungeState !== 'off',
    isOpen: (id: PanelId) => open.includes(id)
  }
  const plan = dockPlan(dockCtx)
  const toolItem = (id: PanelId): DockItem => {
    if (id === 'editor') return { ...panelItem('editor'), onClick: () => void toggleEditor() }
    if (id === 'lounge')
      return {
        ...panelItem('lounge'),
        label: loungeState === 'off' ? 'Vibe-Lounge' : `Vibe-Lounge · ${loungePeers + 1} online${loungeUnread ? ` · ${loungeUnread} neu` : ''}`,
        badge: loungeUnread ? <span className="dock-count">{loungeUnread > 9 ? '9+' : loungeUnread}</span> : loungeState !== 'off' ? <span className="dot done" /> : undefined
      }
    return panelItem(id)
  }

  return (
    <div className="app">
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
      {Object.keys(previews).map((k) => (
        <PreviewWindow key={k} id={k} />
      ))}
      <Dock
        groups={[
          [
            { id: 'palette', icon: 'command', label: 'Befehle (Strg+K)', hint: 'Alles per Suche: Fenster, Projekte, Aktionen', active: paletteOpen, onClick: () => usePalette.getState().show(!paletteOpen) },
            panelItem('projects')
          ],
          [
            {
              id: 'ambience',
              icon: 'rain',
              label: settings?.musicOn && audioState.musicOffline ? 'Atmosphäre · Lofi-Radio offline' : 'Atmosphäre & Musik',
              hint: 'Szene, Regen und Lofi-Radio',
              active: menu,
              className: settings?.musicOn && audioState.musicOffline ? 'offline' : undefined,
              badge: settings?.musicOn && !isMuted(settings.musicVolume) && !audioState.musicOffline ? <span className="dock-eq" aria-hidden><i /><i /><i /></span> : undefined,
              onClick: () => setMenu((m) => !m)
            },
            (() => {
              const s = focus.state
              const total = settings ? phaseTotal(s, settings.focus) : 0
              const left = remaining(s, focus.now)
              const def = panelDef('focus')!
              return {
                id: 'focus',
                label: s.phase === 'idle' ? 'Fokus-Timer' : `${s.phase === 'work' ? 'Fokus' : 'Pause'} · noch ${fmtClock(left)}`,
                active: isOn('focus'),
                onClick: () => ui.toggleWin('focus', centeredRect(def.w, def.h)),
                content: (
                  <Ring progress={total ? 1 - left / total : 0} size={30} stroke={2.5} tone={toneOf(s.phase)}>
                    <Icon name="timer" size={14} />
                  </Ring>
                )
              }
            })()
          ],
          sessions.map((s) => {
            const id = termWin(s.id)
            const st = statuses[s.id]?.status ?? 'idle'
            return {
              id: 'sess-' + s.name,
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
            ...(showPreviewInDock(dockCtx, Object.keys(previews).length)
              ? [{ id: 'preview', icon: 'globe', label: 'Browser-Vorschau', hint: 'Deine App live ansehen – Dev-Server werden erkannt', active: Object.keys(previews).length > 0, onClick: () => usePreview.getState().openPreview(Object.values(usePreview.getState().urls).flat()[0]) }]
              : [])
          ],
          [
            {
              id: 'notify',
              icon: 'bell',
              label: notifyUnread ? `Mitteilungen · ${notifyUnread} neu` : 'Mitteilungen',
              active: notifyOpen,
              badge: notifyUnread ? <span className="dock-count">{notifyUnread > 9 ? '9+' : notifyUnread}</span> : undefined,
              onClick: () => setNotifyPanel(!notifyOpen)
            },
            { id: 'more', icon: 'more', label: 'Mehr', hint: 'Weitere Fenster und Werkzeuge', active: more, onClick: () => setMore((m) => !m) }
          ]
        ]}
      />
      <LoungeFloaters />
      <StreamerPill onClick={() => openPanel('streamer')} />
      <CommandPalette onAmbience={openAmbience} />
      {menu && <AmbienceMenu offline={audioState.musicOffline} onClose={() => setMenu(false)} />}
      <StartCard />
      <ToastStack />
      <NotifyPanel />
      {more && <MoreMenu items={plan.more} onClose={closeMore} />}
      <WhatsNew />
      <SetupPrompt />
      <Onboarding />
      <InstallDialog />
      <AskToast />
      <ShareDialogs />
      <DialogHost />
      <Curtain />
      {focus.banner && (
        <div className="focus-banner" key={focus.banner.text}>
          {focus.banner.text}
        </div>
      )}
      {holding && (
        <div className="esc-hint">
          Esc gedrückt halten, um das Vollbild zu verlassen
          <i />
        </div>
      )}
    </div>
  )
}
