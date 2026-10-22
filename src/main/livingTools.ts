// MCP-Werkzeuge für lebende Szenen: Claude legt Szenen an, sieht sie per Schnappschuss und bessert nach.
import { randomUUID } from 'crypto'
import { ipcMain } from 'electron'
import { LIVING_PREFIX, isLivingScene, livingId, validLivingId, type LivingStatus } from '../shared/living'
import type { DeskCommand } from '../shared/desk'
import type { LivingStore } from './livingScenes'

export interface ToolResult {
  text: string
  isError?: boolean
  /** Bild für Claude (MCP-Inhalt vom Typ image) */
  image?: { data: string; mimeType: string }
}

interface Deps {
  store: LivingStore
  send(channel: string, ...args: unknown[]): void
  /** aktuelle Szene aus den Einstellungen */
  scene(): string
  /** Datei des aktuellen eigenen Hintergrundbilds (custom:…), sonst null */
  currentImageFile(): string | null
}

const STATUS_WAIT_MS = 6000
const SNAP_WAIT_MS = 8000

export function createLivingTools(d: Deps) {
  const snaps = new Map<string, (r: { data?: string; error?: string }) => void>()
  ipcMain.handle('living:list', () => d.store.list())
  ipcMain.on('living:status', (_e, s: LivingStatus) => {
    if (s && validLivingId(s.id) && typeof s.rev === 'number') d.store.report({ id: s.id, rev: s.rev, ok: !!s.ok, error: typeof s.error === 'string' ? s.error.slice(0, 600) : undefined })
  })
  ipcMain.on('living:snapshotResult', (_e, req: unknown, data: unknown, error: unknown) => {
    const f = typeof req === 'string' ? snaps.get(req) : undefined
    if (f) f({ data: typeof data === 'string' ? data : undefined, error: typeof error === 'string' ? error : undefined })
  })
  ipcMain.handle('living:delete', (_e, id: unknown) => remove(id))

  const changed = (): void => d.send('living:changed', d.store.list())
  const show = (scene: string): void => d.send('desk:command', { cmd: 'scene', scene } satisfies DeskCommand)

  function remove(id: unknown): boolean {
    if (!validLivingId(id) || !d.store.delete(id)) return false
    if (d.scene() === LIVING_PREFIX + id) show('city')
    changed()
    return true
  }

  async function create(a: Record<string, unknown>): Promise<ToolResult> {
    let imagePath: string | null | 'keep' | undefined
    if (a.image === undefined || a.image === 'keep') imagePath = a.id ? 'keep' : undefined
    else if (a.image === 'none' || a.image === null) imagePath = null
    else if (a.image === 'current') {
      const cur = d.currentImageFile()
      if (!cur) return { text: 'Es ist gerade kein eigenes Hintergrundbild eingestellt. Gib einen Pfad zu einem Bild an oder lass image weg.', isError: true }
      imagePath = cur
    } else if (typeof a.image === 'string') imagePath = a.image
    let scene
    try {
      scene = d.store.save({ id: a.id, name: a.name, code: a.code, imagePath })
    } catch (err) {
      return { text: err instanceof Error ? err.message : String(err), isError: true }
    }
    changed()
    if (a.activate !== false) show(LIVING_PREFIX + scene.id)
    const head = `Szene „${scene.name}“ gespeichert (id: ${scene.id})${scene.imageSize ? `, Bild ${scene.imageSize.w}×${scene.imageSize.h}` : scene.image ? ', mit Bild' : ', ohne Bild'}.`
    if (a.activate === false) return { text: head + ' Nicht eingeschaltet.' }
    const st = await d.store.waitStatus(scene.id, scene.rev, STATUS_WAIT_MS)
    if (!st) return { text: head + ' Eingeschaltet, aber noch keine Rückmeldung (VibeDesk minimiert?). Prüfe sie mit desk_scene_snapshot.' }
    if (!st.ok) return { text: `${head}\nFEHLER im Skript: ${st.error ?? 'unbekannt'}\nKorrigiere den Code und rufe desk_scene_create mit id „${scene.id}“ erneut auf.`, isError: true }
    return { text: head + ' Läuft. Mit desk_scene_snapshot siehst du, wie es aussieht (bei Schnee ein paar Sekunden warten lassen, damit er sich sammelt).' }
  }

  async function snapshot(a: Record<string, unknown>): Promise<ToolResult> {
    if (!isLivingScene(d.scene())) return { text: 'Gerade läuft keine lebende Szene. Schalte eine mit desk_scene_create oder desk_scene_show ein.', isError: true }
    const wait = typeof a.wait === 'number' && Number.isFinite(a.wait) ? Math.min(30, Math.max(0, a.wait)) : 0
    if (wait) await new Promise((r) => setTimeout(r, wait * 1000))
    const req = randomUUID()
    const r = await new Promise<{ data?: string; error?: string } | null>((resolve) => {
      const timer = setTimeout(() => {
        snaps.delete(req)
        resolve(null)
      }, SNAP_WAIT_MS)
      snaps.set(req, (x) => {
        clearTimeout(timer)
        snaps.delete(req)
        resolve(x)
      })
      d.send('living:snapshot', req)
    })
    if (!r) return { text: 'Keine Antwort von der Szene (VibeDesk minimiert oder Szene hängt).', isError: true }
    if (r.error || !r.data) return { text: `Schnappschuss fehlgeschlagen: ${r.error ?? 'leer'}`, isError: true }
    const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(r.data)
    if (!m) return { text: 'Schnappschuss in unbekanntem Format.', isError: true }
    return { text: `So sieht die Szene „${livingId(d.scene())}“ gerade aus (ohne die Fenster davor).`, image: { mimeType: m[1], data: m[2] } }
  }

  /** desk_scene_* → Ergebnis für Claude; null = kein Szenen-Werkzeug */
  return async function livingTool(tool: string, a: Record<string, unknown>): Promise<ToolResult | null> {
    switch (tool) {
      case 'desk_scene_create':
        return create(a)
      case 'desk_scene_snapshot':
        return snapshot(a)
      case 'desk_scene_list': {
        const list = d.store.list()
        if (!list.length) return { text: 'Noch keine lebenden Szenen. Lege eine mit desk_scene_create an.' }
        const cur = d.scene()
        return { text: list.map((s) => `- ${s.id}: „${s.name}“${s.imageSize ? ` (Bild ${s.imageSize.w}×${s.imageSize.h})` : s.image ? ' (mit Bild)' : ''}${cur === LIVING_PREFIX + s.id ? ' – läuft gerade' : ''}`).join('\n') }
      }
      case 'desk_scene_code': {
        const id = a.id
        const code = validLivingId(id) ? d.store.code(id) : null
        return code === null ? { text: 'Keine Szene mit dieser id (siehe desk_scene_list).', isError: true } : { text: code }
      }
      case 'desk_scene_show': {
        const id = a.id
        if (!validLivingId(id) || !d.store.meta(id)) return { text: 'Keine Szene mit dieser id (siehe desk_scene_list).', isError: true }
        show(LIVING_PREFIX + id)
        return { text: `Szene „${id}“ eingeschaltet.` }
      }
      case 'desk_scene_delete':
        return remove(a.id) ? { text: 'Szene gelöscht.' } : { text: 'Keine Szene mit dieser id.', isError: true }
      default:
        return null
    }
  }
}
