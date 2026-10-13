// Karten unten rechts und die Glocke mit Verlauf und Einstellungen.
import { useEffect, useRef, useState } from 'react'
import type { NoticeKind, NotifySettings } from '../../../shared/types'
import { clearLog, dismiss, openNotice, setPanel, useNotify, type Notice } from '../store/notifyStore'
import { useSettings } from '../store/settingsStore'
import { relTime } from '../util'
import { Toggle } from '../windows/AmbienceMenu'
import { Icon } from './icons'
import { UpdateToast } from './UpdateToast'
import { PermissionCards } from './PermissionCards'
import './notify.css'

const KIND_DOT: Record<Notice['kind'], string> = { waiting: 'waiting', done: 'done', error: 'error', info: '' }

function NoticeCard({ n }: { n: Notice }): React.JSX.Element {
  return (
    <div className={`ntoast k-${n.kind}`} role="status" data-testid={`ntoast-${n.kind}`}>
      <button className="ntoast-main" onClick={() => (n.onOpen ? openNotice(n) : undefined)} disabled={!n.onOpen}>
        {KIND_DOT[n.kind] && <span className={`dot ${KIND_DOT[n.kind]}`} />}
        <span className="ntoast-text">
          <b>{n.title}</b>
          {n.body && <span>{n.body}</span>}
        </span>
      </button>
      <button className="ntoast-x" onClick={() => dismiss(n.id)} aria-label="Schließen">
        <i className="gbtn-x" />
      </button>
      {!!n.actions?.length && (
        <div className="ntoast-actions">
          {n.actions.map((a) => (
            <button
              key={a.label}
              className={`btn small${a.primary ? ' primary' : ''}`}
              onClick={() => {
                dismiss(n.id)
                a.run()
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ToastStack(): React.JSX.Element {
  const toasts = useNotify((s) => s.toasts)
  const panel = useNotify((s) => s.panel)
  return (
    <div className="toast-stack" data-testid="toast-stack">
      <UpdateToast />
      <PermissionCards />
      {!panel && toasts.map((n) => <NoticeCard key={n.id} n={n} />)}
    </div>
  )
}

const KINDS: { id: NoticeKind; label: string }[] = [
  { id: 'waiting', label: 'Session wartet auf dich' },
  { id: 'done', label: 'Session ist fertig' },
  { id: 'error', label: 'Session abgestürzt' }
]

function NotifySettingsView(): React.JSX.Element | null {
  const s = useSettings((x) => x.s)
  const set = useSettings((x) => x.set)
  if (!s) return null
  const n = s.notify
  const put = (p: Partial<NotifySettings>): void => set({ notify: { ...n, ...p } })
  const row = (label: string, hint: string | null, on: boolean, change: (v: boolean) => void): React.JSX.Element => (
    <div className="nset-row">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <Toggle on={on} onChange={change} label={label} />
    </div>
  )
  return (
    <div className="nset">
      <h4>Wie</h4>
      {row('Karten unten rechts', null, n.toasts, (v) => put({ toasts: v }))}
      {row('Windows-Benachrichtigungen', 'wenn VibeDesk im Hintergrund ist', n.windows, (v) => put({ windows: v }))}
      {row('Ton', 'wenn eine Session auf dich wartet', s.chimeOn, (v) => set({ chimeOn: v }))}
      {row('Ruhe in Fokus-Runden', 'nur Wichtiges sofort, der Rest danach', n.focusQuiet, (v) => put({ focusQuiet: v }))}
      <h4>Was</h4>
      {KINDS.map((k) => (
        <div key={k.id}>{row(k.label, null, n.kinds[k.id], (v) => put({ kinds: { ...n.kinds, [k.id]: v } }))}</div>
      ))}
    </div>
  )
}

export function NotifyPanel(): React.JSX.Element | null {
  const open = useNotify((s) => s.panel)
  const log = useNotify((s) => s.log)
  const [settings, setSettings] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return setSettings(false)
    const down = (e: PointerEvent): void => {
      const t = e.target as HTMLElement
      if (!ref.current?.contains(t) && !t.closest('[data-testid="dock-notify"]')) setPanel(false)
    }
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setPanel(false)
    }
    window.addEventListener('pointerdown', down)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('keydown', key)
    }
  }, [open])

  if (!open) return null
  return (
    <div className="npanel" ref={ref} data-testid="notify-panel">
      <div className="npanel-head">
        <h4>{settings ? 'Einstellungen' : 'Mitteilungen'}</h4>
        {!settings && log.length > 0 && (
          <button className="btn small ghost" onClick={clearLog}>
            Leeren
          </button>
        )}
        <button className={`btn small ghost${settings ? ' on' : ''}`} onClick={() => setSettings((v) => !v)} title="Einstellungen" data-testid="notify-settings">
          <Icon name={settings ? 'back' : 'gear'} size={14} />
        </button>
      </div>
      {settings ? (
        <NotifySettingsView />
      ) : log.length ? (
        <ul className="nlist">
          {log.map((n) => (
            <li key={n.id}>
              <button onClick={() => openNotice(n)} disabled={!n.onOpen}>
                <span className={`dot ${KIND_DOT[n.kind]}`} />
                <span className="ntoast-text">
                  <b>{n.title}</b>
                  {n.body && <span>{n.body}</span>}
                </span>
                <time>{relTime(n.time)}</time>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="panel-empty">
          Alles ruhig.
          <br />
          Hier landet, was deine Sessions dir melden.
        </div>
      )}
    </div>
  )
}
