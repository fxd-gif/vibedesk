// Statuszeile unter dem Claude-Terminal: Modell, Kontext, Kosten, Laufzeit (aus den Token-Protokollen).
import { useEffect, useState } from 'react'
import { fmtDuration, fmtTokens, fmtUsd, modelLabel, useStats } from '../store/statsStore'
import { api } from '../api'
import { getTerminal } from '../store/terminals'

/** Doppel-Esc öffnet in Claude Code das Zurückspulen (Gespräch und Code auf einen früheren Stand) */
function rewind(id: string): void {
  api.sessions.write(id, '\x1b')
  setTimeout(() => api.sessions.write(id, '\x1b'), 120)
  getTerminal(id)?.term.focus()
}

export function TermStatus({ sessionId, startedAt }: { sessionId: string; startedAt: number }): React.JSX.Element {
  const st = useStats((s) => s.sessions[sessionId])
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  const ctx = st && st.contextWindow ? Math.min(1, st.contextUsed / st.contextWindow) : 0
  const level = ctx >= 0.85 ? 'hot' : ctx >= 0.6 ? 'warm' : ''
  return (
    <div className="term-status" data-testid="term-status">
      <span title="Modell">{st?.model ? modelLabel(st.model) : 'Modell folgt'}</span>
      {st && st.contextWindow > 0 && (
        <span className={`ts-ctx ${level}`} title={`Kontext: ${fmtTokens(st.contextUsed)} von ${fmtTokens(st.contextWindow)} Tokens`}>
          <i style={{ width: `${Math.round(ctx * 100)}%` }} />
          <b>Kontext {Math.round(ctx * 100)} %</b>
        </span>
      )}
      {st && st.costUsd > 0 && <span title={st.estimated ? 'geschätzt nach API-Preisen' : 'nach API-Preisen'}>{fmtUsd(st.costUsd)}</span>}
      <button className="ts-rewind" title="Zurückspulen: Claude zeigt seine bisherigen Schritte – wähl einen aus, um Gespräch und Code auf diesen Stand zurückzusetzen" onClick={() => rewind(sessionId)} data-testid="term-rewind">
        ↶ Zurückspulen
      </button>
      <span className="ts-time" title="Laufzeit der Session">
        {fmtDuration(now - (st?.startedAt ?? startedAt))}
      </span>
    </div>
  )
}
