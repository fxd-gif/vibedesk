// Vibe-Lounge: Protokoll für den P2P-Co-Working-Raum (WebRTC, kein eigener Server).
// Alles, was von Peers kommt, ist fremd: hier wird es streng geprüft und begrenzt.
import { t } from './i18n'
import { cleanText } from './shareCode'

export const LOUNGE_APP_ID = 'vibedesk-lounge-v1'
export const MAX_PEERS = 16

export const REACTIONS = ['🔥', '👏', '🎉', '💡', '☕', '🚀'] as const
export const AVATARS = ['🦊', '🐼', '🐸', '🐙', '🦉', '🐧', '🐱', '🐶', '🦄', '🐝', '🌵', '👾'] as const

export type LoungeStatus = 'idle' | 'working' | 'waiting' | 'done' | 'error'
export type FocusPhase = 'work' | 'short' | 'long'

export type LoungePresence = {
  name: string
  emoji: string
  status: LoungeStatus
  sessions: number
  /** leer, solange der Nutzer das Projekt nicht teilen will */
  project: string
  /** Restzeit statt Uhrzeit – die Uhren der Peers laufen nicht synchron */
  focus: { phase: FocusPhase; leftMs: number } | null
  music: boolean
  streaming: boolean
}

export type LoungeChat = {
  id: string
  text: string
}

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {})
const STATUSES = new Set<LoungeStatus>(['idle', 'working', 'waiting', 'done', 'error'])
const PHASES = new Set<FocusPhase>(['work', 'short', 'long'])

export function cleanName(x: unknown): string {
  return cleanText(x, 24).trim()
}

export function cleanPresence(x: unknown): LoungePresence | null {
  const o = obj(x)
  const name = cleanName(o.name)
  if (!name) return null
  const f = obj(o.focus)
  const leftMs = typeof f.leftMs === 'number' && Number.isFinite(f.leftMs) ? Math.min(Math.max(0, f.leftMs), 4 * 3600_000) : 0
  return {
    name,
    emoji: (AVATARS as readonly string[]).includes(o.emoji as string) ? (o.emoji as string) : AVATARS[0],
    status: STATUSES.has(o.status as LoungeStatus) ? (o.status as LoungeStatus) : 'idle',
    sessions: typeof o.sessions === 'number' && Number.isFinite(o.sessions) ? Math.min(Math.max(0, Math.floor(o.sessions)), 99) : 0,
    project: cleanText(o.project, 60).trim(),
    focus: PHASES.has(f.phase as FocusPhase) ? { phase: f.phase as FocusPhase, leftMs } : null,
    music: o.music === true,
    streaming: o.streaming === true
  }
}

export function cleanChat(x: unknown): LoungeChat | null {
  const o = obj(x)
  const text = cleanText(o.text, 500).trim()
  const id = cleanText(o.id, 40)
  return text && id ? { id, text } : null
}

export function cleanReaction(x: unknown): string | null {
  const e = obj(x).emoji
  return (REACTIONS as readonly string[]).includes(e as string) ? (e as string) : null
}

export function cleanInvite(x: unknown): { minutes: number } | null {
  const m = obj(x).minutes
  return typeof m === 'number' && Number.isInteger(m) && m >= 1 && m <= 120 ? { minutes: m } : null
}

/** Einfaches Fenster-Limit pro Schlüssel (Peer + Aktion) gegen Spam. */
export class RateLimiter {
  private hits = new Map<string, number[]>()
  constructor(
    private max: number,
    private windowMs: number
  ) {}
  allow(key: string, now = Date.now()): boolean {
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs)
    if (list.length >= this.max) {
      this.hits.set(key, list)
      return false
    }
    list.push(now)
    this.hits.set(key, list)
    return true
  }
  forget(prefix: string): void {
    for (const k of this.hits.keys()) if (k.startsWith(prefix)) this.hits.delete(k)
  }
}

// Ohne leicht verwechselbare Zeichen (0/o, 1/l/i)
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

/** 12 Zeichen aus 31 → ~59 Bit: nicht zu erraten, aber noch abtippbar. */
export function newRoomCode(random: (n: number) => Uint8Array): string {
  const out: string[] = []
  while (out.length < 12) {
    for (const b of random(16)) {
      // Rejection Sampling: keine Verzerrung durch Modulo
      if (b < 248 && out.length < 12) out.push(ALPHABET[b % 31])
    }
  }
  return `${out.slice(0, 4).join('')}-${out.slice(4, 8).join('')}-${out.slice(8).join('')}`
}

export function normalizeRoomCode(s: string): string | null {
  const c = s.toLowerCase().replace(/[\s-]+/g, '')
  if (c.length !== 12 || [...c].some((ch) => !ALPHABET.includes(ch))) return null
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`
}

export function statusLabel(s: LoungeStatus): string {
  switch (s) {
    case 'idle':
      return t('chillt')
    case 'working':
      return t('Claude arbeitet')
    case 'waiting':
      return t('wartet auf Claude-Freigabe')
    case 'done':
      return t('fertig')
    case 'error':
      return t('kämpft mit einem Fehler')
  }
}
