import { useEffect } from 'react'
import { create } from 'zustand'
import { api } from '../api'
import { Icon } from '../desktop/icons'
import { installFailReason, SETUP_LINKS } from '../../../shared/setupHints'
import type { ToolId, ToolStatus } from '../../../shared/types'
import { t } from '../../../shared/i18n'

interface SetupState {
  status: ToolStatus | null
  checking: boolean
  installing: ToolId | null
  failed: ToolId | null
  /** Ausgabe der letzten Installation (gekürzt) – bei Fehlschlag aufklappbar */
  log: string[]
  /** Start-Hinweis für bestehende Installationen, wenn etwas fehlt */
  prompt: boolean
  check(): Promise<ToolStatus>
  install(tool: ToolId): Promise<void>
}

export const useSetup = create<SetupState>((set, get) => ({
  status: null,
  checking: false,
  installing: null,
  failed: null,
  log: [],
  prompt: false,
  check: async () => {
    set({ checking: true })
    const status = await api.setup.check()
    set({ status, checking: false })
    return status
  },
  install: async (tool) => {
    if (get().installing) return
    set({ installing: tool, failed: null, log: [] })
    const ok = await api.setup.install(tool)
    const status = await api.setup.check()
    const found = tool === 'node' ? status.node : status.claude
    set({ installing: null, status, failed: ok && found ? null : tool })
  }
}))

let wired = false
export function wireSetup(): void {
  if (wired) return
  wired = true
  api.on.setupLog((_tool, line) => useSetup.setState((s) => ({ log: [...s.log, line].slice(-200) })))
}

/** Bestehende Installation: beim Start prüfen und nur bei Lücken nachfragen. */
export async function checkSetupOnStart(): Promise<void> {
  const st = await useSetup.getState().check()
  if (!st.node || !st.claude) useSetup.setState({ prompt: true })
}

/** Einrichtung als Dialog öffnen (z. B. wenn eine Session nicht starten kann) */
export function openSetup(): void {
  useSetup.setState({ prompt: true })
  void useSetup.getState().check()
}

/** Fehlt etwas, ohne das keine Session läuft? */
export const missingTools = (st: ToolStatus | null): boolean => !!st && (!st.node || !st.claude)

const LABEL = (): Record<ToolId, { name: string; why: string }> => ({
  node: { name: 'Node.js', why: t('für Live-Status, Feed und Stats') },
  claude: { name: 'Claude Code', why: t('die KI, mit der du baust') }
})

