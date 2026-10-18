// Wächter: erkennt, wenn eine Session hängt, in einer Fehlerschleife steckt oder der Kontext voll wird.
// Reine Logik – die Verdrahtung mit Mitteilungen steckt in watcher.ts.
import { t } from '../../../shared/i18n'
import type { SessionStatus } from '../../../shared/types'
import type { FeedEntry } from './workflowReducer'

export type WatchKind = 'stuck' | 'loop' | 'context'

/** so lange kein Hook, während Claude arbeitet → hängt vermutlich */
export const STUCK_MS = 6 * 60_000
/** läuft gerade ein Werkzeug (z. B. npm install), darf es länger dauern */
export const STUCK_TOOL_MS = 20 * 60_000
/** so oft hintereinander derselbe Fehlschlag → Schleife */
export const LOOP_N = 3
/** ab diesem Anteil des Kontextfensters warnen … */
export const CONTEXT_WARN = 0.85
/** … und erst wieder, wenn er darunter gefallen ist (z. B. nach /compact) */
export const CONTEXT_RESET = 0.6

export interface WatchInput {
  status: SessionStatus
  lastActivity: number
  feed: FeedEntry[]
  now: number
  contextUsed?: number
  contextWindow?: number
}

export interface WatchAlert {
  kind: WatchKind
  /** worauf sich die Meldung bezieht – ändert es sich, darf neu gemeldet werden */
  ref: string
  detail: string
}

const minutes = (ms: number): number => Math.round(ms / 60_000)

export function stuckAlert(i: WatchInput): WatchAlert | null {
  if (i.status !== 'working' || !i.lastActivity) return null
  const idle = i.now - i.lastActivity
  const pending = [...i.feed].reverse().find((f) => f.result === 'pending')
  const limit = pending ? STUCK_TOOL_MS : STUCK_MS
  if (idle < limit) return null
  const min = minutes(idle)
  const detail = pending
    ? t('Seit {min} Minuten läuft {tool}.', { min, tool: `${pending.tool}${pending.target ? ` (${pending.target})` : ''}` })
    : t('Seit {min} Minuten kein Lebenszeichen.', { min })
  return { kind: 'stuck', ref: String(i.lastActivity), detail }
}

export function loopAlert(i: WatchInput): WatchAlert | null {
  const settled = i.feed.filter((f) => f.result === 'ok' || f.result === 'fail')
  if (settled.length < LOOP_N) return null
  const tail = settled.slice(-LOOP_N)
  const first = tail[0]
  if (!tail.every((f) => f.result === 'fail' && f.tool === first.tool && f.target === first.target)) return null
  return {
    kind: 'loop',
    ref: String(tail[tail.length - 1].id),
    detail: first.target
      ? t('{tool} „{target}“ ist {n}-mal hintereinander fehlgeschlagen.', { tool: first.tool, target: first.target, n: LOOP_N })
      : t('{tool} ist {n}-mal hintereinander fehlgeschlagen.', { tool: first.tool, n: LOOP_N })
  }
}

export function contextRatio(i: Pick<WatchInput, 'contextUsed' | 'contextWindow'>): number {
  return i.contextUsed && i.contextWindow ? i.contextUsed / i.contextWindow : 0
}

export function contextAlert(i: WatchInput): WatchAlert | null {
  const r = contextRatio(i)
  if (r < CONTEXT_WARN) return null
  return { kind: 'context', ref: 'ctx', detail: t('Der Kontext ist zu {pct} % voll – bald vergisst Claude den Anfang.', { pct: Math.round(r * 100) }) }
}

export function watchAlerts(i: WatchInput): WatchAlert[] {
  return [stuckAlert(i), loopAlert(i), contextAlert(i)].filter((a): a is WatchAlert => !!a)
}

/**
 * Merkt sich, was schon gemeldet wurde, damit nichts doppelt kommt.
 * Liefert nur neue Meldungen; der Kontext darf erst nach dem Absinken wieder melden.
 */
export class WatchMemory {
  private seen = new Map<string, string>()

  fresh(sessionId: string, alerts: WatchAlert[], ratio: number): WatchAlert[] {
    if (ratio < CONTEXT_RESET) this.seen.delete(`${sessionId}:context`)
    const out: WatchAlert[] = []
    for (const a of alerts) {
      const k = `${sessionId}:${a.kind}`
      if (this.seen.get(k) === a.ref) continue
      this.seen.set(k, a.ref)
      out.push(a)
    }
    return out
  }

  forget(sessionId: string): void {
    for (const k of [...this.seen.keys()]) if (k.startsWith(`${sessionId}:`)) this.seen.delete(k)
  }
}
