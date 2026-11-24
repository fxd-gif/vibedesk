// Text für Zeichenflächen – reine Funktionen, testbar ohne DOM.

/** Zeilen wie im Terminal von Claude Code aus den letzten Werkzeug-Aufrufen einer Runde */
export function feedLines(feed: readonly { tool: string; target: string; result: string }[], max = 9): string[] {
  const out: string[] = []
  for (const f of feed.slice(-max)) {
    const target = f.target.length > 60 ? '…' + f.target.slice(-59) : f.target
    out.push(target ? `● ${f.tool}(${target})` : `● ${f.tool}`)
    if (f.result === 'ok' && /^(Bash|Write|Edit|MultiEdit)$/.test(f.tool)) out.push('  └ ✓')
  }
  return out.slice(-max)
}

/** Ast im Dateibaum wie auf der Website: ├── für alle außer dem letzten Eintrag, der bekommt └── */
export const branch = (i: number, n: number): string => (i === n - 1 ? '└── ' : '├── ')
