import { t } from '../shared/i18n'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import fs from 'fs'
import { LIMITS, type AddonPackage } from '../shared/addonFormat'
import { AddonFormatError } from '../shared/addonFormat'
import type { AddonStore } from './addonStore'

const FILTERS = [{ name: 'VibeDesk-Addon', extensions: ['vibeaddon'] }]

/** Liest nur .vibeaddon-Dateien und nur bis zur Größengrenze. */
function readAddonFile(p: string): Uint8Array {
  if (typeof p !== 'string' || !p.toLowerCase().endsWith('.vibeaddon')) throw new AddonFormatError('not-addon')
  if (fs.statSync(p).size > LIMITS.file) throw new AddonFormatError('too-large')
  return new Uint8Array(fs.readFileSync(p))
}

const bytesOf = (src: string | Uint8Array): Uint8Array => (typeof src === 'string' ? readAddonFile(src) : new Uint8Array(src))

export function registerAddonIpc(store: AddonStore, win: () => BrowserWindow | null, takePending: () => string | null): void {
  ipcMain.handle('addons:list', () => store.list())
  ipcMain.handle('addons:inspect', (_e, src: string | Uint8Array) => store.inspect(bytesOf(src)))
  ipcMain.handle('addons:install', (_e, src: string | Uint8Array) => store.install(bytesOf(src)))
  ipcMain.handle('addons:remove', (_e, id: string) => store.remove(id))
  ipcMain.handle('addons:setEnabled', (_e, id: string, on: boolean) => store.setEnabled(id, !!on))
  ipcMain.handle('addons:saveDraft', (_e, p: AddonPackage) => store.saveDraft(p))
  ipcMain.handle('addons:takePending', () => takePending())
  ipcMain.handle('addons:getState', (_e, id: string) => store.getState(id))
  ipcMain.handle('addons:setState', (_e, id: string, data) => store.setState(id, data))
  ipcMain.handle('addons:pickFile', async () => {
    const w = win()
    const opts = { title: t('Addon importieren'), filters: FILTERS, properties: ['openFile' as const] }
    const r = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts)
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })
  ipcMain.handle('addons:exportTo', async (_e, id: string) => {
    const a = store.list().find((x) => x.manifest.id === id)
    if (!a) throw new Error(t('Addon nicht gefunden'))
    const safe = a.manifest.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim() || 'addon'
    const w = win()
    const opts = { title: t('Addon exportieren'), defaultPath: `${safe}.vibeaddon`, filters: FILTERS }
    const r = w ? await dialog.showSaveDialog(w, opts) : await dialog.showSaveDialog(opts)
    if (r.canceled || !r.filePath) return null
    fs.writeFileSync(r.filePath, store.exportBytes(id))
    return r.filePath
  })
}
