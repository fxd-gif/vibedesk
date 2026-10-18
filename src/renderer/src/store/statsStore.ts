import { locale, t } from '../../../shared/i18n'
import { create } from 'zustand'
import { api } from '../api'
import type { DayStats, SessionStats } from '../../../shared/types'

interface StatsState {
  sessions: Record<string, SessionStats>
  days: DayStats[]
  refreshDays(): void
}

export const useStats = create<StatsState>((set) => ({
  sessions: {},
  days: [],
  refreshDays: () => {
    api.stats.history().then((days) => set({ days }))
  }
}))

let wired = false
let dayTimer: ReturnType<typeof setTimeout> | undefined
export function wireStats(): void {
  if (wired) return
  wired = true
  useStats.getState().refreshDays()
  api.on.stats((s) => {
    useStats.setState((st) => ({ sessions: { ...st.sessions, [s.sessionId]: s } }))
    clearTimeout(dayTimer)
    dayTimer = setTimeout(() => useStats.getState().refreshDays(), 1500)
  })
}

export function fmtTokens(n: number): string {
  const dec = locale() === 'de-DE' ? ',' : '.'
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace('.', dec) + ' M'
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace('.', dec) + ' k'
  return String(n)
}

export function fmtUsd(n: number): string {
  return n < 0.01 && n > 0 ? t('< 0,01 $') : t('{amount} $', { amount: n.toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })
}

export function fmtDuration(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000))
  return m < 60 ? t('{m} Min.', { m }) : t('{h} Std. {m} Min.', { h: Math.floor(m / 60), m: m % 60 })
}

export function modelLabel(model: string | null): string {
  if (!model) return '–'
  const m = /claude-(\w+)-(\d+)(?:-(\d+))?/.exec(model)
  if (!m) return model
  return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? '.' + m[3] : ''}${model.includes('[1m]') ? ' (1M)' : ''}`
}
