// Szene folgt der Tageszeit: ein leiser Farbschleier über dem Regen – kühl in der Nacht, rosig am Morgen,
// hell am Tag, orange am Abend. Sanft zwischen festen Stützpunkten überblendet.

export interface Daylight {
  /** Farbe des Schleiers */
  color: string
  /** 0..1 */
  opacity: number
}

/** Stützpunkte (Stunde, Farbe, Deckkraft) – dazwischen wird linear überblendet */
const KEYS: [number, [number, number, number], number][] = [
  [0, [11, 26, 58], 0.2],
  [4.5, [11, 26, 58], 0.2],
  [6.5, [255, 158, 107], 0.14],
  [9, [255, 246, 224], 0.06],
  [16, [255, 246, 224], 0.06],
  [18.5, [255, 138, 61], 0.15],
  [20.5, [91, 59, 140], 0.15],
  [22.5, [11, 26, 58], 0.2],
  [24, [11, 26, 58], 0.2]
]

const hex = (n: number): string => Math.round(n).toString(16).padStart(2, '0')

/** Schleier für eine Uhrzeit (Stunden als Kommazahl, 0 ≤ h < 24) */
export function daylightAt(hour: number): Daylight {
  const h = ((hour % 24) + 24) % 24
  let i = 0
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++
  const [h0, c0, o0] = KEYS[i]
  const [h1, c1, o1] = KEYS[i + 1]
  const f = h1 === h0 ? 0 : (h - h0) / (h1 - h0)
  const mix = (a: number, b: number): number => a + (b - a) * f
  return { color: `#${hex(mix(c0[0], c1[0]))}${hex(mix(c0[1], c1[1]))}${hex(mix(c0[2], c1[2]))}`, opacity: Math.round(mix(o0, o1) * 1000) / 1000 }
}

export const hourOf = (d: Date): number => d.getHours() + d.getMinutes() / 60
