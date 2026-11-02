// Werkzeug-Fenster: Claudes kleine Anwendung im Sandbox-iframe (kein Zugriff auf VibeDesk, kein Netz).
// Daten bekommt sie nur über diese Brücke – lesend – und ihren eigenen kleinen Speicher.
import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { GlassWindow } from '../desktop/GlassWindow'
import { Icon } from '../desktop/icons'
import { appData, onAppData } from '../store/appsStore'
import { enqueue } from '../store/queueStore'
import { sendToSession } from '../store/sessionPrompt'
import { termWin, useSessions } from '../store/sessionStore'
import { useUi } from '../store/uiStore'
import { useWorkflow } from '../store/workflowStore'
import { agentOf } from '../../../shared/agents'
import { appWin, isAppDataKind, type DeskApp } from '../../../shared/apps'
import { t } from '../../../shared/i18n'

/** höchstens so oft schickt ein Fenster neue Daten an die App */
const PUSH_MS = 800

/** Auftrag an die oberste Claude-Session (sonst die erste); läuft sie gerade, kommt er in die Warteschlange */
function askClaude(text: string): 'sent' | 'queued' | 'none' {
  const sessions = useSessions.getState().sessions.filter((s) => agentOf(s) === 'claude')
  const open = useUi.getState().open
  const top = [...open].reverse().find((w) => sessions.some((s) => termWin(s.id) === w))
  const s = sessions.find((x) => termWin(x.id) === top) ?? sessions[0]
  if (!s) return 'none'
  const st = useWorkflow.getState().sessions[s.id]?.status
  if (st === 'working' || st === 'waiting') {
    enqueue(s.id, text)
    return 'queued'
  }
  sendToSession(s.id, text, true)
  return 'sent'
}

export function AppWindow({ app }: { app: DeskApp }): React.JSX.Element {
  const ref = useRef<HTMLIFrameElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [asked, setAsked] = useState<string | null>(null)
  const src = `vibedesk-scene://app/${encodeURIComponent(app.id)}/index.html?rev=${app.rev}`

  useEffect(() => {
    setError(null)
    setAsked(null)
    const post = (msg: Record<string, unknown>): void => ref.current?.contentWindow?.postMessage({ vdApp: true, ...msg }, '*')
    const subs: (() => void)[] = []
    const watched = new Set<string>()
    const last = new Map<string, string>()
    const timers = new Map<string, ReturnType<typeof setTimeout>>()

    /** neue Daten nur schicken, wenn sie sich wirklich geändert haben – gedrosselt */
    const push = (what: Parameters<typeof appData>[0]): void => {
      if (timers.has(what)) return
      timers.set(
        what,
        setTimeout(() => {
          timers.delete(what)
          void appData(what).then((value) => {
            const json = JSON.stringify(value ?? null)
            if (last.get(what) === json) return
            last.set(what, json)
            post({ type: 'push', what, value })
          })
        }, PUSH_MS)
      )
    }

    const onMsg = (e: MessageEvent): void => {
      if (e.source !== ref.current?.contentWindow) return
      const m = e.data as { vdApp?: boolean; type?: string; ok?: boolean; error?: string; req?: number; op?: string; what?: unknown; key?: unknown; value?: unknown }
      if (!m || !m.vdApp) return
      if (m.type === 'status') {
        api.apps.status({ id: app.id, rev: app.rev, ok: !!m.ok, error: m.error })
        setError(m.ok ? null : (m.error ?? t('unbekannter Fehler')))
        return
      }
      if (m.type === 'watch' && isAppDataKind(m.what) && !watched.has(m.what)) {
        const what = m.what
        watched.add(what)
        subs.push(onAppData(what, () => push(what)))
        return
      }
      if (m.type !== 'req' || typeof m.req !== 'number') return
      const reply = (p: Promise<unknown>): void =>
        void p.then(
          (value) => {
            if (m.op === 'data' && isAppDataKind(m.what)) last.set(m.what, JSON.stringify(value ?? null))
            post({ type: 'res', req: m.req, ok: true, value })
          },
          (err: unknown) => post({ type: 'res', req: m.req, ok: false, error: err instanceof Error ? err.message : String(err) })
        )
      if (m.op === 'data') reply(isAppDataKind(m.what) ? appData(m.what) : Promise.reject(new Error(t('Unbekannte Daten: {what}', { what: String(m.what) }))))
      else if (m.op === 'store.get' && typeof m.key === 'string') reply(api.apps.storeGet(app.id, m.key))
      else if (m.op === 'store.set' && typeof m.key === 'string') reply(api.apps.storeSet(app.id, m.key, m.value))
      else reply(Promise.reject(new Error(t('Unbekannte Anfrage'))))
    }
    window.addEventListener('message', onMsg)
    return () => {
      window.removeEventListener('message', onMsg)
      subs.forEach((f) => f())
      timers.forEach((x) => clearTimeout(x))
    }
  }, [app.id, app.rev])

  const repair = (): void => {
    const r = askClaude(t('Das Werkzeug-Fenster „{name}“ (id {id}) meldet einen Fehler: {error}\nSieh dir den Code mit desk_app_code an, behebe den Fehler mit desk_app_create (id angeben) und prüfe es mit desk_app_snapshot.', { name: app.name, id: app.id, error: error ?? '' }))
    setAsked(r === 'sent' ? t('An Claude geschickt') : r === 'queued' ? t('Claude arbeitet noch – vorgemerkt, geht danach los') : t('Keine Claude-Session offen – starte zuerst eine'))
  }

  return (
    <GlassWindow
      id={appWin(app.id)}
      minW={280}
      minH={180}
      title={
        <>
          <Icon name="spark" size={14} /> {app.name}
        </>
      }
    >
      <div className="app-frame-wrap">
        <iframe ref={ref} className="app-frame" src={src} sandbox="allow-scripts" title={app.name} data-app-frame={app.id} data-testid={`app-frame-${app.id}`} />
        {error && (
          <div className="app-error" data-testid="app-error">
            <span className="mono small">{error}</span>
            <button className="btn small primary" onClick={repair} disabled={!!asked}>
              <Icon name="spark" size={13} /> {asked ?? t('Claude reparieren lassen')}
            </button>
          </div>
        )}
      </div>
    </GlassWindow>
  )
}
