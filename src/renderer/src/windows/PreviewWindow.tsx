import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { GlassWindow } from '../desktop/GlassWindow'
import { Icon } from '../desktop/icons'
import { inform } from '../store/notifyStore'
import { askClaudeFromPreview, previewWin, usePreview } from '../store/previewStore'
import { CANCEL_PICK_SCRIPT, consoleError, errorsPrompt, PICK_SCRIPT, pickPrompt, pushError, type PickedElement, type PreviewError } from './previewTools'
import { t } from '../../../shared/i18n'

interface WebviewEl extends HTMLElement {
  reload(): void
  goBack(): void
  canGoBack(): boolean
  getURL(): string
  loadURL(url: string): Promise<void>
  executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>
  capturePage(rect?: { x: number; y: number; width: number; height: number }): Promise<{ toDataURL(): string; isEmpty(): boolean }>
}

const sentText = (r: 'sent' | 'queued' | 'none'): string =>
  r === 'sent' ? t('An Claude geschickt') : r === 'queued' ? t('Claude arbeitet noch – vorgemerkt, geht danach los') : t('Keine Claude-Session offen – starte zuerst eine')

/** Element ausgewählt → kurz sagen, was anders werden soll */
function PickComposer({ pick, onSend, onCancel }: { pick: PickedElement; onSend(wish: string): void; onCancel(): void }): React.JSX.Element {
  const [wish, setWish] = useState('')
  return (
    <div className="pv-compose" data-testid="preview-compose">
      <div className="dim small mono pv-sel" title={pick.selector}>
        {pick.selector}
      </div>
      {pick.text && <div className="small pv-text">„{pick.text.slice(0, 120)}“</div>}
      <textarea
        className="field small"
        autoFocus
        rows={2}
        placeholder={t('Was soll Claude daran ändern? z. B. „größer und in Grün“')}
        value={wish}
        onChange={(e) => setWish(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter' && !e.shiftKey && wish.trim()) {
            e.preventDefault()
            onSend(wish)
          }
          if (e.key === 'Escape') onCancel()
        }}
        data-testid="preview-wish"
      />
      <div className="row">
        <span style={{ flex: 1 }} />
        <button className="btn small ghost" onClick={onCancel}>
          {t('Abbrechen')}
        </button>
        <button className="btn small primary" disabled={!wish.trim()} onClick={() => onSend(wish)} data-testid="preview-send">
          {t('An Claude')}
        </button>
      </div>
    </div>
  )
}

