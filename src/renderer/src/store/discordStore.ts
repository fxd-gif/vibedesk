import { create } from 'zustand'
import { api } from '../api'
import { SCENES } from '../ambience/sceneParams'
import { renderPresence, type PresenceVars } from '../../../shared/presence'
import type { DiscordAppInfo, DiscordStatus } from '../../../shared/types'
import { fmtClock, useFocus } from './focusStore'
import { remaining } from './focusTimer'
import { useSessions } from './sessionStore'
import { useSettings } from './settingsStore'
import { fmtTokens, fmtUsd, modelLabel, useStats } from './statsStore'
import { useUi } from './uiStore'
import { useWorkflow } from './workflowStore'
import { STATUS_TEXT } from '../windows/TerminalWindow'

interface DiscordState {
  status: DiscordStatus
  app: DiscordAppInfo | null
  loadApp(clientId: string): void
}

export const useDiscord = create<DiscordState>((set) => ({
  status: { state: 'off' },
  app: null,
  loadApp: (clientId) => {
    api.discord.appInfo(clientId).then((app) => set({ app }))
  }
}))

const APP_START = Date.now()

/** Sammelt alle Platzhalter-Werte aus dem aktuellen App-Zustand. */
export function collectVars(now = Date.now()): PresenceVars {
  const sessions = useSessions.getState().sessions
  const open = useUi.getState().open
  const topTerm = [...open].reverse().find((id) => id.startsWith('term:'))?.slice(5)
  const active = sessions.find((s) => s.id === topTerm) ?? sessions[0]
  const wf = active ? useWorkflow.getState().sessions[active.id] : undefined
  const st = active ? useStats.getState().sessions[active.id] : undefined
  const days = useStats.getState().days
  const today = days[days.length - 1]
  const settings = useSettings.getState().s
  const focus = useFocus.getState().state
  const scene = settings?.scene ?? 'city'
  return {
    project: active?.name ?? '',
    sessions: sessions.length,
    status: wf ? STATUS_TEXT[wf.status] : '',
    model: st?.model ? modelLabel(st.model) : '',
    tokens: fmtTokens(today?.tokens ?? 0),
    cost: fmtUsd(today?.costUsd ?? 0),
    context: st ? `${Math.round((st.contextUsed / st.contextWindow) * 100)} %` : '',
    focus: focus.phase === 'work' ? 'Fokus-Session' : focus.phase === 'idle' ? '' : 'Pause',
    focusLeft: focus.phase === 'idle' ? '' : fmtClock(remaining(focus, now)),
    scene: scene.startsWith('custom:') ? 'eigener Ausblick' : (SCENES.find((s) => s.id === scene)?.label ?? ''),
    music: settings?.musicOn ? 'Lofi an' : 'Ruhe',
    appStart: APP_START,
    sessionStart: st?.startedAt ?? null,
    focusEnd: focus.endsAt
  }
}

let wired = false
export function wireDiscord(): void {
  if (wired) return
  wired = true
  api.discord.status().then((status) => useDiscord.setState({ status }))
  api.on.discordStatus((status) => useDiscord.setState({ status }))
  let lastCfg = ''
  const push = (): void => {
    const cfg = useSettings.getState().s?.discord
    if (!cfg) return
    const key = `${cfg.enabled}|${cfg.clientId}`
    if (key !== lastCfg) {
      lastCfg = key
      api.discord.configure(cfg.enabled, cfg.clientId)
    }
    if (cfg.enabled) api.discord.setActivity(renderPresence(cfg, collectVars()))
  }
  // Main drosselt und sendet nur bei Änderung – hier reicht ein ruhiger Takt plus Reaktion auf Zustandswechsel
  setInterval(push, 5000)
  useSettings.subscribe(push)
  useWorkflow.subscribe(push)
  useSessions.subscribe(push)
  useFocus.subscribe((s, p) => s.state !== p.state && push())
}
