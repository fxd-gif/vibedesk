/**
 * Einfache unscharfe Suche: alle Zeichen der Eingabe müssen in Reihenfolge vorkommen.
 * Höher ist besser; null = kein Treffer. Wortanfänge und zusammenhängende Treffer zählen mehr.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase()
  if (!q) return 0
  const t = text.toLowerCase()
  const direct = t.indexOf(q)
  if (direct >= 0) return 1000 - direct * 2 + (direct === 0 || /[\s\-_/.:·]/.test(t[direct - 1]) ? 200 : 0)
  let score = 0
  let ti = 0
  let streak = 0
  for (const ch of q) {
    if (ch === ' ') continue
    const i = t.indexOf(ch, ti)
    if (i < 0) return null
    const wordStart = i === 0 || /[\s\-_/.:·]/.test(t[i - 1])
    streak = i === ti ? streak + 1 : 0
    score += 10 + streak * 5 + (wordStart ? 15 : 0) - Math.min(i - ti, 10)
    ti = i + 1
  }
  return score
}

export function rank<T>(items: T[], query: string, text: (x: T) => string): T[] {
  if (!query.trim()) return items
  return items
    .map((x, i) => ({ x, i, s: fuzzyScore(query, text(x)) }))
    .filter((r): r is { x: T; i: number; s: number } => r.s !== null)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((r) => r.x)
}
