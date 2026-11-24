// Schriftzug VIBEDESK in „ANSI Shadow“ – dieselben Zeichen wie auf der Website (home.js, LETTERS).
// Blöcke █ und Doppellinien ╔═╗║╚╝ werden im Raster gezeichnet statt gesetzt, damit sie lückenlos aneinanderstoßen.

export const LETTERS: Record<string, readonly string[]> = {
  V: ['██╗   ██╗', '██║   ██║', '██║   ██║', '╚██╗ ██╔╝', ' ╚████╔╝ ', '  ╚═══╝  '],
  I: ['██╗', '██║', '██║', '██║', '██║', '╚═╝'],
  B: ['██████╗ ', '██╔══██╗', '██████╔╝', '██╔══██╗', '██████╔╝', '╚═════╝ '],
  E: ['███████╗', '██╔════╝', '█████╗  ', '██╔══╝  ', '███████╗', '╚══════╝'],
  D: ['██████╗ ', '██╔══██╗', '██║  ██║', '██║  ██║', '██████╔╝', '╚═════╝ '],
  S: ['███████╗', '██╔════╝', '███████╗', '╚════██║', '███████║', '╚══════╝'],
  K: ['██╗  ██╗', '██║ ██╔╝', '█████╔╝ ', '██╔═██╗ ', '██║  ██╗', '╚═╝  ╚═╝']
}

export const BANNER_ROWS = 6

/** Ein Wort aus den sechs Zeilen der Buchstaben zusammensetzen – unbekannte Zeichen fallen weg */
export function banner(word: string): string[] {
  const rows = Array.from({ length: BANNER_ROWS }, () => '')
  for (const ch of word.toUpperCase()) {
    const l = LETTERS[ch]
    if (!l) continue
    l.forEach((r, i) => (rows[i] += r))
  }
  return rows
}

/** breiteste Zeile – Spaltenzahl des Schriftzugs */
export const bannerWidth = (lines: readonly string[]): number => Math.max(0, ...lines.map((l) => l.length))

/**
 * Oberkante je Spalte: in welcher Zeile ein Tropfen auf den Schriftzug trifft (rows = trifft nichts).
 * left/top: Lage des Schriftzugs im Raster.
 */
export function surfaceOf(lines: readonly string[], cols: number, rows: number, left: number, top: number): number[] {
  const surface = new Array<number>(cols).fill(rows)
  lines.forEach((l, y) => {
    for (let x = 0; x < l.length; x++) {
      const c = left + x
      if (c < 0 || c >= cols) continue
      if (l[x] !== ' ' && surface[c] === rows) surface[c] = top + y
    }
  })
  return surface
}
