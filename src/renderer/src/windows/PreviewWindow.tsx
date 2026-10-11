import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { GlassWindow } from '../desktop/GlassWindow'
import { Icon } from '../desktop/icons'
import { previewWin, usePreview } from '../store/previewStore'

interface WebviewEl extends HTMLElement {
  reload(): void
  goBack(): void
  canGoBack(): boolean
  getURL(): string
  loadURL(url: string): Promise<void>
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
    const fail = (e: Event & { errorCode?: number; errorDescription?: string; isMainFrame?: boolean }): void => {
      if (e.isMainFrame === false || e.errorCode === -3) return
      setFailed(e.errorDescription || 'Seite nicht erreichbar')
    }
    wv.addEventListener('did-navigate', nav)
    wv.addEventListener('did-navigate-in-page', nav)
    wv.addEventListener('did-start-loading', start)
    wv.addEventListener('did-stop-loading', stop)
    wv.addEventListener('did-fail-load', fail)
    return () => {
      wv.removeEventListener('did-navigate', nav)
      wv.removeEventListener('did-navigate-in-page', nav)
      wv.removeEventListener('did-start-loading', start)
      wv.removeEventListener('did-stop-loading', stop)
      wv.removeEventListener('did-fail-load', fail)
    }
  }, [url])

  const go = (): void => {
    const u = normalize(input)
    if (u) setUrl(id, u)
  }

  return (
    <GlassWindow id={previewWin(id)} solid minW={420} minH={300} onClose={() => closePreview(id)} title={<><Icon name="globe" size={14} /> Vorschau</>}>
      <div className="preview">
        <div className="preview-bar">
          <button className="gbtn" title="Zurück" onClick={() => ref.current?.canGoBack() && ref.current.goBack()}>
            <Icon name="back" size={15} />
          </button>
          <button className="gbtn" title="Neu laden" onClick={() => ref.current?.reload()}>
            <Icon name="restart" size={14} />
          </button>
          <input
            className="field small mono"
            value={input}
            placeholder="localhost:5173 oder Port"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && go()}
          />
          {loading && <span className="spin" />}
          <button className="gbtn" title="Im Browser öffnen" disabled={!url} onClick={() => api.openExternal(ref.current?.getURL() || url)}>
            <Icon name="external" size={14} />
          </button>
        </div>
        <div className="preview-body">
          {url ? (
            <webview ref={ref} src={url} partition="persist:vibedesk-preview" className="preview-view" />
          ) : (
            <div className="panel-empty">Gib eine Adresse oder einen Port ein – oder klick im Terminal auf einen erkannten Dev-Server.</div>
          )}
          {failed && (
            <div className="preview-fail">
              <b>Nicht erreichbar</b>
              <span className="dim">{failed}</span>
              <button className="btn small" onClick={() => ref.current?.reload()}>
                Erneut versuchen
              </button>
            </div>
          )}
        </div>
      </div>
    </GlassWindow>
  )
}
