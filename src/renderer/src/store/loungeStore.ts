// Vibe-Lounge: P2P-Co-Working über WebRTC (trystero). Signalisierung über öffentliche Nostr-Relays,
// verschlüsselt mit dem Raumcode – Daten fließen danach direkt zwischen den Teilnehmern.
import { create } from 'zustand'
import type { Room } from 'trystero'
import {
  AVATARS,
  cleanChat,
  cleanInvite,
  cleanPresence,
  cleanReaction,
  LOUNGE_APP_ID,
  MAX_PEERS,
  newRoomCode,
  normalizeRoomCode,
  RateLimiter,
  STATUS_LABEL,
  type LoungePresence,
  type LoungeStatus
} from '../../../shared/lounge'
import { cleanText } from '../../../shared/shareCode'
import type { SessionStatus } from '../../../shared/types'
import { useFocus } from './focusStore'
import { remaining } from './focusTimer'
import { useSessions } from './sessionStore'
import { useSettings } from './settingsStore'
import { useUi } from './uiStore'
import { useWorkflow } from './workflowStore'

export interface LoungePeer {
  id: string
  p: LoungePresence
  /** Empfangszeit der Presence – für die Fokus-Restzeit */
  at: number
}

export interface LoungeMsg {
  id: string
  kind: 'chat' | 'system'
  name: string
  emoji: string
  text: string
  ts: number
  self?: boolean
}

export interface Floater {
  id: number
  emoji: string
  name: string
  x: number
}

interface LoungeState {
  room: string | null
  state: 'off' | 'joining' | 'joined'
  peers: Record<string, LoungePeer>
  chat: LoungeMsg[]
  floaters: Floater[]
  unread: number
  invite: { name: string; minutes: number; ts: number } | null
}

export const useLounge = create<LoungeState>(() => ({ room: null, state: 'off', peers: {}, chat: [], floaters: [], unread: 0, invite: null }))

interface Wire {
  room: Room
  presence: (d: LoungePresence, target?: string) => void
  chat: (d: { id: string; text: string }) => void
  react: (d: { emoji: string }) => void
  invite: (d: { minutes: number }) => void
}

let wire: Wire | null = null
let lastSent = ''
let floaterId = 0
const limits = new RateLimiter(8, 10_000)
const reactLimits = new RateLimiter(5, 5_000)

const STATUS_RANK: SessionStatus[] = ['waiting', 'error', 'working', 'done', 'idle']

export const randomCode = (): string => newRoomCode((n) => crypto.getRandomValues(new Uint8Array(n)))

/** Eigener Name – mit Platzhalter, bis der Nutzer einen wählt. */
export function myName(): string {
  return useSettings.getState().s?.lounge.name.trim() || 'Viber'
}

/** Was andere von mir sehen: nur Status – nie Code, Dateien oder Terminal-Inhalte. */
export function buildPresence(): LoungePresence {
  const s = useSettings.getState().s
  const sessions = useSessions.getState().sessions
  const wf = useWorkflow.getState().sessions
  const statuses = sessions.map((x) => wf[x.id]?.status ?? 'idle')
  const status = (STATUS_RANK.find((r) => statuses.includes(r)) ?? 'idle') as LoungeStatus
  const focus = useFocus.getState().state
  const open = useUi.getState().open
  const topTerm = [...open].reverse().find((id) => id.startsWith('term:'))?.slice(5)
  const active = sessions.find((x) => x.id === topTerm) ?? sessions[0]
  const shareProject = !!s?.lounge.showProject && !s?.streamer.enabled
  return {
    name: myName(),
    emoji: s?.lounge.emoji || AVATARS[0],
    status,
    sessions: sessions.length,
    project: shareProject && active ? active.name.slice(0, 60) : '',
    focus: focus.phase === 'idle' ? null : { phase: focus.phase, leftMs: remaining(focus, Date.now()) },
    music: !!s?.musicOn,
    streaming: !!s?.streamer.enabled
  }
}