function Row({ tool }: { tool: ToolId }): React.JSX.Element {
  const { status, installing, failed, install } = useSetup()
  const version = status?.[tool]
  const busy = installing === tool
  const canAuto = tool === 'claude' || !!status?.winget
  return (
    <div className={`setup-row${version ? ' ok' : ''}`} data-testid={`setup-${tool}`}>
      <span className="setup-mark">{version ? <Icon name="check" size={15} /> : busy ? <span className="spin" /> : <i />}</span>
      <div className="setup-text">
        <b>{LABEL()[tool].name}</b>
        <span>{version ? t('Version {version}', { version }) : busy ? t('wird installiert …') : failed === tool ? t('Installation hat nicht geklappt') : LABEL()[tool].why}</span>
      </div>
      {!version && !busy && (
        <div className="setup-actions">
          {canAuto && (
            <button className="btn small primary" disabled={!!installing} onClick={() => install(tool)} data-testid={`setup-install-${tool}`}>
              {failed === tool ? t('Nochmal versuchen') : t('Installieren')}
            </button>
          )}
          {(!canAuto || failed === tool) && (
            <button className="btn small" onClick={() => api.setup.openDownload(tool)}>
              {tool === 'node' ? t('Download-Seite') : t('Anleitung')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Dritter Punkt: Anmeldung bei Claude – lässt sich nicht per Klick erledigen, nur erklären. */
function LoginRow(): React.JSX.Element {
  const status = useSetup((s) => s.status)
  const ok = !!status?.login
  const text = ok
    ? t('Angemeldet')
    : status?.claude
      ? t('Beim ersten Start fragt Claude im Terminal nach deiner Anmeldung – du brauchst ein Claude-Pro/Max-Abo oder einen API-Schlüssel.')
      : t('Kommt nach der Installation: Beim ersten Start fragt Claude im Terminal nach deiner Anmeldung – du brauchst ein Claude-Pro/Max-Abo oder einen API-Schlüssel.')
  return (
    <div className={`setup-row${ok ? ' ok' : ''}`} data-testid="setup-login">
      <span className="setup-mark">{ok ? <Icon name="check" size={15} /> : <i />}</span>
      <div className="setup-text">
        <b>{t('Bei Claude anmelden')}</b>
        <span>{text}</span>
      </div>
      {!ok && (
        <div className="setup-actions">
          <button className="btn small" onClick={() => api.openExternal(SETUP_LINKS.login)}>
            {t('Mehr dazu')}
          </button>
        </div>
      )}
    </div>
  )
}

/** Nach einem Fehlschlag: Ursache in einem Satz, die letzten Zeilen zum Aufklappen */
function FailInfo(): React.JSX.Element | null {
  const failed = useSetup((s) => s.failed)
  const installing = useSetup((s) => s.installing)
  const log = useSetup((s) => s.log)
  if (!failed || installing) return null
  const reason = installFailReason(log) ?? t('Die Installation von {name} hat nicht geklappt. Versuch es nochmal oder folge der Anleitung.', { name: LABEL()[failed].name })
  return (
    <div data-testid="setup-fail">
      <p className="setup-hint">{reason}</p>
      {log.length > 0 && (
        <details style={{ fontSize: 12 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-dim)' }}>{t('Was genau ist passiert?')}</summary>
          <pre className="setup-log" style={{ marginTop: 6 }}>
            {log.slice(-12).join('\n')}
          </pre>
        </details>
      )}
    </div>
  )
}

export function ToolSetupPanel(): React.JSX.Element {
  const { status, checking, installing, log, check } = useSetup()
  useEffect(() => {
    if (!status && !checking) check()
  }, [])
  if (!status)
    return (
      <p className="row" style={{ justifyContent: 'center' }}>
        <span className="spin" /> {t('Suche Node.js und Claude Code …')}
      </p>
    )
  return (
    <div className="setup">
      <Row tool="node" />
      <Row tool="claude" />
      <LoginRow />
      {installing === 'node' && <p className="setup-hint">{t('Windows fragt eventuell nach Administrator-Rechten – bitte bestätigen.')}</p>}
      {installing && log.length > 0 && (
        <pre className="setup-log" data-testid="setup-log">
          {log.slice(-6).join('\n')}
        </pre>
      )}
      <FailInfo />
      {!installing && (!status.node || !status.claude || !status.login) && (
        <button className="btn small ghost setup-recheck" onClick={() => check()} disabled={checking}>
          {checking ? t('Prüfe …') : t('Erneut prüfen')}
        </button>
      )}
    </div>
  )
}

/** Ruhiger Hinweis, wenn man ohne Node.js oder Claude Code weitergeht */
export function MissingHint(): React.JSX.Element | null {
  const status = useSetup((s) => s.status)
  if (!missingTools(status)) return null
  return (
    <p className="setup-hint" data-testid="setup-missing-hint">
      {t('Ohne Node.js und Claude Code kann VibeDesk noch keine Claude-Sessions starten. Du kannst trotzdem weitergehen – beim Start einer Session bietet VibeDesk dir die Einrichtung wieder an.')}
    </p>
  )
}

/** Hinweis beim Start, wenn nach dem Rundgang etwas fehlt (z. B. deinstalliert). */
export function SetupPrompt(): React.JSX.Element | null {
  const prompt = useSetup((s) => s.prompt)
  const status = useSetup((s) => s.status)
  const installing = useSetup((s) => s.installing)
  if (!prompt) return null
  const done = !!status?.node && !!status?.claude
  const close = (): void => useSetup.setState({ prompt: false })
  return (
    <div className="dlg-backdrop" onPointerDown={(e) => e.target === e.currentTarget && !installing && close()}>
      <div className="dlg setup-dlg" role="dialog" data-testid="setup-prompt">
        <h3>{!status ? t('Einrichtung') : done ? t('Alles bereit') : t('Da fehlt noch etwas')}</h3>
        <p className="dlg-msg">
          {!status
            ? t('Einen Moment, ich schaue nach …')
            : done
              ? t('Node.js und Claude Code sind installiert.')
              : t('VibeDesk braucht Node.js und Claude Code. Mit einem Klick installiert:')}
        </p>
        <ToolSetupPanel />
        <div className="dlg-actions">
          <button className={`btn ${done ? 'primary' : 'ghost'}`} disabled={!!installing} onClick={close}>
            {done ? t('Los geht’s') : t('Später')}
          </button>
        </div>
      </div>
    </div>
  )
}
