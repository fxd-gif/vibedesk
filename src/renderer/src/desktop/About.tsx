// „Über VibeDesk“: Version, Lizenz, Hinweis zu Anthropic, Fehler melden, Diagnose und das lokale Fehlerprotokoll.
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { api } from '../api'
import { REPO_URL } from '../../../shared/bugReport'
import { diagnosticsReport, saverOn, type DiagnosticsInfo, type GhState } from '../../../shared/diagnostics'
import type { AppInfo } from '../../../shared/types'
import { t } from '../../../shared/i18n'
import { useLounge } from '../store/loungeStore'

export const useAbout = create<{ open: boolean; diag: boolean }>(() => ({ open: false, diag: false }))
/** diag: gleich mit aufgeklappter Diagnose (Befehlspalette) */
export const openAbout = (diag = false): void => useAbout.setState({ open: true, diag })

const onOff = (b: boolean): string => (b ? t('an') : t('aus'))

function ghLabel(g: GhState): string {
  if (g === 'loggedIn') return t('angemeldet')
  if (g === 'loggedOut') return t('nicht angemeldet')
  if (g === 'missing') return t('nicht gefunden')
  return t('unbekannt')
}

function agoLabel(ts: number | null): string {
  if (ts === null) return t('noch keins')
  const min = Math.round((Date.now() - ts) / 60_000)
  if (min < 1) return t('gerade eben')
  return min < 60 ? t('vor {n} Min.', { n: min }) : t('vor {n} Std.', { n: Math.round(min / 60) })
}

/** Aufgeklappter Teil: alles, was hilft, wenn etwas nicht geht – und als Text fürs Issue */
function Diagnostics(): React.JSX.Element {
  const [d, setD] = useState<DiagnosticsInfo | null>(null)
  const [copied, setCopied] = useState(false)
  const lounge = useLounge((s) => s.state !== 'off')

  useEffect(() => {
    void api.app.diagnostics().then(setD)
  }, [])

  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(id)
  }, [copied])

  if (!d) return <p className="dim small about-diag">{t('Diagnose wird gesammelt …')}</p>
  const v = d.versions
  return (
    <section className="about-diag" data-testid="about-diag">
      <dl>
        <dt>{t('Laufzeit')}</dt>
        <dd>{`Electron ${v.electron} · Chrome ${v.chrome} · Node ${v.node}`}</dd>
        <dt>{t('Node (System)')}</dt>
        <dd>{v.systemNode ?? t('nicht gefunden')}</dd>
        <dt>Git</dt>
        <dd>{v.git ?? t('nicht gefunden')}</dd>
        <dt>{t('GitHub-CLI')}</dt>
        <dd>{ghLabel(v.gh)}</dd>
        <dt>{t('Hook-Server')}</dt>
        <dd>{d.hooks.running ? t('läuft · Port {port}', { port: d.hooks.port ?? '?' }) : t('läuft nicht')}</dd>
        <dt>{t('Ereignisse')}</dt>
        <dd>{t('{n} seit Start · letztes {ago}', { n: d.hooks.events, ago: agoLabel(d.hooks.lastEventAt) })}</dd>
        <dt>Sessions</dt>
        <dd>{d.sessions}</dd>
        <dt>{t('Module')}</dt>
        <dd>{`${t('Gehirn')} ${onOff(d.brainOn)} · ${t('Handy-Begleiter')} ${onOff(d.companionOn)} · ${t('Vibe-Lounge')} ${onOff(lounge)}`}</dd>
        <dt>{t('Arbeitsspeicher')}</dt>
        <dd>{`${d.memoryMb} MB`}</dd>
        <dt>{t('Bildrate')}</dt>
        <dd>{saverOn(d.energySaver, d.onBattery) ? t('Sparmodus') : t('normal')}</dd>
      </dl>
      <pre className="about-log">{d.log || t('Das Fehlerprotokoll ist leer.')}</pre>
      <div className="about-actions">
        <button
          className="btn primary small"
          onClick={() => {
            api.clipboard.write(diagnosticsReport(d, lounge))
            setCopied(true)
          }}
          data-testid="about-diag-copy"
        >
          {copied ? t('Kopiert ✓') : t('Bericht kopieren')}
        </button>
        <button className="btn ghost small" onClick={() => api.app.openLog()}>
          {t('Protokoll öffnen')}
        </button>
      </div>
      <p className="dim small">{t('Der Bericht enthält keine Benutzernamen aus Pfaden. Füge ihn in dein Issue ein, damit wir sehen, woran es liegt.')}</p>
    </section>
  )
}

export function About(): React.JSX.Element | null {
  const open = useAbout((s) => s.open)
  const diag = useAbout((s) => s.diag)
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
      <div className={`about-card${diag ? ' wide' : ''}`} role="dialog" aria-label={t('Über VibeDesk')}>
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
          <button className="btn ghost small" onClick={() => useAbout.setState({ diag: !diag })} aria-expanded={diag} data-testid="about-diag-toggle">
            {diag ? t('Diagnose ▴') : t('Diagnose ▾')}
          </button>
          {!diag && (
            <button className="btn ghost small" onClick={() => api.app.openLog()}>
              {info?.hasErrors ? t('Fehlerprotokoll ansehen') : t('Fehlerprotokoll (leer)')}
            </button>
          )}
          <button className="btn ghost small" onClick={() => api.openExternal(REPO_URL)}>
            GitHub
          </button>
          <button className="btn ghost small" onClick={close}>
            {t('Schließen')}
          </button>
        </div>
        {diag && <Diagnostics />}
      </div>
    </div>
  )
}
