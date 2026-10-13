// Die einzige Brücke zwischen Addons und der App.
import { BUILTIN_SCENES } from '../../../shared/addonBlocks'
import { ADDON_SCHEME } from '../../../shared/addonFormat'
import { playChime } from '../ambience/chime'
import { useFocus } from '../store/focusStore'
import { useSettings } from '../store/settingsStore'
import { useWorkflow } from '../store/workflowStore'
import { addonSceneValue } from './events'
import type { AddonActions } from './interpreter'

const settings = () => useSettings.getState().s
const patch = (p: Parameters<ReturnType<typeof useSettings.getState>['set']>[0]): void => useSettings.getState().set(p)
const pct = (v: number | undefined, fallback: number): number => Math.round((v ?? fallback) * 100)

export function createActions(addonId: string): AddonActions {
  const assetUrl = (name: string): string => `${ADDON_SCHEME}://${addonId}/${encodeURIComponent(name)}`
  return {
    setScene: (v) => {
      if (BUILTIN_SCENES.includes(v)) patch({ scene: v })
      else if (v.startsWith('asset:')) patch({ scene: addonSceneValue(addonId, v.slice(6)) })
    },
    setRain: (v) => patch({ rainIntensity: v / 100 }),
    getRain: () => pct(settings()?.rainIntensity, 0.6),
    setVolume: (ch, v) => patch(ch === 'music' ? { musicVolume: v / 100 } : { rainSoundVolume: v / 100 }),
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
      }
      return 0
    }
  }
}
