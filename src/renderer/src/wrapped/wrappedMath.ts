// Rechnereien für „Vibe Wrapped“ – ohne Fenster testbar.

export function fmtActive(min: number): { big: string; unit: string } {
  if (min < 60) return { big: String(min), unit: min === 1 ? 'Minute' : 'Minuten' }
  const h = Math.floor(min / 60)
  const m = min % 60
  return { big: m ? `${h}:${String(m).padStart(2, '0')}` : String(h), unit: 'Stunden' }
}

/** Einmal pro Woche anbieten, wenn genug los war (mind. 30 aktive Minuten) */
export const WRAPPED_EVERY_MS = 7 * 24 * 3600_000
export function wrappedDue(last: number, now: number, minutes: number): boolean {
  return minutes >= 30 && now - last >= WRAPPED_EVERY_MS
}
