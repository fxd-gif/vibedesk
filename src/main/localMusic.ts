// Eigene Musik: Ordner wählen, Audiodateien einlesen und über vibedesk-music:// abspielen – nur Dateien im gewählten Ordner.
import { t } from '../shared/i18n'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'
import { audioMime, filterTracks, isAudioFile, MAX_TRACKS, trackFromUrl, type ScanResult } from '../shared/localMusic'

/** Ordner durchsuchen begrenzt: so bleibt auch „C:\“ als Versehen harmlos */
const MAX_DIRS = 4000
const MAX_DEPTH = 8

/** Audiodateien im Ordner und seinen Unterordnern (relativ, mit /) – ohne versteckte Ordner und Verknüpfungen */
export async function scanMusicDir(root: string, limit = MAX_TRACKS): Promise<ScanResult> {
  try {
    if (!root || !fs.statSync(root).isDirectory()) return { ok: false, reason: 'missing' }
  } catch {
    return { ok: false, reason: 'missing' }
  }
  const found: string[] = []
  const queue: { abs: string; rel: string; depth: number }[] = [{ abs: root, rel: '', depth: 0 }]
  let dirs = 0
  let more = false
  while (queue.length && dirs < MAX_DIRS) {
    const d = queue.shift()!
    dirs++
    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(d.abs, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      const rel = d.rel ? `${d.rel}/${e.name}` : e.name
      if (e.isDirectory()) {
        if (d.depth < MAX_DEPTH) queue.push({ abs: path.join(d.abs, e.name), rel, depth: d.depth + 1 })
      } else if (e.isFile() && isAudioFile(e.name)) {
        // ein paar mehr sammeln, damit „mehr als 2000“ ehrlich erkannt wird
        if (found.length > limit) more = true
        else found.push(rel)
      }
    }
    if (more) break
  }
  const { tracks, truncated } = filterTracks(found, limit)
  if (!tracks.length) return { ok: false, reason: 'empty' }
  return { ok: true, tracks, truncated: truncated || more }
}

/** Löst eine vibedesk-music-URL sicher auf eine Audiodatei innerhalb von root auf */
export function musicFile(root: string, url: string): string | null {
  if (!root) return null
  const rel = trackFromUrl(url)
  if (!rel) return null
  const base = path.resolve(root)
  const abs = path.resolve(base, ...rel.split('/'))
  const inside = path.relative(base, abs)
  if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) return null
  try {
    // keine Verknüpfungen aus dem Ordner heraus
    const real = fs.realpathSync(abs)
    const realBase = fs.realpathSync(base)
    const r = path.relative(realBase, real)
    if (!r || r.startsWith('..') || path.isAbsolute(r) || !fs.statSync(real).isFile()) return null
    return real
  } catch {
    return null
  }
}

/** Antwort mit Range-Unterstützung – sonst kann das Audio-Element nicht springen */
export function serveMusic(file: string, range: string | null): Response {
  const size = fs.statSync(file).size
  const type = audioMime(file)
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]))
    let end = m[1] && m[2] ? Number(m[2]) : size - 1
    end = Math.min(end, size - 1)
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } })
    start = Math.max(0, start)
    const body = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream
    return new Response(body, {
      status: 206,
      headers: { 'content-type': type, 'content-length': String(end - start + 1), 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes' }
    })
  }
  const body = Readable.toWeb(fs.createReadStream(file)) as ReadableStream
  return new Response(body, { status: 200, headers: { 'content-type': type, 'content-length': String(size), 'accept-ranges': 'bytes' } })
}

export function registerMusicIpc(currentDir: () => string): void {
  ipcMain.handle('music:pickDir', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const cur = currentDir()
    const opts: Electron.OpenDialogOptions = {
      title: t('Musikordner wählen'),
      properties: ['openDirectory'],
      defaultPath: cur && fs.existsSync(cur) ? cur : undefined
    }
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })
  // nur der Ordner aus den Einstellungen – der Renderer kann so keine beliebigen Ordner auflisten
  ipcMain.handle('music:scan', (_e, dir: unknown): Promise<ScanResult> | ScanResult =>
    typeof dir === 'string' && dir && dir === currentDir() ? scanMusicDir(dir) : { ok: false, reason: 'denied' }
  )
}
