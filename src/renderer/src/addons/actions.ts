// Die einzige Brücke zwischen Addons und der App.
import { BUILTIN_SCENES } from '../../../shared/addonBlocks'
import { ADDON_SCHEME } from '../../../shared/addonFormat'
import { playChime } from '../ambience/chime'
import { useFocus } from '../store/focusStore'
import { useSettings } from '../store/settingsStore'
import { useWorkflow } from '../store/workflowStore'
import { termWin, useSessions } from '../store/sessionStore'
import { ensureSession, sendToSession, waitUntilIdle } from '../store/sessionPrompt'
import { useUi } from '../store/uiStore'
import { api } from '../api'
import { useStats } from '../store/statsStore'
import { askUser } from './AskToast'
import { addonSceneValue } from './events'
import type { AddonActions } from './interpreter'

const settings = () => useSettings.getState().s
type SettingsPatch = Parameters<ReturnType<typeof useSettings.getState>['set']>[0]
const patch = (p: SettingsPatch): void => useSettings.getState().set(p)
/** Nur anzeigen, nicht auf die Platte schreiben (Zwischenschritte beim Überblenden) */
const show = (p: SettingsPatch): void => useSettings.setState((st) => (st.s ? { s: { ...st.s, ...p } } : st))
const apply = (p: SettingsPatch, transient?: boolean): void => (transient ? show(p) : patch(p))
const pct = (v: number | undefined, fallback: number): number => Math.round((v ?? fallback) * 100)
const startedAt = Date.now()
const localDay = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Session im Vordergrund, sonst die erste offene */
function topSession(): string | undefined {
  const ui = useUi.getState()
  const sessions = useSessions.getState().sessions
  for (let i = ui.open.length - 1; i >= 0; i--) {
    const s = sessions.find((x) => termWin(x.id) === ui.open[i])
    if (s) return s.id
  }
  return sessions[0]?.id
}

const alive = (id: string | undefined): id is string => !!id && useSessions.getState().sessions.some((s) => s.id === id)

export function createActions(addonId: string, addonName = 'Addon'): AddonActions {
  const assetUrl = (name: string): string => `${ADDON_SCHEME}://${addonId}/${encodeURIComponent(name)}`
  return {
    setScene: (v) => {
      if (BUILTIN_SCENES.includes(v)) patch({ scene: v })
      else if (v.startsWith('asset:')) patch({ scene: addonSceneValue(addonId, v.slice(6)) })
    },
    setRain: (v, transient) => apply({ rainIntensity: v / 100 }, transient),
    getRain: () => pct(settings()?.rainIntensity, 0.6),
    setVolume: (ch, v, transient) => apply(ch === 'music' ? { musicVolume: v / 100 } : { rainSoundVolume: v / 100 }, transient),
    getVolume: (ch) => (ch === 'music' ? pct(settings()?.musicVolume, 0.5) : pct(settings()?.rainSoundVolume, 0.35)),
    setMusicOn: (on) => patch({ musicOn: on }),
    playSound: (v) => {
      const vol = settings()?.chimeVolume ?? 0.5
      if (v === 'chime') return playChime(vol)
      if (!v.startsWith('asset:')) return
      const a = new Audio(assetUrl(v.slice(6)))
      a.volume = Math.min(1, Math.max(0, vol))
      void a.play().catch(() => undefined)
    },
    notice: (text) => useFocus.setState({ banner: { text, until: Date.now() + 5000 } }),
    focus: (cmd) => {
      const f = useFocus.getState()
      if (cmd === 'start' && f.state.phase === 'idle') f.act('start')
      if (cmd === 'stop' && f.state.phase !== 'idle') f.act('reset')
    },
    copyText: (text) => void navigator.clipboard.writeText(text).catch(() => undefined),
    ask: (text, yes, no) => askUser(addonId, addonName, text, yes, no),
    claudeStart: async (project) => {
      const want = project.trim().toLowerCase()
      if (!want) {
        const top = topSession()
        if (top) return top
      }
      const list = await api.projects.list()
      const p = want ? list.find((x) => !x.missing && x.name.toLowerCase() === want) : [...list].filter((x) => !x.missing).sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))[0]
      return p ? ensureSession(p.id) : null
    },
    claudeSend: async (session, text) => {
      const id = alive(session) ? session : topSession()
      if (!id) return null
      // Makros laufen im Hintergrund – den Fokus nicht wegnehmen
      sendToSession(id, text, false)
      return id
    },
    claudeWait: (session, timeoutMs, signal) => waitUntilIdle(session, timeoutMs, signal),
    claudeStatus: (session) => {
      const id = alive(session) ? session : topSession()
      return id ? (useWorkflow.getState().sessions[id]?.status ?? 'idle') : 'none'
    },
    query: (what) => {
      const s = settings()
      const now = new Date()
      switch (what) {
        case 'scene':
          return s?.scene ?? ''
        case 'rain':
          return pct(s?.rainIntensity, 0.6)
        case 'music_volume':
          return pct(s?.musicVolume, 0.5)
        case 'rain_volume':
          return pct(s?.rainSoundVolume, 0.35)
        case 'focus_phase': {
          const p = useFocus.getState().state.phase
          return p === 'short' || p === 'long' ? 'pause' : p === 'work' ? 'fokus' : 'aus'
        }
        case 'waiting_sessions':
          return Object.values(useWorkflow.getState().sessions).filter((x) => x.status === 'waiting').length
        case 'hour':
          return now.getHours()
        case 'minute':
          return now.getMinutes()
        case 'sessions_running':
          return useSessions.getState().sessions.length
        case 'tokens_today':
          return useStats.getState().days.find((d) => d.date === localDay(now))?.tokens ?? 0
        case 'cost_today':
          return Math.round((useStats.getState().days.find((d) => d.date === localDay(now))?.costUsd ?? 0) * 100) / 100
        case 'session_minutes': {
          const starts = Object.values(useStats.getState().sessions).map((x) => x.startedAt ?? 0).filter((t) => t > 0)
          return starts.length ? Math.floor((now.getTime() - Math.min(...starts)) / 60000) : 0
        }
        case 'weekday':
          return ((now.getDay() + 6) % 7) + 1
        case 'day':
          return now.getDate()
        case 'month':
          return now.getMonth() + 1
        case 'year':
          return now.getFullYear()
        case 'unix':
          return Math.floor(now.getTime() / 1000)
        case 'uptime_minutes':
          return Math.floor((now.getTime() - startedAt) / 60000)
      }
      return 0
    }
  }
}
