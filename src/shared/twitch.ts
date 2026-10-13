// Twitch-Chat (anonym, nur lesen): Zuschauer schlagen mit „!vibe …“ Prompts vor.
// Nichts davon geht automatisch an Claude – der Streamer prüft und übernimmt selbst.
import { cleanText } from './shareCode'

export interface TwitchMsg {
  user: string
  display: string
  text: string
  mod: boolean
  sub: boolean
  vip: boolean
  broadcaster: boolean
}

export type IrcLine = { type: 'ping'; arg: string } | { type: 'msg'; msg: TwitchMsg } | { type: 'other'; command: string }

function parseTags(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const kv of raw.split(';')) {
    const i = kv.indexOf('=')
    if (i > 0) out[kv.slice(0, i)] = kv.slice(i + 1)
  }
  return out
}

export function parseIrcLine(line: string): IrcLine {
  let rest = line.replace(/\r?\n$/, '')
  let tags: Record<string, string> = {}
  if (rest.startsWith('@')) {
    const sp = rest.indexOf(' ')
    tags = parseTags(rest.slice(1, sp))
    rest = rest.slice(sp + 1)
  }
  let prefix = ''
  if (rest.startsWith(':')) {
    const sp = rest.indexOf(' ')
    prefix = rest.slice(1, sp)
    rest = rest.slice(sp + 1)
  }
  const sp = rest.indexOf(' ')
  const command = sp < 0 ? rest : rest.slice(0, sp)
  const params = sp < 0 ? '' : rest.slice(sp + 1)
  if (command === 'PING') return { type: 'ping', arg: params.replace(/^:/, '') }
  if (command !== 'PRIVMSG') return { type: 'other', command }
  const ci = params.indexOf(' :')
  const text = ci < 0 ? '' : params.slice(ci + 2)
  const user = prefix.split('!')[0].toLowerCase()
  const badges = tags.badges ?? ''
  return {
    type: 'msg',
    msg: {
      user,
      display: cleanText(tags['display-name'] || user, 25),
      text,
      mod: tags.mod === '1' || badges.includes('moderator/'),
      sub: tags.subscriber === '1' || badges.includes('subscriber/'),
      vip: badges.includes('vip/'),
      broadcaster: badges.includes('broadcaster/')
    }
  }
}

export const validChannel = (c: string): boolean => /^[a-z0-9_]{3,25}$/.test(c)
export const normalizeChannel = (c: string): string => c.trim().toLowerCase().replace(/^#/, '').replace(/^https?:\/\/(www\.)?twitch\.tv\//, '').split(/[/?#]/)[0]

/** „!vibe mach den Button lila“ → „mach den Button lila“ */
export function extractSuggestion(text: string, command: string): string | null {
  const cmd = command.trim().toLowerCase() || '!vibe'
  const t = text.trim()
  if (!t.toLowerCase().startsWith(cmd + ' ')) return null
  const s = cleanText(t.slice(cmd.length + 1), 300).trim()
  return s.length >= 3 ? s : null
}

export interface Suggestion {
  id: string
  text: string
  /** Wer zuerst vorgeschlagen hat (Anzeigename) */
  by: string
  voters: string[]
  ts: number
}

export interface QueueOpts {
  command: string
  modsOnly: boolean
  cooldownMs: number
  max: number
}

const norm = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/**
 * Nimmt eine Chat-Nachricht in die Vorschlagsliste auf. Gleiche Vorschläge zählen als Stimme.
 * `cooldowns` merkt sich pro Nutzer den letzten Vorschlag (wird verändert).
 */
export function addSuggestion(queue: Suggestion[], msg: TwitchMsg, now: number, opts: QueueOpts, cooldowns: Map<string, number>, id: () => string): Suggestion[] {
  if (opts.modsOnly && !(msg.mod || msg.broadcaster || msg.vip || msg.sub)) return queue
  const text = extractSuggestion(msg.text, opts.command)
  if (!text) return queue
  const last = cooldowns.get(msg.user)
  if (last !== undefined && now - last < opts.cooldownMs && !msg.broadcaster) return queue
  cooldowns.set(msg.user, now)
  const key = norm(text)
  const same = queue.find((q) => norm(q.text) === key)
  if (same) {
    if (same.voters.includes(msg.user)) return queue
    return queue.map((q) => (q === same ? { ...q, voters: [...q.voters, msg.user] } : q))
  }
  const next = [...queue, { id: id(), text, by: msg.display, voters: [msg.user], ts: now }]
  if (next.length <= opts.max) return next
  // voll: den ältesten mit den wenigsten Stimmen verwerfen
  let drop = 0
  next.forEach((q, i) => {
    const d = next[drop]
    if (q.voters.length < d.voters.length || (q.voters.length === d.voters.length && q.ts < d.ts)) drop = i
  })
  return next.filter((_, i) => i !== drop)
}

export const sortSuggestions = (q: Suggestion[]): Suggestion[] => [...q].sort((a, b) => b.voters.length - a.voters.length || a.ts - b.ts)
