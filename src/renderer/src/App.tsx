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
import { wireUpdate } from './store/updateStore'
import { UpdateToast } from './desktop/UpdateToast'
import { Onboarding } from './windows/Onboarding'
import { EDITOR_ID, toggleEditor, wireEditor } from './store/editorStore'
import { startAddonRuntime } from './addons/runtime'


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

  useEffect(() => {
    wireWorkflow()
    wireSessions()
    wireStats()
    wireChime()
    wirePreview()
    wireFocus()
    wireDiscord()
    wireUpdate()
    wireEditor()
    wirePalette()
    wireSetup()
    useSettings.getState().load().then((s) => {
      const ui = useUi.getState()
      ui.initRects(s.windowRects)
      const migrated = migratePanels(s.visiblePanels)
      const panels = migrated.length ? migrated : (['projects'] as PanelId[])
      panels.forEach((id) => {
        const def = panelDef(id)
        if (def) ui.openWin(id, centeredRect(def.w, def.h))
      })
      setReady(true)
      startAddonRuntime()
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
    return { id, icon: def.icon, label: def.title, active: isOn(id), onClick: () => ui.toggleWin(id, centeredRect(def.w, def.h)) }
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
            { id: 'palette', icon: 'command', label: 'Befehle (Strg+K)', active: paletteOpen, onClick: () => usePalette.getState().show(!paletteOpen) },
            panelItem('projects')
          ],
          [
            {
              id: 'ambience',
              icon: 'rain',
              label: settings?.musicOn && audioState.musicOffline ? 'Atmosphäre · Lofi-Radio offline' : 'Atmosphäre & Musik',
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
            panelItem('inspector'),
            { ...panelItem('editor'), onClick: () => void toggleEditor() },
            { id: 'preview', icon: 'globe', label: 'Browser-Vorschau', active: Object.keys(previews).length > 0, onClick: () => usePreview.getState().openPreview(Object.values(usePreview.getState().urls).flat()[0]) }
          ]
        ]}
      />
      <CommandPalette onAmbience={openAmbience} />
      {menu && <AmbienceMenu offline={audioState.musicOffline} onClose={() => setMenu(false)} />}
      <UpdateToast />
      <WhatsNew />
      <SetupPrompt />
      <Onboarding />
      <DialogHost />
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
