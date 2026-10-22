// Budget pro Projekt: Tokens oder geschätzte Kosten pro Tag bzw. Woche. Kein harter Stopp –
// VibeDesk sagt bei 75 % leise und bei 100 % deutlich Bescheid, jeweils einmal pro Zeitraum.

export type BudgetUnit = 'usd' | 'tokens'
export type BudgetPeriod = 'day' | 'week'

export interface Budget {
  amount: number
  unit: BudgetUnit
  period: BudgetPeriod
}

/** Verbrauch eines Projekts im laufenden Zeitraum */
export interface BudgetUse {
  projectId: string
  used: number
  amount: number
  unit: BudgetUnit
  period: BudgetPeriod
}

export interface BudgetAlert extends BudgetUse {
  level: 75 | 100
}

export const BUDGET_LEVELS = [75, 100] as const

export function cleanBudget(x: unknown): Budget | null {
  if (!x || typeof x !== 'object') return null
  const b = x as Record<string, unknown>
  const amount = typeof b.amount === 'number' && Number.isFinite(b.amount) ? b.amount : NaN
  const unit = b.unit === 'usd' || b.unit === 'tokens' ? b.unit : null
  const period = b.period === 'day' || b.period === 'week' ? b.period : null
  if (!(amount > 0) || !unit || !period) return null
  return { amount: Math.min(amount, unit === 'usd' ? 100_000 : 1e12), unit, period }
}

const pad = (n: number): string => String(n).padStart(2, '0')
const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Tage des Zeitraums, in dem `date` (YYYY-MM-DD) liegt – die Woche beginnt am Montag */
export function periodDays(date: string, period: BudgetPeriod): string[] {
  if (period === 'day') return [date]
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(y, m - 1, d, 12)
  const back = (day.getDay() + 6) % 7
  return Array.from({ length: back + 1 }, (_, i) => ymd(new Date(y, m - 1, d - back + i, 12)))
}

/** Kennung des Zeitraums (erster Tag) – Warnungen kommen pro Zeitraum nur einmal */
export const periodKey = (date: string, period: BudgetPeriod): string => `${period}:${periodDays(date, period)[0]}`

/** Höchste neu erreichte Stufe, null = nichts Neues */
export function crossedLevel(used: number, amount: number, already: number): 75 | 100 | null {
  const pct = (used / amount) * 100
  let hit: 75 | 100 | null = null
  for (const l of BUDGET_LEVELS) if (pct >= l && l > already) hit = l
  return hit
}