function pushMsg(m: Omit<LoungeMsg, 'id' | 'ts'>): void {
  const panelVisible = useUi.getState().open.includes('lounge') && !useUi.getState().minimized.includes('lounge')
  useLounge.setState((st) => ({
    chat: [...st.chat, { ...m, id: crypto.randomUUID(), ts: Date.now() }].slice(-200),
    unread: panelVisible || m.self ? st.unread : st.unread + (m.kind === 'chat' ? 1 : 0)
  }))
}

function float(emoji: string, name: string): void {
  const f: Floater = { id: ++floaterId, emoji, name, x: 10 + Math.random() * 80 }
  useLounge.setState((st) => ({ floaters: [...st.floaters, f].slice(-30) }))
  setTimeout(() => useLounge.setState((st) => ({ floaters: st.floaters.filter((x) => x.id !== f.id) })), 3200)
}

function sendPresence(force = false, target?: string): void {
  if (!wire) return
  const p = buildPresence()
  // Fokus-Restzeit ändert sich jede Sekunde – für den Vergleich ignorieren
  const key = JSON.stringify({ ...p, focus: p.focus ? p.focus.phase : null })
  if (!force && !target && key === lastSent) return
  if (!target) lastSent = key
  wire.presence(p, target)
}

export async function joinLounge(input: string): Promise<string | null> {
  const code = normalizeRoomCode(input)
  if (!code) return 'Ungültiger Raumcode – er hat 12 Zeichen, z. B. abcd-efgh-jkmn.'
  await leaveLounge()
  useLounge.setState({ room: code, state: 'joining', peers: {}, chat: [], unread: 0, invite: null })
  const { joinRoom } = await import('trystero')
  // Der Raumcode ist gleichzeitig das Passwort: Relays sehen weder Code noch Verbindungsdaten im Klartext
  const room = joinRoom({ appId: LOUNGE_APP_ID, password: code }, code)
  const presence = room.makeAction<LoungePresence>('presence')
  const chat = room.makeAction<{ id: string; text: string }>('chat')
  const react = room.makeAction<{ emoji: string }>('react')
  const invite = room.makeAction<{ minutes: number }>('focus')
  wire = {
    room,
    presence: (d, target) => void presence.send(d, target ? { target } : undefined).catch(() => {}),
    chat: (d) => void chat.send(d).catch(() => {}),
    react: (d) => void react.send(d).catch(() => {}),
    invite: (d) => void invite.send(d).catch(() => {})
  }
  const peer = (id: string): LoungePeer | undefined => useLounge.getState().peers[id]
  const known = (id: string): boolean => !!peer(id)

  room.onPeerJoin = (id) => {
    if (Object.keys(useLounge.getState().peers).length >= MAX_PEERS) return
    sendPresence(true, id)
  }
  room.onPeerLeave = (id) => {
    const p = peer(id)
    limits.forget(id)
    reactLimits.forget(id)
    if (!p) return
    useLounge.setState((st) => {
      const { [id]: _gone, ...rest } = st.peers
      return { peers: rest }
    })
    pushMsg({ kind: 'system', name: p.p.name, emoji: p.p.emoji, text: 'hat die Lounge verlassen' })
  }
  presence.onMessage = (data, { peerId }) => {
    if (!limits.allow(peerId + ':p')) return
    const p = cleanPresence(data)
    if (!p) return
    const prev = peer(peerId)
    if (!prev && Object.keys(useLounge.getState().peers).length >= MAX_PEERS) return
    useLounge.setState((st) => ({ state: 'joined', peers: { ...st.peers, [peerId]: { id: peerId, p, at: Date.now() } } }))
    if (!prev) {
      pushMsg({ kind: 'system', name: p.name, emoji: p.emoji, text: 'ist da 👋' })
      sendPresence(true, peerId)
    } else if (prev.p.status !== p.status && (p.status === 'done' || p.status === 'error') && prev.p.status === 'working') {
      pushMsg({ kind: 'system', name: p.name, emoji: p.emoji, text: p.status === 'done' ? '✓ Claude ist fertig' : STATUS_LABEL.error })
    }
  }
  chat.onMessage = (data, { peerId }) => {
    if (!known(peerId) || !limits.allow(peerId + ':c')) return
    const m = cleanChat(data)
    const p = peer(peerId)!
    if (m) pushMsg({ kind: 'chat', name: p.p.name, emoji: p.p.emoji, text: m.text })
  }
  react.onMessage = (data, { peerId }) => {
    if (!known(peerId) || !reactLimits.allow(peerId)) return
    const e = cleanReaction(data)
    if (e) float(e, peer(peerId)!.p.name)
  }
  invite.onMessage = (data, { peerId }) => {
    if (!known(peerId) || !limits.allow(peerId + ':f')) return
    const inv = cleanInvite(data)
    if (!inv) return
    const p = peer(peerId)!
    useLounge.setState({ invite: { name: p.p.name, minutes: inv.minutes, ts: Date.now() } })
    pushMsg({ kind: 'system', name: p.p.name, emoji: p.p.emoji, text: `startet eine Fokus-Runde (${inv.minutes} Min.)` })
  }

  useLounge.setState({ state: 'joined' })
  lastSent = ''
  sendPresence(true)
  const s = useSettings.getState().s
  if (s) useSettings.getState().set({ lounge: { ...s.lounge, lastRoom: code } })
  return null
}

