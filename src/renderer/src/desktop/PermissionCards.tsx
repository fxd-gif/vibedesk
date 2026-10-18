// Freigabe-Karten: Claude will etwas tun und fragt – Erlauben · Immer · Ablehnen direkt hier, ohne ins Terminal zu wechseln.
import { useState } from 'react'
import type { PermissionAsk, PermissionDecision } from '../../../shared/permissions'
import { answerPermission, usePermissions } from '../store/permissionStore'
import { termWin, useSessions } from '../store/sessionStore'
import { redactText } from '../store/streamerStore'
import { useUi } from '../store/uiStore'
import { t } from '../../../shared/i18n'

function PermissionCard({ a }: { a: PermissionAsk }): React.JSX.Element {
  const name = useSessions((s) => s.sessions.find((x) => x.id === a.sessionId)?.name ?? 'Claude')
  const [busy, setBusy] = useState(false)
  const decide = (d: PermissionDecision): void => {
    setBusy(true)
    void answerPermission(a.id, d).finally(() => setBusy(false))
    if (d === 'terminal') useUi.getState().focus(termWin(a.sessionId))
  }
  return (
    <div className="ntoast k-waiting perm-card" role="alertdialog" aria-label={t('Freigabe für {name}', { name })} data-testid="perm-card">
      <button className="ntoast-main" onClick={() => useUi.getState().focus(termWin(a.sessionId))}>
        <span className="dot waiting" />
        <span className="ntoast-text">
          <b>{t('{name} braucht eine Freigabe', { name })}</b>
          <span>{a.summary}</span>
        </span>
      </button>
      {a.detail && <pre className="perm-detail">{redactText(a.detail)}</pre>}
      <div className="ntoast-actions">
        <button className="btn small ghost" disabled={busy} onClick={() => decide('terminal')} title={t('Die normale Frage im Terminal beantworten')}>
          {t('Im Terminal')}
        </button>
        <button className="btn small" disabled={busy} onClick={() => decide('deny')}>
          {t('Ablehnen')}
        </button>
        {a.canAlways && (
          <button className="btn small" disabled={busy} onClick={() => decide('always')} title={t('Erlauben und für ähnliche Fälle merken')}>
            {t('Immer')}
          </button>
        )}
        <button className="btn small primary" disabled={busy} onClick={() => decide('allow')} data-testid="perm-allow">
          {t('Erlauben')}
        </button>
      </div>
    </div>
  )
}

export function PermissionCards(): React.JSX.Element {
  const list = usePermissions((s) => s.list)
  return (
    <>
      {list.map((a) => (
        <PermissionCard key={a.id} a={a} />
      ))}
    </>
  )
}
