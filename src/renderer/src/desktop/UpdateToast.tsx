import { api } from '../api'
import { updateLabel } from '../store/updateLabel'
import { useUpdate } from '../store/updateStore'
import { Icon } from './icons'
import { t } from '../../../shared/i18n'

export function UpdateToast(): React.JSX.Element | null {
  const { status, dismissed, dismiss, autoInstalling } = useUpdate()
  const label = autoInstalling && status.state === 'ready' ? t('Update {version} wird installiert – VibeDesk startet gleich neu …', { version: status.version }) : updateLabel(status)
  if (!label || dismissed) return null
  const ready = status.state === 'ready'
  return (
    <div className="update-toast" data-testid="update-toast">
      <Icon name={ready ? 'check' : 'restart'} size={16} />
      <span>{label}</span>
      {status.state === 'downloading' && (
        <div className="update-bar">
          <i style={{ width: `${status.percent}%` }} />
        </div>
      )}
      {status.state === 'available' && status.manual && (
        <>
          <button className="btn small primary" onClick={() => api.update.download()} data-testid="update-download">
            {t('Laden')}
          </button>
          <button className="btn small ghost" onClick={dismiss}>
            {t('Später')}
          </button>
        </>
      )}
      {ready && !autoInstalling && (
        <>
          <button className="btn small primary" onClick={() => api.update.install()}>
            {t('Jetzt neu starten')}
          </button>
          <button className="btn small ghost" onClick={dismiss} title={t('Wird beim nächsten Beenden installiert')}>
            {t('Später')}
          </button>
        </>
      )}
    </div>
  )
}
