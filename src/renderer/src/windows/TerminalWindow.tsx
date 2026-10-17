import { useState } from 'react'
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
import { shortUrl, usePreview } from '../store/previewStore'
import { TermPane } from '../terminal/TermPane'
import { TermSettings } from '../terminal/TermSettings'
import { TermStatus } from '../terminal/TermStatus'
import { QueueChip, TermQueue } from './TermQueue'

export const STATUS_TEXT = {
  idle: 'bereit',
  working: 'arbeitet',
  waiting: 'wartet auf dich',
  done: 'fertig',
  error: 'Fehler'
} as const

export function TerminalWindow({ session }: { session: SessionInfo }): React.JSX.Element {
  const id = termWin(session.id)
  const status = useWorkflow((s) => s.sessions[session.id]?.status ?? 'idle')
  const tending = useWorkflow((s) => !!s.sessions[session.id]?.tending && s.sessions[session.id]?.status === 'working')
  const exitCode = useSessions((s) => s.exited[session.id])
  const isTop = useUi((s) => s.open[s.open.length - 1] === id)
  const urls = usePreview((s) => s.urls[session.id])
  const shell = useShells((s) => attachedShell(s.shells, session.id))
  const shellExit = useShells((s) => (shell ? s.exited[shell.id] : undefined))
  const statusBar = useSettings((s) => s.s?.terminal?.statusBar ?? true)
  const [queueOpen, setQueueOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // welche Hälfte zuletzt angeklickt wurde – die bekommt den Fokus, wenn das Fenster nach vorn kommt
  const [active, setActive] = useState<'claude' | 'shell'>('claude')
  const [startedAt] = useState(Date.now())

  const close = async (): Promise<void> => {
    const running = exitCode === undefined
    if (running && !(await confirm({ title: `Session „${session.name}“ beenden?`, message: 'Claude Code wird in diesem Fenster gestoppt.', confirmLabel: 'Beenden', danger: true })))
      return
    if (shell) await useShells.getState().close(shell.id)
    useSessions.getState().close(session.id)
  }

  const toggleShell = async (): Promise<void> => {
    if (shell) {
      await useShells.getState().close(shell.id)
      setActive('claude')
    } else if (await useShells.getState().open(session.projectId, session.id)) setActive('shell')
  }

  // Unten Platz für Warteschlange und Statuszeile lassen
  const bottom = (queueOpen ? 120 : 6) + (statusBar ? 22 : 0)

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
            · {tending ? 'pflegt Gehirn …' : STATUS_TEXT[status]}
          </span>
          {urls?.slice(0, 2).map((u) => (
            <button key={u} className="url-chip" title={'Vorschau: ' + u} onClick={() => usePreview.getState().openPreview(u)} data-testid="url-chip">
              ▸ {shortUrl(u)}
            </button>
          ))}
          <QueueChip sessionId={session.id} open={queueOpen} onToggle={() => setQueueOpen((v) => !v)} />
          <span className="term-tools" onPointerDown={(e) => e.stopPropagation()}>
            <button className={`term-tool${shell ? ' on' : ''}`} title={shell ? 'Shell schließen' : 'Shell daneben öffnen (PowerShell im Projektordner)'} onClick={() => void toggleShell()} data-testid="term-split">
              <Icon name="terminal" size={13} />
            </button>
            <button className={`term-tool${settingsOpen ? ' on' : ''}`} title="Terminal-Einstellungen" onClick={() => setSettingsOpen((v) => !v)} data-testid="term-settings-btn">
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
            <TermPane id={shell.id} testId={`shell-${session.name}`} focused={isTop && active === 'shell'} label={shellExit !== undefined ? 'Shell (beendet)' : 'Shell'} />
          </div>
        )}
      </div>
      {queueOpen && <TermQueue sessionId={session.id} />}
      {statusBar && <TermStatus sessionId={session.id} startedAt={startedAt} />}
      {settingsOpen && <TermSettings onClose={() => setSettingsOpen(false)} />}
      {exitCode !== undefined && (
        <div className="term-overlay">
          <span className="dim">Session beendet{exitCode !== 0 ? ` (Code ${exitCode})` : ''}</span>
          <button className="btn primary" onClick={() => useSessions.getState().restart(session.id)}>
            <Icon name="restart" size={15} /> Neu starten
          </button>
        </div>
      )}
    </GlassWindow>
  )
}