function normalize(input: string): string {
  const v = input.trim()
  if (!v) return ''
  if (/^\d{2,5}$/.test(v)) return `http://localhost:${v}`
  if (/^https?:\/\//i.test(v)) return v
  return 'http://' + v
}

export function PreviewWindow({ id }: { id: string }): React.JSX.Element {
  const url = usePreview((s) => s.open[id] ?? '')
  const { setUrl, closePreview } = usePreview.getState()
  const [input, setInput] = useState(url)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const ref = useRef<WebviewEl>(null)
  const [errors, setErrors] = useState<PreviewError[]>([])
  const [showErrors, setShowErrors] = useState(false)
  const [picking, setPicking] = useState(false)
  const [pick, setPick] = useState<PickedElement | null>(null)

  useEffect(() => setInput(url), [url])

  useEffect(() => {
    const wv = ref.current
    if (!wv) return
    const nav = (e: Event & { url?: string }): void => {
      if (e.url) setInput(e.url)
    }
    const start = (): void => {
      setLoading(true)
      setFailed(null)
    }
    const stop = (): void => setLoading(false)
    const onConsole = (e: Event & { level?: unknown; message?: unknown; line?: unknown; sourceId?: unknown }): void => {
      const err = consoleError(e)
      if (err) setErrors((l) => pushError(l, err))
    }
    // neue Seite → alte Fehler sind Geschichte
    const onNavigate = (): void => setErrors([])
    let retries = 0
    let retry: ReturnType<typeof setTimeout> | undefined
    const fail = (e: Event & { errorCode?: number; errorDescription?: string; isMainFrame?: boolean }): void => {
      if (e.isMainFrame === false || e.errorCode === -3) return
      // Server gibt seine Adresse oft aus, kurz bevor er lauscht (Verbindung abgelehnt/leer) – kurz weiter probieren
      if ((e.errorCode === -102 || e.errorCode === -324 || e.errorCode === -101) && retries < 12) {
        retries++
        setFailed(null)
        setLoading(true)
        retry = setTimeout(() => wv.reload(), 1000)
        return
      }
      setFailed(e.errorDescription || t('Seite nicht erreichbar'))
    }
    wv.addEventListener('did-navigate', nav)
    wv.addEventListener('did-navigate-in-page', nav)
    wv.addEventListener('did-start-loading', start)
    wv.addEventListener('did-stop-loading', stop)
    wv.addEventListener('did-fail-load', fail)
    wv.addEventListener('console-message', onConsole)
    wv.addEventListener('did-navigate', onNavigate)
    return () => {
      clearTimeout(retry)
      wv.removeEventListener('console-message', onConsole)
      wv.removeEventListener('did-navigate', onNavigate)
      wv.removeEventListener('did-navigate', nav)
      wv.removeEventListener('did-navigate-in-page', nav)
      wv.removeEventListener('did-start-loading', start)
      wv.removeEventListener('did-stop-loading', stop)
      wv.removeEventListener('did-fail-load', fail)
    }
  }, [url])

  const current = (): string => ref.current?.getURL() || url

  const startPick = async (): Promise<void> => {
    const wv = ref.current
    if (!wv) return
    if (picking) {
      void wv.executeJavaScript(CANCEL_PICK_SCRIPT).catch(() => undefined)
      return
    }
    setPick(null)
    setPicking(true)
    try {
      const r = (await wv.executeJavaScript(PICK_SCRIPT, true)) as PickedElement | null
      if (r && typeof r.selector === 'string') setPick(r)
    } catch {
      /* Seite gewechselt */
    } finally {
      setPicking(false)
    }
  }

  const sendPick = async (wish: string): Promise<void> => {
    const p = pick
    const wv = ref.current
    if (!p) return
    setPick(null)
    let shot: string | undefined
    try {
      const pad = 6
      const img = await wv?.capturePage({
        x: Math.max(0, Math.floor(p.rect.x - pad)),
        y: Math.max(0, Math.floor(p.rect.y - pad)),
        width: Math.max(1, Math.ceil(p.rect.w + pad * 2)),
        height: Math.max(1, Math.ceil(p.rect.h + pad * 2))
      })
      if (img && !img.isEmpty()) shot = (await api.preview.saveShot(img.toDataURL())) ?? undefined
    } catch {
      /* ohne Bild geht es auch */
    }
    inform(sentText(askClaudeFromPreview(current(), pickPrompt(current(), p, wish, shot))))
  }

  const sendErrors = (): void => {
    setShowErrors(false)
    const r = askClaudeFromPreview(current(), errorsPrompt(current(), errors))
    if (r !== 'none') setErrors([])
    inform(sentText(r))
  }

  const go = (): void => {
    const u = normalize(input)
    if (u) setUrl(id, u)
  }

  return (
    <GlassWindow id={previewWin(id)} solid minW={420} minH={300} onClose={() => closePreview(id)} title={<><Icon name="globe" size={14} /> {t('Vorschau')}</>}>
      <div className="preview">
        <div className="preview-bar">
          <button className="gbtn" title={t('Zurück')} onClick={() => ref.current?.canGoBack() && ref.current.goBack()}>
            <Icon name="back" size={15} />
          </button>
          <button className="gbtn" title={t('Neu laden')} onClick={() => ref.current?.reload()}>
            <Icon name="restart" size={14} />
          </button>
          <input
            className="field small mono"
            value={input}
            placeholder={t('localhost:5173 oder Port')}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && go()}
          />
          {loading && <span className="spin" />}
          <button
            className={`gbtn pv-pick${picking ? ' on' : ''}`}
            title={t('Zeig drauf: Element anklicken und Claude sagen, was anders werden soll (Esc bricht ab)')}
            disabled={!url}
            onClick={() => void startPick()}
            data-testid="preview-pick"
          >
            <Icon name="inspect" size={14} />
          </button>
          {errors.length > 0 && (
            <button className="pv-errs" title={t('Fehler in der Browser-Konsole')} onClick={() => setShowErrors((v) => !v)} data-testid="preview-errors">
              ⚠ {errors.reduce((n, e) => n + e.count, 0)}
            </button>
          )}
          <button className="gbtn" title={t('Im Browser öffnen')} disabled={!url} onClick={() => api.openExternal(ref.current?.getURL() || url)}>
            <Icon name="external" size={14} />
          </button>
        </div>
        <div className="preview-body">
          {url ? (
            <webview ref={ref} src={url} partition="persist:vibedesk-preview" className="preview-view" />
          ) : (
            <div className="panel-empty">{t('Gib eine Adresse oder einen Port ein – oder klick im Terminal auf einen erkannten Dev-Server.')}</div>
          )}
          {picking && <div className="pv-hint">{t('Zeig auf ein Element und klick drauf · Esc bricht ab')}</div>}
          {pick && <PickComposer pick={pick} onSend={(w) => void sendPick(w)} onCancel={() => setPick(null)} />}
          {showErrors && errors.length > 0 && (
            <div className="pv-errlist" data-testid="preview-errlist">
              {errors.slice(0, 6).map((e, i) => (
                <div key={i} className="pv-err mono">
                  {e.message.slice(0, 220)}
                  {e.count > 1 && <span className="dim"> ×{e.count}</span>}
                </div>
              ))}
              <div className="row">
                <button className="btn small ghost" onClick={() => setErrors([])}>
                  {t('Leeren')}
                </button>
                <span style={{ flex: 1 }} />
                <button className="btn small primary" onClick={sendErrors} data-testid="preview-errors-send">
                  {t('Claude soll das beheben')}
                </button>
              </div>
            </div>
          )}
          {failed && (
            <div className="preview-fail">
              <b>{t('Nicht erreichbar')}</b>
              <span className="dim">{failed}</span>
              <button className="btn small" onClick={() => ref.current?.reload()}>
                {t('Erneut versuchen')}
              </button>
            </div>
          )}
        </div>
      </div>
    </GlassWindow>
  )
}
