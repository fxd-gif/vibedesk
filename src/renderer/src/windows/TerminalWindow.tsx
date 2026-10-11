import { useEffect, useRef } from 'react'
import '@xterm/xterm/css/xterm.css'
import { GlassWindow } from '../desktop/GlassWindow'
import { Icon } from '../desktop/icons'
import { confirm } from '../store/dialogStore'
import { termWin, useSessions } from '../store/sessionStore'
import { getTerminal } from '../store/terminals'
import { useUi } from '../store/uiStore'
import { useWorkflow } from '../store/workflowStore'
import type { SessionInfo } from '../../../shared/types'
import { shortUrl, usePreview } from '../store/previewStore'

export const STATUS_TEXT = {
  idle: 'bereit',
  working: 'arbeitet',
  waiting: 'wartet auf dich',
  done: 'fertig',
  error: 'Fehler'
} as const

export function TerminalWindow({ session }: { session: SessionInfo }): React.JSX.Element {
  const id = termWin(session.id)
  const host = useRef<HTMLDivElement>(null)
  const status = useWorkflow((s) => s.sessions[session.id]?.status ?? 'idle')
  const exitCode = useSessions((s) => s.exited[session.id])
  const rect = useUi((s) => s.rects[id])
  const maximized = useUi((s) => s.maximized === id)
  const isTop = useUi((s) => s.open[s.open.length - 1] === id)
  const urls = usePreview((s) => s.urls[session.id])

  useEffect(() => {
    const t = getTerminal(session.id)
    if (!t || !host.current) return
    if (!t.term.element) t.term.open(host.current)
    else host.current.appendChild(t.term.element)
    const ro = new ResizeObserver(() => {
      try {
        t.fit.fit()
      } catch {
        /* unsichtbar */
      }
    })
    ro.observe(host.current)
    return () => ro.disconnect()
  }, [session.id])

  useEffect(() => {
    try {
      getTerminal(session.id)?.fit.fit()
    } catch {
      /* noop */
    }
  }, [rect?.w, rect?.h, maximized])

  useEffect(() => {
    if (isTop) getTerminal(session.id)?.term.focus()
  }, [isTop, session.id])

  const close = async (): Promise<void> => {
    const running = exitCode === undefined
    if (running && !(await confirm({ title: `Session „${session.name}“ beenden?`, message: 'Claude Code wird in diesem Fenster gestoppt.', confirmLabel: 'Beenden', danger: true })))
      return
    useSessions.getState().close(session.id)
  }

  return (
    <GlassWindow
      id={id}
      solid
      minW={420}
      minH={220}
      onClose={close}
      title={
        <>
          <span className={`dot ${status}`} />
          <span>{session.name}</span>
          <span className="dim" style={{ fontWeight: 400 }}>
            · {STATUS_TEXT[status]}
          </span>
          {urls?.slice(0, 2).map((u) => (
            <button key={u} className="url-chip" title={'Vorschau: ' + u} onClick={() => usePreview.getState().openPreview(u)} data-testid="url-chip">
              ▸ {shortUrl(u)}
            </button>
          ))}
        </>
      }
    >
      <div className="term-host" ref={host} data-testid={`terminal-${session.name}`} />
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
