// Lade- und Wartezustände in Zeichen (DESIGN.md 11.3 Nr. 7): Fortschritt als [####----], Spinner aus · : ¦ |.
// Reine Funktionen – die Anzeige liegt in Spinner.tsx.

/** Zeichen des Spinners, eins nach dem anderen – wie ein Tropfen, der dichter wird */
export const SPINNER_FRAMES = ['·', ':', '¦', '|'] as const

/** Fortschritt 0…1 als Balken aus Zeichen: asciiBar(0.5, 8) → „[####----]“ */
export function asciiBar(value: number, width = 8): string {
  const w = Math.max(1, Math.round(width))
  const v = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
  // ab dem ersten Prozent ein Zeichen, voll erst bei 100 %
  const n = v >= 1 ? w : v <= 0 ? 0 : Math.min(w - 1, Math.max(1, Math.round(v * w)))
  return '[' + '#'.repeat(n) + '-'.repeat(w - n) + ']'
}

/** Prozent für die Anzeige neben dem Balken, immer gleich breit („ 7 %“, „42 %“) */
export function asciiPercent(value: number): string {
  const v = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
  return String(Math.round(v * 100)).padStart(3, ' ') + ' %'
}
