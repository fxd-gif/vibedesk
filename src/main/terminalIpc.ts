// Main-Seite der Terminals: Shells (PowerShell/cmd) und Zwischenablage (Text oder Bild als Temp-Datei).
import { BrowserWindow, clipboard, dialog, ipcMain } from 'electron'
import fs from 'fs'
import { join } from 'path'
import type { ShellManager } from './shellManager'
import type { ProjectStore } from './projectStore'

const DAY_MS = 24 * 3600_000

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
  ipcMain.handle('terminal:pickFiles', async (e, defaultPath: unknown) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const opts: Electron.OpenDialogOptions = {
      title: 'Dateien für Claude anhängen',
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
    if (!p) throw new Error('Projekt nicht gefunden')
    return d.shells.start(p, typeof attachedTo === 'string' ? attachedTo : undefined)
  })
  ipcMain.handle('shells:stop', (_e, id: unknown) => typeof id === 'string' && d.shells.stop(id))
  ipcMain.on('shells:write', (_e, id: unknown, data: unknown) => typeof id === 'string' && typeof data === 'string' && d.shells.write(id, data))
  ipcMain.on('shells:resize', (_e, id: unknown, cols: unknown, rows: unknown) => {
    if (typeof id === 'string' && Number.isInteger(cols) && Number.isInteger(rows)) d.shells.resize(id, cols as number, rows as number)
  })
  ipcMain.handle('shells:list', () => d.shells.list())
}
