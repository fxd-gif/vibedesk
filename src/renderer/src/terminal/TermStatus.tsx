// Statuszeile unter dem Claude-Terminal: Modell, Kontext, Kosten, Laufzeit (aus den Token-Protokollen).
import { useEffect, useState } from 'react'
import { fmtDuration, fmtTokens, fmtUsd, modelLabel, useStats } from '../store/statsStore'

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
      <span className="ts-time" title="Laufzeit der Session">
        {fmtDuration(now - (st?.startedAt ?? startedAt))}
      </span>
    </div>
  )
}
