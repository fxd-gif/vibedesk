import { t } from '../../../shared/i18n'
import { create } from 'zustand'
import { api } from '../api'
import { SCENES } from '../ambience/sceneParams'
import { doingText, renderPresence, streakDays, type PresenceVars, type StatusIconKey } from '../../../shared/presence'
import { MAX_PEERS } from '../../../shared/lounge'
import type { DiscordAppInfo, DiscordStatus } from '../../../shared/types'
import { fmtClock, useFocus } from './focusStore'
import { remaining } from './focusTimer'
import { useSessions } from './sessionStore'
import { useSettings } from './settingsStore'
import { fmtTokens, fmtUsd, modelLabel, useStats } from './statsStore'
import { useLounge } from './loungeStore'
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

/** FNV-1a – Party-ID für Discord, ohne den Raumcode selbst preiszugeben. */
function hashId(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return 'lounge-' + (h >>> 0).toString(16)
}

/** Sammelt alle Platzhalter-Werte aus dem aktuellen App-Zustand. */
export function collectVars(now = Date.now()): PresenceVars {
  const sessions = useSessions.getState().sessions
  const open = useUi.getState().open
  const topTerm = [...open].reverse().find((id) => id.startsWith('term:'))?.slice(5)
  const flows = useWorkflow.getState().sessions
  // die gerade arbeitende Session ist spannender als die oberste
  const active = sessions.find((s) => flows[s.id]?.status === 'working') ?? sessions.find((s) => s.id === topTerm) ?? sessions[0]
  const wf = active ? flows[active.id] : undefined
  const st = active ? useStats.getState().sessions[active.id] : undefined
  const days = useStats.getState().days
  const today = days[days.length - 1]
  const settings = useSettings.getState().s
  const focus = useFocus.getState().state
  const scene = settings?.scene ?? 'city'
  const statusKey: StatusIconKey | '' = focus.phase === 'work' ? 'focus' : focus.phase !== 'idle' ? 'break' : (wf?.status ?? '')
  const lounge = useLounge.getState()
  const pending = wf ? [...wf.feed].reverse().find((f) => f.result === 'pending') : undefined
  const todos = wf?.todos ?? []
  const current = todos.find((x) => x.status === 'in_progress')
  const task = (current?.activeForm || current?.content || '').trim()
  return {
    project: active?.name ?? '',
    sessions: sessions.length,
    status: wf ? STATUS_TEXT[wf.status] : '',
    model: st?.model ? modelLabel(st.model) : '',
    tokens: fmtTokens(today?.tokens ?? 0),
    cost: fmtUsd(today?.costUsd ?? 0),
    context: st ? `${Math.round((st.contextUsed / st.contextWindow) * 100)} %` : '',
    focus: focus.phase === 'work' ? t('Fokus-Session') : focus.phase === 'idle' ? '' : t('Pause'),
    focusLeft: focus.phase === 'idle' ? '' : fmtClock(remaining(focus, now)),
    scene: scene.startsWith('custom:') ? t('eigener Ausblick') : (SCENES.find((s) => s.id === scene)?.label ?? ''),
    music: settings?.musicOn ? (settings.musicPlayer === 'local' ? t('Eigene Musik') : t('Lofi an')) : t('Ruhe'),
    appStart: APP_START,
    sessionStart: st?.startedAt ?? null,
    focusEnd: focus.endsAt,
    statusKey,
    doing: active ? doingText({ status: wf?.status ?? 'idle', tool: pending?.tool, agents: wf?.agents.filter((x) => !x.done).length ?? 0, tending: wf?.tending }) : '',
    task: task.length > 60 ? task.slice(0, 59) + '…' : task,
    progress: todos.length ? `${todos.filter((x) => x.status === 'completed').length}/${todos.length}` : '',
    streak: streakDays(days),
    lounge: lounge.state === 'joined' && lounge.room ? { id: hashId(lounge.room), size: Object.keys(lounge.peers).length + 1, max: MAX_PEERS } : null
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
    // im Streamer-Modus nie Projektnamen an Discord geben
    const streaming = !!useSettings.getState().s?.streamer.enabled
    if (cfg.enabled) api.discord.setActivity(renderPresence(streaming ? { ...cfg, privacy: true } : cfg, collectVars()))
  }
  // Main drosselt und sendet nur bei Änderung – hier reicht ein ruhiger Takt plus Reaktion auf Zustandswechsel
  setInterval(push, 5000)
  useSettings.subscribe(push)
  useWorkflow.subscribe(push)
  useSessions.subscribe(push)
  useLounge.subscribe((s, p) => (s.state !== p.state || Object.keys(s.peers).length !== Object.keys(p.peers).length) && push())
  useFocus.subscribe((s, p) => s.state !== p.state && push())
}
