// Fakten als Terminal-Ausgabe (wie „Safe to try“ auf der Website): Kommentarzeile, dann je Zeile ✓ + Titel + Erklärung.
// Statischer Text – nur die Form kommt aus der Maschine.

export interface Fact {
  title: string
  text: React.ReactNode
}

export function TermFacts({ head, facts, children }: { head: string; facts: Fact[]; children?: React.ReactNode }): React.JSX.Element {
  return (
    <div className="term-facts" data-testid="term-facts">
      <p className="tf-head">{head}</p>
      <ul>
        {facts.map((f) => (
          <li key={f.title}>
            <b>{f.title}</b>
            <span>{f.text}</span>
          </li>
        ))}
      </ul>
      {children}
    </div>
  )
}
