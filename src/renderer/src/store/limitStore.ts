// Abo-Limits (5 Stunden / Woche) aus der Statuszeile von Claude Code – mit leisen Warnungen bei 75 und 90 %.
import { create } from 'zustand'
import { api } from '../api'
import { limitAlerts, liveWindow, type LimitAlert, type LimitWindow, type PlanLimits } from '../../../shared/limits'
import { t } from '../../../shared/i18n'
import { inform } from './notifyStore'

export const useLimits = create<{ limits: PlanLimits | null }>(() => ({ limits: null }))

const CHECK_MS = 30_000

/** „um 15:30“ oder „Do. 09:00“, wenn es nicht mehr heute ist */
export function fmtReset(ms: number, now = Date.now()): string {
  const d = new Date(ms)
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return new Date(now).toDateString() === d.toDateString() ? time : `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`
}

export const windowName = (key: LimitAlert['key']): string => (key === 'fiveHour' ? t('5-Stunden-Limit') : t('Wochenlimit'))

/** Kurztext für Tooltips: „5 Stunden: 42 % · bis 15:30 · Woche: 18 %“ */
export function limitsTitle(l: PlanLimits | null, now = Date.now()): string {
  const part = (w: LimitWindow | undefined, label: string): string | null => (w ? t('{label}: {n} % · zurück auf 0 um {time}', { label, n: Math.round(w.pct), time: fmtReset(w.resetsAt, now) }) : null)
  return [part(liveWindow(l, 'fiveHour', now), t('5 Stunden')), part(liveWindow(l, 'sevenDay', now), t('Woche'))].filter(Boolean).join('\n')
}

function show(a: LimitAlert): void {
  const name = windowName(a.key)
  if (a.kind === 'free') return inform(t('{name} ist wieder frei', { name }), t('Claude kann wieder voll loslegen.'), undefined, 'limit')
  inform(
    t('{name}: {n} % verbraucht', { name, n: Math.round(a.pct) }),
    t('Setzt sich um {time} zurück.', { time: fmtReset(a.resetsAt) }),
    undefined,
    'limit'
  )
}

let wired = false
export function wireLimits(): void {
  if (wired) return
  wired = true
  const seen = new Set<string>()
  const check = (): void => limitAlerts(useLimits.getState().limits, seen).forEach(show)
  const set = (limits: PlanLimits | null): void => {
    useLimits.setState({ limits })
    check()
  }
  void api.limits.get().then((l) => l && set(l))
  api.on.limits(set)
  // abgelaufene Fenster („wieder frei“) merkt man nur über die Uhr
  setInterval(check, CHECK_MS)
}
