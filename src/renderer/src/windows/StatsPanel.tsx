import { useEffect, useState } from 'react'
import { useSessions } from '../store/sessionStore'
import { fmtDuration, fmtTokens, fmtUsd, modelLabel, useStats } from '../store/statsStore'
import { useWorkflow } from '../store/workflowStore'
import { showWrapped } from '../wrapped/VibeWrapped'
import { t } from '../../../shared/i18n'

const level = (p: number): string => (p >= 0.95 ? 'crit' : p >= 0.8 ? 'warn' : 'ok')

export function StatsPanel(): React.JSX.Element {
  const sessions = useSessions((s) => s.sessions)
  const stats = useStats((s) => s.sessions)
  const days = useStats((s) => s.days).slice(-7) // Store hält 30 Tage für die Streak
  const wf = useWorkflow((s) => s.sessions)
  const [now, setNow] = useState(Date.now())
  // Rohzahlen (Cache, Tool-Aufrufe …) nur auf Wunsch – vorn steht, was man wirklich wissen will
  const [details, setDetails] = useState(false)
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(iv)
  }, [])

  const today = days[days.length - 1]
  const maxDay = Math.max(1, ...days.map((d) => d.tokens))

  return (
    <div className="panel stats">
      <section className="stats-today">
        <div>
          <div className="dim small">{t('Heute')}</div>
          <div className="big">{fmtTokens(today?.tokens ?? 0)}</div>
          <div className="dim small">{t('Tokens · ≈ {cost}', { cost: fmtUsd(today?.costUsd ?? 0) })}</div>
          <button className="btn small ghost" style={{ marginTop: 6 }} onClick={() => void showWrapped()} data-testid="stats-wrapped">
            ✨ {t('Deine Woche ansehen')}
          </button>
        </div>
        <div className="spark" title={t('Letzte 7 Tage')}>
          {days.map((d) => (
            <i key={d.date} style={{ height: `${Math.max(4, (d.tokens / maxDay) * 100)}%` }} title={`${d.date}: ${fmtTokens(d.tokens)} · ${fmtUsd(d.costUsd)}`} />
          ))}
        </div>
      </section>

      {!sessions.length && <div className="panel-empty">{t('Starte eine Session – Tokens, Context und Kosten erscheinen hier live.')}</div>}

      {sessions.map((s) => {
        const st = stats[s.id]
        const pct = st ? st.contextUsed / st.contextWindow : 0
        const tot = st?.total
        const inputAll = tot ? tot.input + tot.cacheRead + tot.cacheWrite5m + tot.cacheWrite1h : 0
        const hit = tot && inputAll ? tot.cacheRead / inputAll : 0
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
                <span>{t('Context')}</span>
                <span className={`ctx-num ${level(pct)}`}>
                  {st ? `${fmtTokens(st.contextUsed)} / ${fmtTokens(st.contextWindow)} · ${t('{p} %', { p: Math.round(pct * 100) })}` : t('noch keine Antwort')}
                </span>
              </div>
              <div className={`ctx-bar ${level(pct)}`}>
                <i style={{ width: `${Math.min(100, pct * 100)}%` }} />
              </div>
              {pct >= 0.8 && <div className="ctx-hint">
                  {t('Context wird knapp – tippe')} <code>/compact</code> {t('oder starte frisch.')}
                </div>}
            </div>
            <div className="row between small stat-sum">
              <span className="dim">{t('≈ Kosten')}</span>
              <b>{st ? fmtUsd(st.costUsd) : '–'}</b>
            </div>
            {details && <div className="stat-grid">
              <div>
                <span>Input</span>
                <b>{fmtTokens(tot?.input ?? 0)}</b>
              </div>
              <div>
                <span>Output</span>
                <b>{fmtTokens(tot?.output ?? 0)}</b>
              </div>
              <div>
                <span>{t('Cache gelesen')}</span>
                <b>{fmtTokens(tot?.cacheRead ?? 0)}</b>
              </div>
              <div>
                <span>{t('Cache geschrieben')}</span>
                <b>{fmtTokens((tot?.cacheWrite5m ?? 0) + (tot?.cacheWrite1h ?? 0))}</b>
              </div>
              <div>
                <span>{t('Cache-Treffer')}</span>
                <b>{t('{p} %', { p: Math.round(hit * 100) })}</b>
              </div>
              <div>
                <span>{t('≈ Kosten')}</span>
                <b>{st ? fmtUsd(st.costUsd) : '–'}</b>
              </div>
              <div>
                <span>{t('Antworten')}</span>
                <b>{st?.responses ?? 0}</b>
              </div>
              <div>
                <span>{t('Tool-Aufrufe')}</span>
                <b>{wf[s.id]?.feed.length ?? 0}</b>
              </div>
            </div>}
          </section>
        )
      })}
      {sessions.length > 0 && (
        <button className="btn small ghost" onClick={() => setDetails((v) => !v)} data-testid="stats-details">
          {details ? t('Weniger anzeigen') : t('Details: Cache, Antworten, Tool-Aufrufe')}
        </button>
      )}
      <div className="dim tiny">{t('Kosten = Schätzung zu API-Preisen (im Abo nicht berechnet). Subagents nicht enthalten.')}</div>
    </div>
  )
}
