// Streamer-Modus: schwärzt Secrets und Pfade, speist das OBS-Overlay und liest Twitch-Chat-Vorschläge.
import { create } from 'zustand'
import { api } from '../api'
import { createStreamRedactor, redact } from '../../../shared/redact'
import type { OverlayState } from '../../../shared/overlay'
import { addSuggestion, normalizeChannel, parseIrcLine, sortSuggestions, validChannel, type Suggestion } from '../../../shared/twitch'
import { bracketedPaste } from '../../../shared/paste'
import type { OverlayStatus, StreamerSettings } from '../../../shared/types'
import { useFocus } from './focusStore'
import { remaining } from './focusTimer'
import { useLounge } from './loungeStore'
import { termWin, useSessions } from './sessionStore'
import { useSettings } from './settingsStore'
import { fmtTokens, fmtUsd, modelLabel, useStats } from './statsStore'
import { setOutputTransform } from './terminals'
import { useUi } from './uiStore'
import { useWorkflow } from './workflowStore'
import { STATUS_TEXT } from '../windows/TerminalWindow'

type TwitchState = { state: 'off' } | { state: 'connecting' } | { state: 'connected'; channel: string } | { state: 'error'; message: string }

interface StreamerState {
  overlay: OverlayStatus
  user: string
  curtain: boolean
  twitch: TwitchState
  queue: Suggestion[]
  shoutout: { by: string; text: string; ts: number } | null
}

export const useStreamer = create<StreamerState>(() => ({
  overlay: { running: false },
  user: '',
  curtain: false,
  twitch: { state: 'off' },
  queue: [],
  shoutout: null
}))

const cfg = (): StreamerSettings | undefined => useSettings.getState().s?.streamer

export const streamerOn = (): boolean => !!cfg()?.enabled

/** Schwärzt Text, solange der Streamer-Modus läuft (Secrets immer, Pfade/E-Mails je nach Einstellung). */
export function redactText(s: string): string {
  const c = cfg()
  if (!c?.enabled || !s) return s
  return redact(s, { user: c.hidePaths ? useStreamer.getState().user : undefined, emails: c.maskEmails })
}

/** Hook-Variante: rendert neu, wenn sich der Modus ändert. */
export function useRedact(): (s: string) => string {
  useSettings((x) => x.s?.streamer)
  useStreamer((x) => x.user)
  return redactText
}

