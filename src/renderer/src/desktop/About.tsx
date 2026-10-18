// „Über VibeDesk“: Version, Lizenz, Hinweis zu Anthropic, Fehler melden und das lokale Fehlerprotokoll.
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { api } from '../api'
import { REPO_URL } from '../../../shared/bugReport'
import type { AppInfo } from '../../../shared/types'
import { t } from '../../../shared/i18n'

export const useAbout = create<{ open: boolean }>(() => ({ open: false }))
export const openAbout = (): void => useAbout.setState({ open: true })

export function About(): React.JSX.Element | null {
  const open = useAbout((s) => s.open)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const close = (): void => useAbout.setState({ open: false })

  useEffect(() => {
    if (!open) return
    void api.app.info().then(setInfo)
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open])

  if (!open) return null
  return (
    <div className="about-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()} data-testid="about">
      <div className="about-card" role="dialog" aria-label={t('Über VibeDesk')}>
        <h3>VibeDesk {info?.version ?? ''}</h3>
        <p className="dim">{t('Kostenlos und Open Source unter der MIT-Lizenz. Ein unabhängiges Projekt – nicht von Anthropic. Claude ist eine Marke von Anthropic.')}</p>
        <dl>
          <dt>Claude Code</dt>
          <dd>{info ? (info.claude ?? t('nicht gefunden')) : '…'}</dd>
          <dt>{t('System')}</dt>
          <dd>{info ? `${info.os} · Electron ${info.electron}` : '…'}</dd>
        </dl>
        <p className="dim small">{t('Fragen, Fehler und Ideen laufen über GitHub Issues. „Fehler melden“ öffnet ein vorausgefülltes Issue im Browser – du siehst alles, bevor du es abschickst.')}</p>
        <div className="about-actions">
          <button className="btn primary small" onClick={() => api.app.reportBug()} data-testid="about-report">
            {t('Fehler melden')}
          </button>
          <button className="btn ghost small" onClick={() => api.app.openLog()}>
            {info?.hasErrors ? t('Fehlerprotokoll ansehen') : t('Fehlerprotokoll (leer)')}
          </button>
          <button className="btn ghost small" onClick={() => api.openExternal(REPO_URL)}>
            GitHub
          </button>
          <button className="btn ghost small" onClick={close}>
            {t('Schließen')}
          </button>
        </div>
      </div>
    </div>
  )
}
