import { useEffect, useState } from 'react'
import { api } from '../api'
import '@xterm/xterm/css/xterm.css'
import { GlassWindow } from '../desktop/GlassWindow'
import { Icon } from '../desktop/icons'
import { confirm } from '../store/dialogStore'
import { termWin, useSessions } from '../store/sessionStore'
import { attachedShell, useShells } from '../store/shellStore'
import { useSettings } from '../store/settingsStore'
import { useUi } from '../store/uiStore'
import { useWorkflow } from '../store/workflowStore'
import type { SessionInfo } from '../../../shared/types'
import { sessionExitText } from '../../../shared/setupHints'
import { openSetup } from './ToolSetup'
import { shortUrl, usePreview } from '../store/previewStore'
import { TermPane } from '../terminal/TermPane'
import { TermSettings } from '../terminal/TermSettings'
import { toggleZen } from '../desktop/calm'
import type { DevScript } from '../../../shared/devScript'
import { TermStatus } from '../terminal/TermStatus'
import { QueueChip, TermQueue } from './TermQueue'
import { AttachButton, TermAttach } from './TermAttach'
import { cancelResume, fmtTime, useResume } from '../store/resumeStore'
import { t } from '../../../shared/i18n'

type WfStatus = 'idle' | 'working' | 'waiting' | 'done' | 'error'

/** Statustext in der gewählten Sprache */
export function statusText(s: WfStatus): string {
  switch (s) {
    case 'idle':
      return t('bereit')
    case 'working':
      return t('arbeitet')
    case 'waiting':
      return t('wartet auf dich')
    case 'done':
      return t('fertig')
    case 'error':
      return t('Fehler')
  }
}

/** Für bestehende Aufrufer: STATUS_TEXT[s] übersetzt erst beim Zugriff (Getter), nicht schon beim Import */
export const STATUS_TEXT: Record<WfStatus, string> = {
  get idle() {
    return statusText('idle')
  },
  get working() {
    return statusText('working')
  },
  get waiting() {
    return statusText('waiting')
  },
  get done() {
    return statusText('done')
  },
  get error() {
    return statusText('error')
  }
}

