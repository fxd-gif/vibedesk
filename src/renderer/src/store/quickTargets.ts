// Reihenfolge der Sessions im Schnell-Prompt – reine Logik, damit sie ohne Fenster testbar ist.

/** Sessions, oberstes Terminal zuerst (win: Fenster-ID der Session, open: offene Fenster, oberstes zuletzt) */
export function orderedTargets(
  sessions: { id: string; name: string }[],
  open: string[],
  win: (id: string) => string,
  status: (id: string) => string
): { id: string; name: string; status: string }[] {
  const rank = (id: string): number => open.lastIndexOf(win(id))
  return [...sessions].sort((a, b) => rank(b.id) - rank(a.id)).map((s) => ({ id: s.id, name: s.name, status: status(s.id) }))
}