export function newOverlayToken(): string {
  return [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function toggleCurtain(v = !useStreamer.getState().curtain): void {
  useStreamer.setState({ curtain: v })
}

// ---------- Terminal-Ausgabe schwärzen ----------

const redactors = new Map<string, ReturnType<typeof createStreamRedactor>>()

function applyTerminalFilter(on: boolean): void {
  if (!on) {
    redactors.forEach((r) => r.flush())
    redactors.clear()
    setOutputTransform(null)
    return
  }
  setOutputTransform((id, data, write) => {
    let r = redactors.get(id)
    if (!r) {
      r = createStreamRedactor(redactText, write)
      redactors.set(id, r)
    }
    r.push(data)
  })
}

// ---------- Overlay ----------

const shortTarget = (t: string): string => (t.length > 60 ? '…' + t.slice(-59) : t)

export function buildOverlay(): OverlayState {
  const c = cfg()
  const sessions = useSessions.getState().sessions
  const wf = useWorkflow.getState().sessions
  const open = useUi.getState().open
  const topTerm = [...open].reverse().find((id) => id.startsWith('term:'))?.slice(5)
  // die gerade arbeitende Session ist spannender als die oberste
  const active = sessions.find((s) => wf[s.id]?.status === 'working') ?? sessions.find((s) => s.id === topTerm) ?? sessions[0]
  const w = active ? wf[active.id] : undefined
  const st = active ? useStats.getState().sessions[active.id] : undefined
  const days = useStats.getState().days
  const today = days[days.length - 1]
  const focus = useFocus.getState().state
  const target = (tool: string, t: string): string => (tool === 'Bash' && !c?.overlayBash ? '' : shortTarget(redactText(t)))
  const feed = (w?.feed ?? []).slice(-5).reverse()
  const pending = [...(w?.feed ?? [])].reverse().find((f) => f.result === 'pending')
  const { shoutout, queue } = useStreamer.getState()
  return {
    status: active ? (w?.status ?? 'idle') : 'none',
    statusText: active ? `Claude ${w?.status === 'working' ? 'arbeitet' : STATUS_TEXT[w?.status ?? 'idle']}` : 'Gleich geht’s los',
    project: active ? redactText(active.name) : '',
    current: pending ? `${pending.tool}${target(pending.tool, pending.target) ? ' · ' + target(pending.tool, pending.target) : ''}` : '',
    feed: feed.map((f) => ({ tool: f.tool, target: target(f.tool, f.target), result: f.result })),
    todos: (w?.todos ?? []).slice(0, 30).map((t) => ({ content: redactText(t.content).slice(0, 120), status: t.status })),
    focus: focus.phase === 'idle' ? null : { phase: focus.phase, leftMs: remaining(focus, Date.now()) },
    sessionStart: st?.startedAt ?? null,
    model: st?.model ? modelLabel(st.model) : '',
    tokens: today ? fmtTokens(today.tokens) : '',
    cost: c?.overlayCost && today ? fmtUsd(today.costUsd) : '',
    shoutout,
    suggestions: queue.length,
    lounge: Object.keys(useLounge.getState().peers).length
  }
}

let pushTimer: ReturnType<typeof setTimeout> | undefined
function schedulePush(): void {
  if (!streamerOn() || pushTimer) return
  pushTimer = setTimeout(() => {
    pushTimer = undefined
    if (streamerOn()) api.streamer.push(buildOverlay())
  }, 300)
}

// ---------- Twitch-Chat (anonym, nur lesen) ----------

let ws: WebSocket | null = null
let wsChannel = ''
let retry: ReturnType<typeof setTimeout> | undefined
let backoff = 2000
const cooldowns = new Map<string, number>()

function closeTwitch(): void {
  clearTimeout(retry)
  wsChannel = ''
  if (ws) {
    ws.onclose = null
    ws.close()
  }
  ws = null
  useStreamer.setState({ twitch: { state: 'off' } })
}

function connectTwitch(channel: string): void {
  closeTwitch()
  wsChannel = channel
  useStreamer.setState({ twitch: { state: 'connecting' } })
  const sock = new WebSocket('wss://irc-ws.chat.twitch.tv:443')
  ws = sock
  sock.onopen = () => {
    sock.send('CAP REQ :twitch.tv/tags')
    sock.send('PASS SCHMOOPIIE')
    sock.send(`NICK justinfan${10000 + Math.floor(Math.random() * 80000)}`)
    sock.send(`JOIN #${channel}`)
  }
  sock.onmessage = (ev) => {
    for (const line of String(ev.data).split('\r\n')) {
      if (!line) continue
      const r = parseIrcLine(line)
      if (r.type === 'ping') sock.send(`PONG :${r.arg}`)
      else if (r.type === 'other' && (r.command === 'JOIN' || r.command === '366')) {
        backoff = 2000
        useStreamer.setState({ twitch: { state: 'connected', channel } })
      } else if (r.type === 'msg') {
        const c = cfg()
        if (!c) continue
        const q = addSuggestion(useStreamer.getState().queue, r.msg, Date.now(), { command: c.chatCommand, modsOnly: c.chatModsOnly, cooldownMs: 60_000, max: 30 }, cooldowns, () => crypto.randomUUID())
        if (q !== useStreamer.getState().queue) useStreamer.setState({ queue: q })
      }
    }
  }
  sock.onclose = () => {
    if (ws !== sock || wsChannel !== channel) return
    useStreamer.setState({ twitch: { state: 'error', message: 'Verbindung getrennt – neuer Versuch …' } })
    retry = setTimeout(() => wsChannel === channel && connectTwitch(channel), backoff)
    backoff = Math.min(backoff * 2, 60_000)
  }
}

function syncTwitch(): void {
  const c = cfg()
  const ch = c?.enabled ? normalizeChannel(c.twitchChannel) : ''
  if (!ch || !validChannel(ch)) {
    if (wsChannel) closeTwitch()
    return
  }
  if (ch !== wsChannel) connectTwitch(ch)
}

/** Übernimmt einen Chat-Vorschlag ins aktive Terminal – nur eingefügt, abschicken macht der Streamer selbst. */
export function acceptSuggestion(s: Suggestion): boolean {
  const sessions = useSessions.getState().sessions
  const open = useUi.getState().open
  const top = [...open].reverse().find((id) => id.startsWith('term:'))?.slice(5) ?? sessions[0]?.id
  if (!top) return false
  api.sessions.write(top, bracketedPaste(s.text))
  useUi.getState().focus(termWin(top))
  useStreamer.setState((st) => ({ queue: st.queue.filter((q) => q.id !== s.id), shoutout: { by: s.by, text: redactText(s.text).slice(0, 140), ts: Date.now() } }))
  schedulePush()
  return true
}

export function dropSuggestion(id: string): void {
  useStreamer.setState((st) => ({ queue: st.queue.filter((q) => q.id !== id) }))
}

export const sortedQueue = sortSuggestions

// ---------- Verdrahtung ----------

let wired = false
let lastKey = ''
export function wireStreamer(): void {
  if (wired) return
  wired = true
  api.streamer.user().then((user) => useStreamer.setState({ user }))

  const sync = async (): Promise<void> => {
    const c = cfg()
    if (!c) return
    if (!c.overlayToken) {
      useSettings.getState().set({ streamer: { ...c, overlayToken: newOverlayToken() } })
      return
    }
    applyTerminalFilter(c.enabled)
    syncTwitch()
    const key = `${c.enabled}|${c.overlayPort}`
    if (key === lastKey) return
    lastKey = key
    useStreamer.setState({ overlay: await api.streamer.configure(c.enabled, c.overlayPort) })
    schedulePush()
  }
  useSettings.subscribe(() => void sync())
  void sync()

  useWorkflow.subscribe(schedulePush)
  useSessions.subscribe(schedulePush)
  useStats.subscribe(schedulePush)
  useLounge.subscribe((s, p) => s.peers !== p.peers && schedulePush())
  useFocus.subscribe((s, p) => s.state !== p.state && schedulePush())
  useStreamer.subscribe((s, p) => s.queue !== p.queue && schedulePush())
  setInterval(schedulePush, 5000)

  // Strg+Umschalt+H: Vorhang – verdeckt sofort alles (auch als „Gleich zurück“-Bildschirm)
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'h') {
        e.preventDefault()
        e.stopPropagation()
        toggleCurtain()
      }
    },
    true
  )
}
