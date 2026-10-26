// Erkennt in Claudes Ausgabe, dass das Nutzungslimit erreicht ist, und wann es zurückgesetzt wird.
// Beispiele: „You've hit your session limit · resets 10:30pm (Europe/Berlin)“,
// „5-hour limit reached ∙ resets 3pm“, „Claude usage limit reached. Your limit will reset at 3pm (Europe/Berlin).“
import { t } from './i18n'

// Farbcodes stecken auch mitten in Wörtern → ersatzlos weg; Cursor-Sprünge (ConPTY statt Leerzeichen) → Leerzeichen
// eslint-disable-next-line no-control-regex
const SGR = /\x1b\[[0-9;]*m/g
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g
const LIMIT = /(?:limit reached|hit your [\w-]* ?limit|usage limit)/i
const RESET = /reset(?:s| at| will reset at)?\s+(?:at\s+)?(?:([A-Z][a-z]{2,8})\s+(\d{1,2}),?\s+(?:at\s+)?)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?:\s*\(([A-Za-z_]+\/[A-Za-z_/+-]+|UTC)\))?/i
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

export const CARRY = 300

/** Text ohne Steuersequenzen; Cursor-Sprünge werden zu Leerzeichen */
export const plain = (chunk: string): string => chunk.replace(SGR, '').replace(ANSI, ' ')

/** Versatz einer Zeitzone zu UTC in Minuten zum Zeitpunkt `at` (z. B. Berlin im Sommer: 120) */
export function tzOffset(timeZone: string, at: number): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(at))
  const get = (t: string): number => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'))
  return Math.round((asUtc - Math.floor(at / 60000) * 60000) / 60000)
}

/**
 * Sucht eine Limit-Meldung samt Reset-Zeit. Liefert den Zeitpunkt (ms) – den nächsten mit dieser Uhrzeit
 * nach `now` (bzw. das genannte Datum) – oder null, wenn nichts Eindeutiges dasteht.
 */
export function findLimitReset(text: string, now: number, localZone = Intl.DateTimeFormat().resolvedOptions().timeZone): number | null {
  const at = text.search(LIMIT)
  if (at < 0) return null
  const m = RESET.exec(text.slice(at, at + 240))
  if (!m) return null
  let hour = Number(m[3])
  const minute = m[4] ? Number(m[4]) : 0
  const ampm = m[5]?.toLowerCase()
  if (!ampm && !m[4]) return null // „resets 3“ ohne am/pm oder Minuten ist zu vage
  if (hour > 23 || minute > 59 || (ampm && (hour < 1 || hour > 12))) return null
  if (ampm === 'pm' && hour < 12) hour += 12
  if (ampm === 'am' && hour === 12) hour = 0
  let zone = m[6] || localZone
  try {
    tzOffset(zone, now)
  } catch {
    zone = localZone
  }
  // Datum in der Zielzone bestimmen, dann die Uhrzeit dort in UTC umrechnen
  const off = tzOffset(zone, now)
  const zoned = new Date(now + off * 60000)
  let y = zoned.getUTCFullYear()
  let mo = zoned.getUTCMonth()
  let d = zoned.getUTCDate()
  if (m[1] && m[2]) {
    const idx = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase())
    if (idx < 0) return null
    mo = idx
    d = Number(m[2])
    if (mo < zoned.getUTCMonth() - 6) y++
  }
  const toUtc = (dayShift: number): number => {
    const guess = Date.UTC(y, mo, d + dayShift, hour, minute)
    return guess - tzOffset(zone, guess - off * 60000) * 60000
  }
  let t = toUtc(0)
  if (!m[1] && t <= now) t = toUtc(1)
  // mehr als 8 Tage in der Zukunft wäre ein Lesefehler
  return t > now - 60_000 && t - now < 8 * 24 * 3600_000 ? t : null
}

/** Wie findLimitReset, aber über Chunk-Grenzen hinweg (Ausgabe kommt stückweise) */
export function scanLimit(chunk: string, carry: string, now: number, zone?: string): { at: number | null; carry: string } {
  const text = carry + plain(chunk)
  return { at: findLimitReset(text, now, zone), carry: text.slice(-CARRY) }
}

/**
 * Limit aus dem StopFailure-Hook: Claude Code meldet `error: "rate_limit"` und als `last_assistant_message`
 * denselben Text wie im Terminal. Seit Claude Code die Session in einem Hintergrund-Dienst laufen lässt und das
 * Terminal nur eine angehängte Ansicht ist, kommt die Meldung dort nicht mehr verlässlich an.
 */
export function limitFromHook(name: string, payload: Record<string, unknown>, now: number, zone?: string): number | null {
  if (name !== 'StopFailure' || payload.error !== 'rate_limit') return null
  const text = [payload.last_assistant_message, payload.error_details].filter((x): x is string => typeof x === 'string').join('\n')
  return text ? findLimitReset(text, now, zone) : null
}

/** Wie lange nach dem Reset gewartet wird, bevor es weitergeht – die Server brauchen manchmal einen Moment */
export const RESUME_GRACE_MS = 90_000

export const resumePrompt = (): string => t('Das Nutzungslimit ist wieder frei. Mach bitte genau dort weiter, wo du aufgehört hast.')
