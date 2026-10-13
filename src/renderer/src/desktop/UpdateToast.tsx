import { api } from '../api'
import { updateLabel } from '../store/updateLabel'
import { useUpdate } from '../store/updateStore'
import { Icon } from './icons'

export function UpdateToast(): React.JSX.Element | null {
  const { status, dismissed, dismiss, autoInstalling } = useUpdate()
  const label = autoInstalling && status.state === 'ready' ? `Update ${status.version} wird installiert – VibeDesk startet gleich neu …` : updateLabel(status)
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
      {ready && !autoInstalling && (
        <>
          <button className="btn small primary" onClick={() => api.update.install()}>
            Jetzt neu starten
          </button>
          <button className="btn small ghost" onClick={dismiss} title="Wird beim nächsten Beenden installiert">
            Später
          </button>
        </>
      )}
    </div>
  )
}
