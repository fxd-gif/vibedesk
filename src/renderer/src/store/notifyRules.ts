// Wohin eine Mitteilung geht: Verlauf, Karte unten rechts, Windows-Benachrichtigung – oder erst nach der Fokus-Runde.
import type { NoticeKind, NotifySettings } from '../../../shared/types'

/** Wichtig genug, um auch in Fokus-Runden sofort zu erscheinen */
export const URGENT: ReadonlySet<NoticeKind> = new Set(['waiting', 'error', 'watch'])

export const LOG_MAX = 50

export interface RouteCtx {
  appFocused: boolean
  /** Fokus-Timer steht in einer Arbeitsphase */
  inFocus: boolean
  /** das Betroffene ist schon im Blick (z. B. Terminal liegt oben) */
  visible: boolean
}

export interface Route {
  log: boolean
  toast: boolean
  os: boolean
  /** bis nach der Fokus-Runde zurückgehalten */
  held: boolean
}

const NONE: Route = { log: false, toast: false, os: false, held: false }

export function route(kind: NoticeKind, cfg: NotifySettings, ctx: RouteCtx): Route {
  if (!cfg.kinds[kind]) return NONE
  // wer gerade hinschaut, braucht keine Meldung
  if (ctx.appFocused && ctx.visible) return NONE
  const held = cfg.focusQuiet && ctx.inFocus && !URGENT.has(kind)
  return {
    log: true,
    held,
    toast: cfg.toasts && !held,
    os: cfg.windows && !ctx.appFocused && !held
  }
}

export interface LogEntry {
  id: number
  key?: string
}

/** Neueste vorn; ein Eintrag mit gleichem key ersetzt den alten (z. B. „wartet“ derselben Session). */
export function pushLog<T extends LogEntry>(log: T[], n: T, max = LOG_MAX): T[] {
  const rest = n.key ? log.filter((x) => x.key !== n.key) : log
  return [n, ...rest].slice(0, max)
}

export function heldSummary(count: number): string {
  return count === 1 ? 'Während der Fokus-Runde kam 1 Mitteilung' : `Während der Fokus-Runde kamen ${count} Mitteilungen`
}
