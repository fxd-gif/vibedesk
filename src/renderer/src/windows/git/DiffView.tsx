// Unified Diff mit Zeilennummern – Zeilen grün/rot, Abschnittsköpfe dezent.
import { useMemo } from 'react'
import { parseDiff } from '../../../../shared/git'

export function DiffView({ text, empty = 'Keine Änderungen.' }: { text: string; empty?: string }): React.JSX.Element {
  const files = useMemo(() => parseDiff(text), [text])
  if (!files.length || files.every((f) => !f.lines.length && !f.binary)) return <div className="panel-empty">{empty}</div>
  return (
    <div className="diff" data-testid="git-diff">
      {files.map((f, i) => (
        <section key={i}>
          {files.length > 1 && <h5 className="diff-file mono">{f.path}</h5>}
          {f.binary ? (
            <div className="diff-binary">Binärdatei – keine Textansicht</div>
          ) : (
            <table>
              <tbody>
                {f.lines.map((l, j) =>
                  l.kind === 'hunk' ? (
                    <tr key={j} className="d-hunk">
                      <td colSpan={3}>{l.text || '⋯'}</td>
                    </tr>
                  ) : (
                    <tr key={j} className={`d-${l.kind}`}>
                      <td className="d-no">{l.old ?? ''}</td>
                      <td className="d-no">{l.new ?? ''}</td>
                      <td className="d-text">
                        <span className="d-sign">{l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ' '}</span>
                        {l.text}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          )}
        </section>
      ))}
    </div>
  )
}
