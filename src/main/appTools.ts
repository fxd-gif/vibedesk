// MCP-Werkzeuge für Werkzeug-Fenster: Claude baut ein kleines Fenster, sieht es per Schnappschuss an und bessert nach.
// Dazu die IPC-Seite für den Renderer (Liste, Löschen, Status, eigener Speicher, Gehirn-Notizen lesen).
import { randomUUID } from 'crypto'
import { ipcMain, type BrowserWindow } from 'electron'
import { validAppId, type AppStatus } from '../shared/apps'
import type { ToolResult } from './livingTools'
import type { AppStore } from './appStore'

interface Deps {
  store: AppStore
  send(channel: string, ...args: unknown[]): void
  win(): BrowserWindow | null
  /** Gehirn-Notizen eines Projekts, nur lesend und gekürzt */
  brainNotes(projectId: string): unknown
}

const STATUS_WAIT_MS = 6000
const RECT_WAIT_MS = 4000
const SNAP_MAX_W = 1100

export function createAppTools(d: Deps) {
  const rects = new Map<string, (r: { x: number; y: number; width: number; height: number } | null) => void>()
  const changed = (): void => d.send('apps:changed', d.store.list())
  const open = (id: string): void => d.send('apps:open', id)

  ipcMain.handle('apps:list', () => d.store.list())
  ipcMain.handle('apps:delete', (_e, id: unknown) => remove(id))
  ipcMain.on('apps:status', (_e, s: AppStatus) => {
    if (s && validAppId(s.id) && typeof s.rev === 'number') d.store.report({ id: s.id, rev: s.rev, ok: !!s.ok, error: typeof s.error === 'string' ? s.error.slice(0, 600) : undefined })
  })
  ipcMain.handle('apps:storeGet', (_e, id: unknown, key: unknown) => (validAppId(id) && typeof key === 'string' ? d.store.storeGet(id, key) : undefined))
  ipcMain.handle('apps:storeSet', (_e, id: unknown, key: unknown, value: unknown) => {
    if (!validAppId(id) || typeof key !== 'string') throw new Error('ungültig')
    d.store.storeSet(id, key, value === null ? undefined : value)
    return true
  })
  ipcMain.handle('apps:brain', (_e, projectId: unknown) => (typeof projectId === 'string' ? d.brainNotes(projectId) : null))
  ipcMain.on('apps:rectResult', (_e, req: unknown, rect: unknown) => {
    const f = typeof req === 'string' ? rects.get(req) : undefined
    if (!f) return
    const r = rect as { x?: unknown; y?: unknown; width?: unknown; height?: unknown } | null
    const ok = r && [r.x, r.y, r.width, r.height].every((v) => typeof v === 'number' && Number.isFinite(v))
    f(ok ? { x: Math.round(r!.x as number), y: Math.round(r!.y as number), width: Math.round(r!.width as number), height: Math.round(r!.height as number) } : null)
  })

  function remove(id: unknown): boolean {
    if (!validAppId(id) || !d.store.delete(id)) return false
    changed()
    return true
  }

  async function create(a: Record<string, unknown>): Promise<ToolResult> {
    let app
    try {
      app = d.store.save({ id: a.id, name: a.name, hint: a.hint, html: a.html, code: a.code, css: a.css, w: a.w, h: a.h })
    } catch (err) {
      return { text: err instanceof Error ? err.message : String(err), isError: true }
    }
    changed()
    const head = `Werkzeug-Fenster „${app.name}“ gespeichert (id: ${app.id}, ${app.w}×${app.h}).`
    if (a.open === false) return { text: head + ' Nicht geöffnet – es steht im Mehr-Menü unter „Eigene Werkzeuge“.' }
    open(app.id)
    const st = await d.store.waitStatus(app.id, app.rev, STATUS_WAIT_MS)
    if (!st) return { text: head + ' Geöffnet, aber noch keine Rückmeldung (VibeDesk minimiert?). Prüfe es mit desk_app_snapshot.' }
    if (!st.ok) return { text: `${head}\nFEHLER: ${st.error ?? 'unbekannt'}\nKorrigiere und rufe desk_app_create mit id „${app.id}“ erneut auf (nur die geänderten Teile nötig).`, isError: true }
    return { text: head + ' Läuft und steht im Mehr-Menü unter „Eigene Werkzeuge“. Sieh es dir mit desk_app_snapshot an und bessere nach.' }
  }

  async function snapshot(a: Record<string, unknown>): Promise<ToolResult> {
    const id = a.id
    if (!validAppId(id) || !d.store.meta(id)) return { text: 'Kein Werkzeug-Fenster mit dieser id (siehe desk_app_list).', isError: true }
    const w = d.win()
    if (!w || w.isDestroyed()) return { text: 'VibeDesk-Fenster nicht da.', isError: true }
    const wait = typeof a.wait === 'number' && Number.isFinite(a.wait) ? Math.min(20, Math.max(0, a.wait)) : 0.6
    const req = randomUUID()
    // Renderer holt das Fenster nach vorn und meldet, wo es liegt
    const rect = await new Promise<{ x: number; y: number; width: number; height: number } | null>((resolve) => {
      const timer = setTimeout(() => {
        rects.delete(req)
        resolve(null)
      }, RECT_WAIT_MS)
      rects.set(req, (r) => {
        clearTimeout(timer)
        rects.delete(req)
        resolve(r)
      })
      d.send('apps:rect', req, id)
    })
    if (!rect || rect.width < 10 || rect.height < 10) return { text: 'Das Fenster ist gerade nicht zu sehen (VibeDesk minimiert?).', isError: true }
    await new Promise((r) => setTimeout(r, wait * 1000))
    let img = await w.webContents.capturePage(rect)
    if (img.isEmpty()) return { text: 'Schnappschuss leer (VibeDesk minimiert?).', isError: true }
    if (img.getSize().width > SNAP_MAX_W) img = img.resize({ width: SNAP_MAX_W })
    const st = d.store.lastStatus(id)
    const err = st && !st.ok ? `\nACHTUNG, letzter Fehler: ${st.error}` : ''
    return { text: `So sieht „${d.store.meta(id)!.name}“ gerade aus (mit Fensterrahmen).${err}`, image: { mimeType: 'image/png', data: img.toPNG().toString('base64') } }
  }

  /** desk_app_* → Ergebnis für Claude; null = kein Fenster-Werkzeug */
  return async function appTool(tool: string, a: Record<string, unknown>): Promise<ToolResult | null> {
    switch (tool) {
      case 'desk_app_create':
        return create(a)
      case 'desk_app_snapshot':
        return snapshot(a)
      case 'desk_app_list': {
        const list = d.store.list()
        if (!list.length) return { text: 'Noch keine Werkzeug-Fenster. Lege eins mit desk_app_create an.' }
        return { text: list.map((x) => `- ${x.id}: „${x.name}“${x.hint ? ` – ${x.hint}` : ''} (${x.w}×${x.h})`).join('\n') }
      }
      case 'desk_app_code': {
        const src = validAppId(a.id) ? d.store.source(a.id) : null
        if (!src) return { text: 'Kein Werkzeug-Fenster mit dieser id (siehe desk_app_list).', isError: true }
        return { text: `--- html ---\n${src.html}\n--- css ---\n${src.css}\n--- code ---\n${src.code}` }
      }
      case 'desk_app_open': {
        if (!validAppId(a.id) || !d.store.meta(a.id)) return { text: 'Kein Werkzeug-Fenster mit dieser id (siehe desk_app_list).', isError: true }
        open(a.id)
        return { text: 'Geöffnet.' }
      }
      case 'desk_app_delete':
        return remove(a.id) ? { text: 'Werkzeug-Fenster gelöscht.' } : { text: 'Kein Werkzeug-Fenster mit dieser id.', isError: true }
      default:
        return null
    }
  }
}
