// Discord-Webhook: „Session wartet auf dich“ und Tagesrückblick. Main prüft URL, Drossel und „bist du weg?“.
import { t } from '../../../shared/i18n'
import { api } from '../api'
import { redact } from '../../../shared/redact'
import { isWebhookUrl, recapEmbed, waitingEmbed } from '../../../shared/webhook'
import type { SessionStatus } from '../../../shared/types'
import { useFocus } from './focusStore'
import { useSessions } from './sessionStore'
import { useSettings } from './settingsStore'
import { modelLabel, useStats } from './statsStore'
import { useWorkflow } from './workflowStore'

/** erst melden, wenn die Session so lange wartet – kurze Rückfragen, die du gleich beantwortest, bleiben still */
const WAIT_DELAY_MS = 20_000
/** pro Session höchstens alle 5 Minuten */
const WAIT_GAP_MS = 5 * 60_000
const RECAP_RETRY_MS = 15 * 60_000
const DAY_KEY = 'vibedesk.discordDay'

export const today = (now = Date.now()): string => {
  const d = new Date(now)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const hookReady = (): boolean => isWebhookUrl(useSettings.getState().s?.discordHook.url ?? '')
const hideProjects = (): boolean => {
  const s = useSettings.getState().s
  return !!s && (s.discord.privacy || s.streamer.enabled)
}

// ---------- Tageszähler (überlebt Neustarts am selben Tag) ----------

interface DayLog {
  date: string
  projects: string[]
  done: number
  focus: number
}

function loadDay(): DayLog {
  const empty = { date: today(), projects: [], done: 0, focus: 0 }
  try {
    const d = JSON.parse(localStorage.getItem(DAY_KEY) ?? 'null') as DayLog | null
    return d && d.date === empty.date && Array.isArray(d.projects) ? d : empty
  } catch {
    return empty
  }
}

function updateDay(fn: (d: DayLog) => void): void {
  const d = loadDay()
  fn(d)
  try {
    localStorage.setItem(DAY_KEY, JSON.stringify(d))
  } catch {
    // ohne Speicher zählt der Rückblick eben nur diese Sitzung nicht mit
  }
}

// ---------- „wartet auf dich“ ----------

function sendWaiting(sessionId: string): void {
  const sessions = useSessions.getState().sessions
  const info = sessions.find((s) => s.id === sessionId)
  const wf = useWorkflow.getState().sessions[sessionId]
  if (!info || wf?.status !== 'waiting') return
  const st = useStats.getState().sessions[sessionId]
  const last = wf.feed[wf.feed.length - 1]
  const hide = hideProjects()
  const waiting = Object.values(useWorkflow.getState().sessions).filter((w) => w.status === 'waiting').length
  const body = waitingEmbed({
    project: hide ? '' : info.name,
    model: st?.model ? modelLabel(st.model) : '',
    context: st ? `${Math.round((st.contextUsed / st.contextWindow) * 100)} %` : '',
    // Befehle können Secrets enthalten – immer schwärzen, im Privatmodus ganz weglassen
    lastAction: !hide && last ? `${last.tool}${last.target ? ' · ' + redact(last.target, { emails: true }) : ''}` : '',
    waitingSessions: waiting
  })
  void api.discord.webhook('waiting', body)
}

// ---------- Tagesrückblick ----------

let recapBusy = false
let recapFailedAt = 0

export async function sendRecap(force = false): Promise<{ ok: boolean; error?: string }> {
  const s = useSettings.getState().s
  if (!s) return { ok: false }
  const days = await api.stats.history()
  const date = today()
  const last = days[days.length - 1]
  if (!last || last.date !== date) return { ok: false, error: t('Für heute gibt es noch keine Zahlen.') }
  const day = loadDay()
  const body = recapEmbed({
    today: last,
    yesterday: days[days.length - 2],
    week: days.slice(-7),
    projects: hideProjects() ? [] : day.projects,
    focusRounds: day.focus,
    sessionsDone: day.done
  })
  const r = await api.discord.webhook(force ? 'test' : 'recap', body)
  if (r.ok && !force) {
    const cur = useSettings.getState().s
    if (cur) useSettings.getState().set({ discordHook: { ...cur.discordHook, lastRecap: date } })
  }
  return r
}

async function maybeRecap(): Promise<void> {
  const hook = useSettings.getState().s?.discordHook
  const now = new Date()
  if (!hook?.recap || !hookReady() || recapBusy) return
  if (hook.lastRecap === today() || now.getHours() < hook.recapHour) return
  if (Date.now() - recapFailedAt < RECAP_RETRY_MS) return
  // ein Tag ohne Tokens braucht keinen Rückblick
  const last = useStats.getState().days.at(-1)
  if (!last || last.date !== today() || !last.tokens) return
  recapBusy = true
  try {
    const r = await sendRecap()
    if (!r.ok) recapFailedAt = Date.now()
  } finally {
    recapBusy = false
  }
}

let wired = false
export function wireWebhook(): void {
  if (wired) return
  wired = true
  const prev: Record<string, SessionStatus> = {}
  const lastSent: Record<string, number> = {}
  const timers: Record<string, ReturnType<typeof setTimeout>> = {}

  useWorkflow.subscribe((st) => {
    for (const [id, w] of Object.entries(st.sessions)) {
      const before = prev[id]
      prev[id] = w.status
      if (before === w.status) continue
      if (w.status === 'working') {
        const name = useSessions.getState().sessions.find((s) => s.id === id)?.name
        if (name) updateDay((d) => !d.projects.includes(name) && d.projects.push(name))
      }
      if (w.status === 'done') updateDay((d) => d.done++)
      clearTimeout(timers[id])
      if (w.status !== 'waiting' || !hookReady() || !useSettings.getState().s?.discordHook.onWaiting) continue
      timers[id] = setTimeout(() => {
        delete timers[id]
        if (Date.now() - (lastSent[id] ?? 0) < WAIT_GAP_MS) return
        lastSent[id] = Date.now()
        sendWaiting(id)
      }, WAIT_DELAY_MS)
    }
  })

  // abgeschlossene Fokus-Runde = Wechsel von Arbeit in eine Pause
  useFocus.subscribe((s, p) => {
    if (p.state.phase === 'work' && (s.state.phase === 'short' || s.state.phase === 'long')) updateDay((d) => d.focus++)
  })

  setTimeout(() => void maybeRecap(), 15_000)
  setInterval(() => void maybeRecap(), 60_000)
}
