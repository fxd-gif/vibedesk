// Fängt Render-Fehler ab: Ein gestolpertes Fenster zeigt einen Neu-laden-Knopf, statt die ganze App weiß zu machen.
import { Component, type ReactNode } from 'react'
import { api } from '../api'
import { t } from '../../../shared/i18n'

interface Props {
  /** wo es passiert ist – fürs Fehlerprotokoll */
  where: string
  children: ReactNode
  /** ganze App: Fallback füllt den Bildschirm */
  full?: boolean
}

export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    api.app.logError(this.props.where, `${error.message}\n${error.stack ?? ''}\n${info.componentStack ?? ''}`)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className={`crash-card${this.props.full ? ' full' : ''}`} data-testid="crash-card">
        <b>{this.props.full ? t('VibeDesk ist gestolpert') : t('Dieses Fenster ist gestolpert')}</b>
        <span className="dim">
          {this.props.full
            ? t('Deine Claude-Sessions laufen im Hintergrund weiter. Der Fehler steht im Protokoll.')
            : t('Der Rest von VibeDesk läuft normal weiter. Der Fehler steht im Protokoll.')}
        </span>
        <code>{error.message.slice(0, 200)}</code>
        <div className="crash-actions">
          <button className="btn primary small" onClick={() => (this.props.full ? location.reload() : this.setState({ error: null }))}>
            {t('Neu laden')}
          </button>
          <button className="btn ghost small" onClick={() => api.app.reportBug(`${this.props.where}: ${error.message}`)}>
            {t('Fehler melden')}
          </button>
        </div>
      </div>
    )
  }
}