export function TerminalWindow({ session }: { session: SessionInfo }): React.JSX.Element {
  const id = termWin(session.id)
  const status = useWorkflow((s) => s.sessions[session.id]?.status ?? 'idle')
  const tending = useWorkflow((s) => !!s.sessions[session.id]?.tending && s.sessions[session.id]?.status === 'working')
  const exitCode = useSessions((s) => s.exited[session.id])
  const isTop = useUi((s) => s.open[s.open.length - 1] === id)
  const zenMe = useUi((s) => s.zen === id)
  const [dev, setDev] = useState<DevScript | null>(null)
  useEffect(() => {
    let alive = true
    void api.sessions.devScript(session.id).then((d) => alive && setDev(d))
    return () => {
      alive = false
    }
    // nach jeder Runde neu prüfen – Claude legt package.json oft erst während der Session an
  }, [session.id, status !== 'working'])
  const urls = usePreview((s) => s.urls[session.id])
  const shell = useShells((s) => attachedShell(s.shells, session.id))
  const shellExit = useShells((s) => (shell ? s.exited[shell.id] : undefined))
  const statusBar = useSettings((s) => s.s?.terminal?.statusBar ?? true)
  const resumeAt = useResume((s) => s.plans[session.id])
  // unten ist Platz für eine Leiste: Warteschlange oder Anhänge
  const [panel, setPanel] = useState<'queue' | 'attach' | null>(null)
  const queueOpen = panel === 'queue'
  const togglePanel = (p: 'queue' | 'attach'): void => setPanel((v) => (v === p ? null : p))
  const [settingsOpen, setSettingsOpen] = useState(false)
  // welche Hälfte zuletzt angeklickt wurde – die bekommt den Fokus, wenn das Fenster nach vorn kommt
  const [active, setActive] = useState<'claude' | 'shell'>('claude')
  const [startedAt] = useState(Date.now())

  const close = async (): Promise<void> => {
    const running = exitCode === undefined
    if (running && !(await confirm({ title: t('Session „{name}“ beenden?', { name: session.name }), message: t('Claude Code wird in diesem Fenster gestoppt.'), confirmLabel: t('Beenden'), danger: true })))
      return
    if (shell) await useShells.getState().close(shell.id)
    useSessions.getState().close(session.id)
  }

  /** Dev-Server in der Shell daneben starten – die Vorschau erkennt die URL dann von selbst */
  const startDev = async (): Promise<void> => {
    if (!dev) return
    const open = shell ?? (await useShells.getState().open(session.projectId, session.id))
    if (!open) return
    setActive('shell')
    api.shells.write(open.id, dev.shellCommand + '\r')
  }

  const toggleShell = async (): Promise<void> => {
    if (shell) {
      await useShells.getState().close(shell.id)
      setActive('claude')
    } else if (await useShells.getState().open(session.projectId, session.id)) setActive('shell')
  }

  // Unten Platz für Warteschlange und Statuszeile lassen
  const bottom = (panel === 'attach' ? 162 : panel ? 120 : 6) + (statusBar ? 22 : 0)

  return (
    <GlassWindow
      id={id}
      solid
      minW={420}
      minH={220}
      onClose={close}
      className={status === 'working' ? 'claude-working' : undefined}
      title={
        <>
          <span className={`dot ${status}`} />
          <span>{session.name}</span>
          <span className="dim" style={{ fontWeight: 400 }}>
            · {tending ? t('pflegt Gehirn …') : statusText(status)}
          </span>
          {urls?.slice(0, 2).map((u) => (
            <button key={u} className="url-chip" title={t('Vorschau: {url}', { url: u })} onClick={() => usePreview.getState().openPreview(u)} data-testid="url-chip">
              ▸ {shortUrl(u)}
            </button>
          ))}
          {dev && !urls?.length && (
            <button className="url-chip dev-chip" title={t('{command} in einer Shell daneben starten – die Vorschau öffnet sich, sobald der Server läuft', { command: dev.command })} onClick={() => void startDev()} data-testid="dev-chip">
              ▶ {t('Dev-Server')}
            </button>
          )}
          <QueueChip sessionId={session.id} open={queueOpen} onToggle={() => togglePanel('queue')} />
          {resumeAt && (
            <button className="resume-chip" title={t('Claude hat das Nutzungslimit erreicht. Danach geht es von selbst weiter – klicken zum Abbrechen.')} onClick={() => cancelResume(session.id)} data-testid="resume-chip">
              ⏰ {t('weiter um {time}', { time: fmtTime(resumeAt) })} ✕
            </button>
          )}
          <span className="term-tools" onPointerDown={(e) => e.stopPropagation()}>
            <AttachButton sessionId={session.id} open={panel === 'attach'} onToggle={() => togglePanel('attach')} />
            <button className={`term-tool${shell ? ' on' : ''}`} title={shell ? t('Shell schließen') : t('Shell daneben öffnen (PowerShell im Projektordner)')} onClick={() => void toggleShell()} data-testid="term-split">
              <Icon name="terminal" size={13} />
            </button>
            <button className={`term-tool${zenMe ? ' on' : ''}`} title={zenMe ? t('Alles zeigen (Strg+.)') : t('Nur diese Session – Zen-Modus (Strg+.)')} onClick={() => toggleZen(id)} data-testid="term-zen">
              <Icon name="eye" size={13} />
            </button>
            <button className={`term-tool${settingsOpen ? ' on' : ''}`} title={t('Terminal-Einstellungen')} onClick={() => setSettingsOpen((v) => !v)} data-testid="term-settings-btn">
              <Icon name="gear" size={13} />
            </button>
          </span>
        </>
      }
    >
      <div className={`term-panes${shell ? ' split' : ''}`} style={{ bottom }}>
        <div className="term-slot" onPointerDown={() => setActive('claude')}>
          <TermPane id={session.id} testId={`terminal-${session.name}`} focused={isTop && active === 'claude'} label={shell ? 'Claude' : undefined} />
        </div>
        {shell && (
          <div className="term-slot" onPointerDown={() => setActive('shell')}>
            <TermPane id={shell.id} testId={`shell-${session.name}`} focused={isTop && active === 'shell'} label={shellExit !== undefined ? t('Shell (beendet)') : 'Shell'} />
          </div>
        )}
      </div>
      {queueOpen && <TermQueue sessionId={session.id} />}
      {panel === 'attach' && <TermAttach sessionId={session.id} />}
      {statusBar && <TermStatus sessionId={session.id} startedAt={startedAt} />}
      {settingsOpen && <TermSettings onClose={() => setSettingsOpen(false)} />}
      {exitCode !== undefined && (
        <div className="term-overlay" data-testid="term-exit">
          <span className="dim" style={{ maxWidth: 420 }}>
            {sessionExitText(exitCode)}
          </span>
          {exitCode !== 0 && (
            <button className="btn" onClick={openSetup}>
              {t('Einrichtung')}
            </button>
          )}
          <button className="btn primary" onClick={() => useSessions.getState().restart(session.id)}>
            <Icon name="restart" size={15} /> {t('Neu starten')}
          </button>
        </div>
      )}
    </GlassWindow>
  )
}
