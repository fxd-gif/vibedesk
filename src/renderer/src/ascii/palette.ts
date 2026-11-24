// Farben des Zeichenrasters kommen aus den CSS-Variablen (styles/global.css) – nichts doppelt pflegen.
// Farbe heißt Status: Bernstein wartet, Grün arbeitet, Blau ist fertig. Der Rest ist Nacht und Regen-Silber.

export interface AsciiColors {
  ink: string
  ink2: string
  ink3: string
  ink4: string
  amber: string
  green: string
  blue: string
  red: string
  violet: string
  bg: string
}

/** nur falls eine Variable fehlt (z. B. in einem iframe ohne global.css) */
const FALLBACK: AsciiColors = {
  ink: '#e3e7ef',
  ink2: '#a3abbb',
  ink3: '#6f788a',
  ink4: '#4a5263',
  amber: '#f3b94d',
  green: '#5fd497',
  blue: '#7aa7ff',
  red: '#ff8a8a',
  violet: '#b49cff',
  bg: '#0c0f18'
}

const VARS: Record<keyof AsciiColors, string> = {
  ink: '--ink',
  ink2: '--ink-2',
  ink3: '--ink-3',
  ink4: '--ink-4',
  amber: '--yellow',
  green: '--green',
  blue: '--blue',
  red: '--red',
  violet: '--purple',
  bg: '--bg'
}

let cached: AsciiColors | null = null

/** einmal gelesen und gemerkt – die Tokens ändern sich zur Laufzeit nicht */
export function asciiColors(): AsciiColors {
  if (cached) return cached
  const out = { ...FALLBACK }
  if (typeof document !== 'undefined') {
    const cs = getComputedStyle(document.documentElement)
    for (const k of Object.keys(VARS) as (keyof AsciiColors)[]) {
      const v = cs.getPropertyValue(VARS[k]).trim()
      if (v) out[k] = v
    }
  }
  cached = out
  return out
}
