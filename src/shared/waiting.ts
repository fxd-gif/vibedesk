// Wie lange eine Session schon wartet: „wartet · 3 min“ statt nur „wartet auf dich“ (Wunsch aus Issue #5).
// Reine Logik – Renderer, Tray (Main) und Handy-Seite zeigen dasselbe.
import { t } from './i18n'
import type { SessionStatus } from './types'

/** Dauer seit `since`: „gerade eben“, „12 min“, „1 h 5 min“ – abgerundet, damit nichts vorauseilt */
export function waitedFor(since: number, now = Date.now()): string {
  const m = Math.floor(Math.max(0, now - since) / 60_000)
  if (m < 1) return t('gerade eben')
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`
}

/** „wartet · 3 min“; ohne Zeitpunkt (z. B. alter Stand) bleibt es beim gewohnten „wartet auf dich“ */
export function waitingLabel(since: number | undefined, now = Date.now()): string {
  return since ? t('wartet · {d}', { d: waitedFor(since, now) }) : t('wartet auf dich')
}

/**
 * Zeitpunkt beim Statuswechsel fortschreiben: gesetzt, sobald die Session zu warten beginnt,
 * gehalten, solange sie wartet (weitere Notifications ändern nichts), gelöscht beim Verlassen.
 */
export function nextWaitingSince(prev: SessionStatus, next: SessionStatus, since: number | undefined, ts: number): number | undefined {
  if (next !== 'waiting') return undefined
  return prev === 'waiting' && since ? since : ts
}

/** Wartende zuerst, die am längsten wartende vorn; der Rest behält seine Reihenfolge */
export function longestWaitingFirst<T extends { status: SessionStatus; waitingSince?: number }>(list: T[]): T[] {
  const since = (x: T): number => (x.status === 'waiting' ? (x.waitingSince ?? 0) : Infinity)
  return list
    .map((x, i) => ({ x, i }))
    .sort((a, b) => since(a.x) - since(b.x) || a.i - b.i)
    .map((e) => e.x)
}
