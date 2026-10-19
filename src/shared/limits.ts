// Abo-Limits von Claude Code (Pro/Max): 5-Stunden-Fenster und Woche – kommen über das Statuszeilen-JSON (`rate_limits`).

export interface LimitWindow {
  /** 0–100 */
  pct: number
  /** Zeitpunkt des Zurücksetzens in ms */
  resetsAt: number
}

export interface PlanLimits {
  fiveHour?: LimitWindow
  sevenDay?: LimitWindow
  /** wann Claude Code das zuletzt gemeldet hat (ms) */
  at: number
}

export type LimitKey = 'fiveHour' | 'sevenDay'
export const LIMIT_KEYS: LimitKey[] = ['fiveHour', 'sevenDay']

/** Ab hier warnen */
export const LIMIT_WARN = 75
export const LIMIT_HOT = 90

function window(x: unknown): LimitWindow | undefined {
  if (!x || typeof x !== 'object') return undefined
  const w = x as { used_percentage?: unknown; resets_at?: unknown }
  const pct = typeof w.used_percentage === 'number' && Number.isFinite(w.used_percentage) ? Math.min(100, Math.max(0, w.used_percentage)) : NaN
  const reset = typeof w.resets_at === 'number' && Number.isFinite(w.resets_at) && w.resets_at > 0 ? w.resets_at * 1000 : NaN
  return Number.isNaN(pct) || Number.isNaN(reset) ? undefined : { pct, resetsAt: reset }
}

/** `rate_limits` aus dem Statuszeilen-JSON → PlanLimits; null, wenn nichts Brauchbares drinsteht (z. B. API-Key statt Abo) */
export function parseRateLimits(x: unknown, now = Date.now()): PlanLimits | null {
  if (!x || typeof x !== 'object') return null
  const r = x as { five_hour?: unknown; seven_day?: unknown }
  const fiveHour = window(r.five_hour)
  const sevenDay = window(r.seven_day)
  if (!fiveHour && !sevenDay) return null
  return { ...(fiveHour ? { fiveHour } : {}), ...(sevenDay ? { sevenDay } : {}), at: now }
}

export type LimitLevel = 'ok' | 'warn' | 'hot'
export const limitLevel = (pct: number): LimitLevel => (pct >= LIMIT_HOT ? 'hot' : pct >= LIMIT_WARN ? 'warn' : 'ok')

/** Fenster, das gerade zählt: abgelaufene fallen weg */
export function liveWindow(l: PlanLimits | null, key: LimitKey, now = Date.now()): LimitWindow | undefined {
  const w = l?.[key]
  return w && w.resetsAt > now ? w : undefined
}

export interface LimitAlert {
  key: LimitKey
  kind: 'warn' | 'hot' | 'free'
  pct: number
  resetsAt: number
}

/**
 * Was soll gemeldet werden? Je Fenster und Zeitraum höchstens einmal „warn“ und einmal „hot“ – `seen` merkt sich das
 * (Schlüssel: Fenster|Reset|Stufe). „free“, wenn ein heißes Fenster (≥ 90 %) abgelaufen ist.
 */
export function limitAlerts(l: PlanLimits | null, seen: Set<string>, now = Date.now()): LimitAlert[] {
  const out: LimitAlert[] = []
  if (!l) return out
  for (const key of LIMIT_KEYS) {
    const w = l[key]
    if (!w) continue
    if (w.resetsAt <= now) {
      const id = `${key}|${w.resetsAt}|free`
      if (seen.has(`${key}|${w.resetsAt}|hot`) && !seen.has(id)) {
        seen.add(id)
        out.push({ key, kind: 'free', pct: w.pct, resetsAt: w.resetsAt })
      }
      continue
    }
    const level = limitLevel(w.pct)
    if (level === 'ok') continue
    const id = `${key}|${w.resetsAt}|${level}`
    if (seen.has(id)) continue
    seen.add(id)
    // von 0 direkt auf über 90 % → nur die heiße Meldung, die warme gilt als erledigt
    if (level === 'hot') seen.add(`${key}|${w.resetsAt}|warn`)
    out.push({ key, kind: level, pct: w.pct, resetsAt: w.resetsAt })
  }
  return out
}
