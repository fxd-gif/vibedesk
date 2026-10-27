// Main-Seite der Terminals: Shells (PowerShell/cmd) und Zwischenablage (Text oder Bild als Temp-Datei).
import { t } from '../shared/i18n'
import { BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import { createHash } from 'crypto'
import fs from 'fs'
import { join } from 'path'
import type { ShellManager } from './shellManager'
import type { ProjectStore } from './projectStore'

const DAY_MS = 24 * 3600_000
/** so lange wartet VibeDesk auf den Ausschnitt */
const SNIP_TIMEOUT_MS = 60_000
const SNIP_POLL_MS = 300

/** Fingerabdruck des Bildes in der Zwischenablage (leer = kein Bild) */
async function clipboardImage(): Promise<{ key: string; data: Buffer; ext: string } | null> {
  for (const item of await clipboard.read()) {
    const type = item.types.find((x) => /^image\/(png|jpeg|gif|webp)$/.test(x))
    if (!type) continue
    const data = Buffer.from(await ((await item.getType(type)) as Blob).arrayBuffer())
    return { key: createHash('sha1').update(data).digest('hex'), data, ext: type === 'image/jpeg' ? 'jpg' : type.slice(6) }
  }
  return null
}

/**
 * Wartet, bis ein neues Bild in der Zwischenablage liegt (anderer Fingerabdruck als vorher).
 * Endet ohne Bild nach dem Zeitlimit oder wenn `stop()` wahr wird (z. B. VibeDesk wieder im Vordergrund).
 */
export async function waitForNewImage<T extends { key: string }>(o: { before: string | null; read(): Promise<T | null> | T | null; stop(): boolean; sleep(ms: number): Promise<void>; timeoutMs?: number; pollMs?: number }): Promise<T | null> {
  const limit = o.timeoutMs ?? SNIP_TIMEOUT_MS
  const step = o.pollMs ?? SNIP_POLL_MS
  for (let waited = 0; waited < limit; waited += step) {
    await o.sleep(step)
    const img = await Promise.resolve()
      .then(() => o.read())
      .catch(() => null)
    if (img && img.key !== o.before) return img
    if (o.stop()) return null
  }
  return null
}

/** Eingefügte Bilder landen hier; älter als ein Tag wird beim Start aufgeräumt */
export function cleanPasteDir(dir: string, now = Date.now()): void {
  try {
    for (const f of fs.readdirSync(dir)) {
      const p = join(dir, f)
      if (now - fs.statSync(p).mtimeMs > DAY_MS) fs.rmSync(p, { force: true })
    }
  } catch {
    /* Ordner gibt es noch nicht */
  }
}

export function registerTerminalIpc(d: { shells: ShellManager; projects: ProjectStore; pasteDir: string }): void {
  cleanPasteDir(d.pasteDir)

  ipcMain.handle('terminal:readClipboard', async () => {
    const text = await clipboard.readText()
    if (text) return { text }
    // Kein Text, aber ein Bild (Screenshot): als PNG speichern – den Pfad versteht Claude als Bild
    for (const item of await clipboard.read()) {
      const type = item.types.find((t) => /^image\/(png|jpeg|gif|webp)$/.test(t))
      if (!type) continue
      const blob = (await item.getType(type)) as Blob
      fs.mkdirSync(d.pasteDir, { recursive: true })
      const file = join(d.pasteDir, `bild-${Date.now()}.${type === 'image/jpeg' ? 'jpg' : type.slice(6)}`)
      fs.writeFileSync(file, Buffer.from(await blob.arrayBuffer()))
      return { image: file }
    }
    return null
  })
  // Bildschirmausschnitt: VibeDesk tritt beiseite, das Windows-Ausschneidewerkzeug öffnet sich, das Bild landet als PNG bei Claude
  let snipping = false
  ipcMain.handle('terminal:snip', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (snipping || !win) return null
    snipping = true
    const before = (await clipboardImage().catch(() => null))?.key ?? null
    let back = false
    const onFocus = (): void => void (back = true)
    try {
      win.minimize()
      await new Promise((r) => setTimeout(r, 250))
      await shell.openExternal('ms-screenclip:')
      // erst nach einem Moment zählt „wieder im Vordergrund“ als Abbruch – das Minimieren selbst löst kein focus aus
      setTimeout(() => win.once('focus', onFocus), 800)
      const img = await waitForNewImage({ before, read: clipboardImage, stop: () => back, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) })
      if (!img) return null
      fs.mkdirSync(d.pasteDir, { recursive: true })
      const file = join(d.pasteDir, `ausschnitt-${Date.now()}.${img.ext}`)
      fs.writeFileSync(file, img.data)
      return file
    } finally {
      win.removeListener('focus', onFocus)
      if (win.isMinimized()) win.restore()
      win.focus()
      snipping = false
    }
  })
  ipcMain.handle('terminal:pickFiles', async (e, defaultPath: unknown) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const opts: Electron.OpenDialogOptions = {
      title: t('Dateien für Claude anhängen'),
      properties: ['openFile', 'multiSelections'],
      defaultPath: typeof defaultPath === 'string' && fs.existsSync(defaultPath) ? defaultPath : undefined
    }
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (r.canceled) return []
    return r.filePaths.slice(0, 50).map((p) => {
      try {
        return { path: p, size: fs.statSync(p).size }
      } catch {
        return { path: p, size: 0 }
      }
    })
  })
  ipcMain.handle('terminal:writeClipboard', (_e, text: unknown) => (typeof text === 'string' ? clipboard.writeText(text) : undefined))

  ipcMain.handle('shells:start', (_e, projectId: unknown, attachedTo: unknown) => {
    const p = typeof projectId === 'string' ? d.projects.get(projectId) : undefined
    if (!p) throw new Error(t('Projekt nicht gefunden'))
    return d.shells.start(p, typeof attachedTo === 'string' ? attachedTo : undefined)
  })
  ipcMain.handle('shells:stop', (_e, id: unknown) => typeof id === 'string' && d.shells.stop(id))
  ipcMain.on('shells:write', (_e, id: unknown, data: unknown) => typeof id === 'string' && typeof data === 'string' && d.shells.write(id, data))
  ipcMain.on('shells:resize', (_e, id: unknown, cols: unknown, rows: unknown) => {
    if (typeof id === 'string' && Number.isInteger(cols) && Number.isInteger(rows)) d.shells.resize(id, cols as number, rows as number)
  })
  ipcMain.handle('shells:list', () => d.shells.list())
}