export async function leaveLounge(): Promise<void> {
  const w = wire
  wire = null
  useLounge.setState({ room: null, state: 'off', peers: {}, invite: null })
  if (w) await w.room.leave().catch(() => {})
}

export function sendChat(text: string): void {
  const t = cleanText(text, 500, false).trim()
  if (!t || !wire) return
  wire.chat({ id: crypto.randomUUID(), text: t })
  const s = useSettings.getState().s
  pushMsg({ kind: 'chat', name: myName(), emoji: s?.lounge.emoji || AVATARS[0], text: t, self: true })
}

export function sendReaction(emoji: string): void {
  if (!wire) return
  wire.react({ emoji })
  float(emoji, myName())
}

export function inviteFocus(): void {
  const minutes = useSettings.getState().s?.focus.work ?? 25
  if (wire) wire.invite({ minutes })
  const f = useFocus.getState()
  if (f.state.phase === 'idle') f.act('start')
  const s = useSettings.getState().s
  pushMsg({ kind: 'system', name: myName(), emoji: s?.lounge.emoji || AVATARS[0], text: `startet eine Fokus-Runde (${minutes} Min.) für alle`, self: true })
}

export function acceptInvite(): void {
  const f = useFocus.getState()
  if (f.state.phase !== 'idle') f.act('reset')
  useFocus.getState().act('start')
  useLounge.setState({ invite: null })
}

let wired = false
export function wireLounge(): void {
  if (wired) return
  wired = true
  const changed = (): void => sendPresence()
  useWorkflow.subscribe(changed)
  useSessions.subscribe(changed)
  useSettings.subscribe(changed)
  useFocus.subscribe((s, p) => s.state !== p.state && sendPresence(true))
  // Herzschlag: neue Restzeiten, und wer lange nichts sendet, verschwindet
  setInterval(() => {
    sendPresence(true)
    const now = Date.now()
    const stale = Object.values(useLounge.getState().peers).filter((p) => now - p.at > 90_000)
    if (stale.length)
      useLounge.setState((st) => {
        const peers = { ...st.peers }
        stale.forEach((p) => delete peers[p.id])
        return { peers }
      })
  }, 20_000)
  // Lounge-Fenster geöffnet → gelesen
  useUi.subscribe((s) => {
    if (useLounge.getState().unread && s.open.includes('lounge') && !s.minimized.includes('lounge')) useLounge.setState({ unread: 0 })
  })
  window.addEventListener('beforeunload', () => void wire?.room.leave())
}
