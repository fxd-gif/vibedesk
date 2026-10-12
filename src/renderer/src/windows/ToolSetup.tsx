import { useEffect } from 'react'
import { create } from 'zustand'
import { api } from '../api'
import { Icon } from '../desktop/icons'
import type { ToolId, ToolStatus } from '../../../shared/types'

interface SetupState {
  status: ToolStatus | null
  checking: boolean
  installing: ToolId | null
  failed: ToolId | null
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
  api.on.setupLog((_tool, line) => useSetup.setState((s) => ({ log: [...s.log, line].slice(-6) })))
}

/** Bestehende Installation: beim Start prüfen und nur bei Lücken nachfragen. */
export async function checkSetupOnStart(): Promise<void> {
  const st = await useSetup.getState().check()
  if (!st.node || !st.claude) useSetup.setState({ prompt: true })
}

const LABEL: Record<ToolId, { name: string; why: string }> = {
  node: { name: 'Node.js', why: 'für Live-Status, Feed und Stats' },
  claude: { name: 'Claude Code', why: 'die KI, mit der du baust' }
}

function Row({ tool }: { tool: ToolId }): React.JSX.Element {
  const { status, installing, failed, install } = useSetup()
  const version = status?.[tool]
  const busy = installing === tool
  const canAuto = tool === 'claude' || !!status?.winget
  return (
    <div className={`setup-row${version ? ' ok' : ''}`} data-testid={`setup-${tool}`}>
      <span className="setup-mark">{version ? <Icon name="check" size={15} /> : busy ? <span className="spin" /> : <i />}</span>
      <div className="setup-text">
        <b>{LABEL[tool].name}</b>
        <span>{version ? `Version ${version}` : busy ? 'wird installiert …' : LABEL[tool].why}</span>
      </div>
      {!version && !busy && (
        <div className="setup-actions">
          {canAuto && (
            <button className="btn small primary" disabled={!!installing} onClick={() => install(tool)} data-testid={`setup-install-${tool}`}>
              {failed === tool ? 'Nochmal versuchen' : 'Installieren'}
            </button>
          )}
          {(!canAuto || failed === tool) && (
            <button className="btn small" onClick={() => api.setup.openDownload(tool)}>
              {tool === 'node' ? 'Download-Seite' : 'Anleitung'}
            </button>
          )}
        </div>
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
        <span className="spin" /> Suche Node.js und Claude Code …
      </p>
    )
  return (
    <div className="setup">
      <Row tool="node" />
      <Row tool="claude" />
      {installing === 'node' && <p className="setup-hint">Windows fragt eventuell nach Administrator-Rechten – bitte bestätigen.</p>}
      {installing && log.length > 0 && (
        <pre className="setup-log" data-testid="setup-log">
          {log.join('\n')}
        </pre>
      )}
      {!installing && (!status.node || !status.claude) && (
        <button className="btn small ghost setup-recheck" onClick={() => check()} disabled={checking}>
          {checking ? 'Prüfe …' : 'Erneut prüfen'}
        </button>
      )}
    </div>
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
        <h3>{done ? 'Alles bereit' : 'Da fehlt noch etwas'}</h3>
        <p className="dlg-msg">{done ? 'Node.js und Claude Code sind installiert.' : 'VibeDesk braucht Node.js und Claude Code. Mit einem Klick installiert:'}</p>
        <ToolSetupPanel />
        <div className="dlg-actions">
          <button className={`btn ${done ? 'primary' : 'ghost'}`} disabled={!!installing} onClick={close}>
            {done ? 'Los geht’s' : 'Später'}
          </button>
        </div>
      </div>
    </div>
  )
}
