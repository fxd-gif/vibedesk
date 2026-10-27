// Statuszeile unter dem Claude-Terminal: Modell, Kontext, Kosten, Laufzeit (aus den Token-Protokollen).
import { useEffect, useState } from 'react'
import { fmtDuration, fmtTokens, fmtUsd, modelLabel, useStats } from '../store/statsStore'
import { api } from '../api'
import { getTerminal } from '../store/terminals'
import { t } from '../../../shared/i18n'
import { limitLevel, liveWindow } from '../../../shared/limits'
import { limitsTitle, useLimits } from '../store/limitStore'

/** Doppel-Esc öffnet in Claude Code das Zurückspulen (Gespräch und Code auf einen früheren Stand) */
function rewind(id: string): void {
  api.sessions.write(id, '\x1b')
  setTimeout(() => api.sessions.write(id, '\x1b'), 120)
  getTerminal(id)?.term.focus()
}

/** Abo-Limit (5 Stunden, sonst Woche) – erscheint erst, wenn Claude Code es meldet (nur Pro/Max) */
export function LimitChip({ now }: { now: number }): React.JSX.Element | null {
  const limits = useLimits((s) => s.limits)
  const w = liveWindow(limits, 'fiveHour', now) ?? liveWindow(limits, 'sevenDay', now)
  if (!w) return null
  const level = limitLevel(w.pct)
  return (
    <span className={`ts-ctx ts-limit ${level === 'hot' ? 'hot' : level === 'warn' ? 'warm' : ''}`} title={limitsTitle(limits, now)} data-testid="limit-chip">
      <i style={{ width: `${Math.round(w.pct)}%` }} />
      <b>{t('Abo {n} %', { n: Math.round(w.pct) })}</b>
    </span>
  )
}

/** claude=false: Gemini CLI / Codex – Modell, Kontext, Kosten und Zurückspulen gibt es dort nicht, nur die Laufzeit */
export function TermStatus({ sessionId, startedAt, claude = true }: { sessionId: string; startedAt: number; claude?: boolean }): React.JSX.Element {
  const st = useStats((s) => s.sessions[sessionId])
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  const ctx = st && st.contextWindow ? Math.min(1, st.contextUsed / st.contextWindow) : 0
  const level = ctx >= 0.85 ? 'hot' : ctx >= 0.6 ? 'warm' : ''
  if (!claude)
    return (
      <div className="term-status" data-testid="term-status">
        <span className="ts-time" title={t('Laufzeit der Session')}>
          {fmtDuration(now - startedAt)}
        </span>
      </div>
    )
  return (
    <div className="term-status" data-testid="term-status">
      <span title={t('Modell')}>{st?.model ? modelLabel(st.model) : t('Modell folgt')}</span>
      {st && st.contextWindow > 0 && (
        <span className={`ts-ctx ${level}`} title={t('Kontext: {used} von {total} Tokens', { used: fmtTokens(st.contextUsed), total: fmtTokens(st.contextWindow) })}>
          <i style={{ width: `${Math.round(ctx * 100)}%` }} />
          <b>{t('Kontext {n} %', { n: Math.round(ctx * 100) })}</b>
        </span>
      )}
      <LimitChip now={now} />
      {st && st.costUsd > 0 && <span title={st.estimated ? t('geschätzt nach API-Preisen') : t('nach API-Preisen')}>{fmtUsd(st.costUsd)}</span>}
      <button className="ts-rewind" title={t('Zurückspulen: Claude zeigt seine bisherigen Schritte – wähl einen aus, um Gespräch und Code auf diesen Stand zurückzusetzen')} onClick={() => rewind(sessionId)} data-testid="term-rewind">
        ↶ {t('Zurückspulen')}
      </button>
      <span className="ts-time" title={t('Laufzeit der Session')}>
        {fmtDuration(now - (st?.startedAt ?? startedAt))}
      </span>
    </div>
  )
}
