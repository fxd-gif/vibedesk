import { useEffect, useState } from 'react'
import { useSessions } from '../store/sessionStore'
import { fmtDuration, fmtTokens, fmtUsd, modelLabel, useStats } from '../store/statsStore'
import { useWorkflow } from '../store/workflowStore'

const level = (p: number): string => (p >= 0.95 ? 'crit' : p >= 0.8 ? 'warn' : 'ok')

export function StatsPanel(): React.JSX.Element {
  const sessions = useSessions((s) => s.sessions)
  const stats = useStats((s) => s.sessions)
  const days = useStats((s) => s.days)
  const wf = useWorkflow((s) => s.sessions)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  const today = days[days.length - 1]
  const maxDay = Math.max(1, ...days.map((d) => d.tokens))

  return (
    <div className="panel stats">
      <section className="stats-today">
        <div>
          <div className="dim small">Heute</div>
          <div className="big">{fmtTokens(today?.tokens ?? 0)}</div>
          <div className="dim small">Tokens · {fmtUsd(today?.costUsd ?? 0)} ≈ · {fmtTokens(today?.cacheRead ?? 0)} aus Cache</div>
        </div>
        <div className="spark" title="Letzte 7 Tage">
          {days.map((d) => (
            <i key={d.date} style={{ height: `${Math.max(4, (d.tokens / maxDay) * 100)}%` }} title={`${d.date}: ${fmtTokens(d.tokens)} · ${fmtUsd(d.costUsd)}`} />
          ))}
        </div>
      </section>

      {!sessions.length && <div className="panel-empty">Starte eine Session – Tokens, Context und Kosten erscheinen hier live.</div>}

      {sessions.map((s) => {
        const st = stats[s.id]
        const pct = st ? st.contextUsed / st.contextWindow : 0
        const t = st?.total
        const inputAll = t ? t.input + t.cacheRead + t.cacheWrite5m + t.cacheWrite1h : 0
        const hit = t && inputAll ? t.cacheRead / inputAll : 0
        return (
          <section key={s.id} className="stat-card" data-testid={`stats-${s.name}`}>
            <div className="row">
              <b>{s.name}</b>
              <span className="dim">· {modelLabel(st?.model ?? null)}</span>
              <span className="dim" style={{ marginLeft: 'auto' }}>
                {st?.startedAt ? fmtDuration(now - st.startedAt) : ''}
              </span>
            </div>
            <div className="ctx">
              <div className="row between small">
                <span>Context</span>
                <span className={`ctx-num ${level(pct)}`}>
                  {st ? `${fmtTokens(st.contextUsed)} / ${fmtTokens(st.contextWindow)} · ${Math.round(pct * 100)} %` : 'noch keine Antwort'}
                </span>
              </div>
              <div className={`ctx-bar ${level(pct)}`}>
                <i style={{ width: `${Math.min(100, pct * 100)}%` }} />
              </div>
              {pct >= 0.8 && <div className="ctx-hint">Context wird knapp – tippe <code>/compact</code> oder starte frisch.</div>}
            </div>
            <div className="stat-grid">
              <div>
                <span>Input</span>
                <b>{fmtTokens(t?.input ?? 0)}</b>
              </div>
              <div>
                <span>Output</span>
                <b>{fmtTokens(t?.output ?? 0)}</b>
              </div>
              <div>
                <span>Cache gelesen</span>
                <b>{fmtTokens(t?.cacheRead ?? 0)}</b>
              </div>
              <div>
                <span>Cache geschrieben</span>
                <b>{fmtTokens((t?.cacheWrite5m ?? 0) + (t?.cacheWrite1h ?? 0))}</b>
              </div>
              <div>
                <span>Cache-Treffer</span>
                <b>{Math.round(hit * 100)} %</b>
              </div>
              <div>
                <span>≈ Kosten</span>
                <b>{st ? fmtUsd(st.costUsd) : '–'}</b>
              </div>
              <div>
                <span>Antworten</span>
                <b>{st?.responses ?? 0}</b>
              </div>
              <div>
                <span>Tool-Aufrufe</span>
                <b>{wf[s.id]?.feed.length ?? 0}</b>
              </div>
            </div>
          </section>
        )
      })}
      <div className="dim tiny">Kosten = Schätzung zu API-Preisen (im Abo nicht berechnet). Subagents nicht enthalten.</div>
    </div>
  )
}
