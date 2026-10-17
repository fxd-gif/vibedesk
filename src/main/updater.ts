// Auto-Update aus den GitHub-Releases (electron-updater, Provider aus electron-builder.yml).
import { app, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '../shared/types'

const FIRST_CHECK_MS = 3_000
const INTERVAL_MS = 4 * 60 * 60 * 1000

export interface UpdaterDisplay {
  /** Start-Fensterchen läuft: erster Check sofort statt nach 3 s */
  checkNow?: boolean
  /** Läuft unmittelbar vor dem Installieren, z. B. um das Fensterchen zu zeigen */
  beforeInstall?: (version: string) => Promise<void>
}

export function setupUpdater(send: (s: UpdateStatus) => void, display: UpdaterDisplay = {}): void {
  let status: UpdateStatus = { state: 'idle' }
  const set = (s: UpdateStatus): void => {
    status = s
    send(s)
  }
  ipcMain.handle('update:status', () => status)
  ipcMain.handle('update:version', () => app.getVersion())

  // Im Entwicklungsmodus gibt es nichts zu aktualisieren
  if (!app.isPackaged) {
    ipcMain.handle('update:check', () => set({ state: 'none' }))
    ipcMain.on('update:install', () => {})
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => set({ state: 'checking' }))
  autoUpdater.on('update-available', (i) => set({ state: 'available', version: i.version }))
  autoUpdater.on('update-not-available', () => set({ state: 'none' }))
  autoUpdater.on('download-progress', (p) => set({ state: 'downloading', percent: Math.round(p.percent), version: status.state === 'available' || status.state === 'downloading' ? status.version : '' }))
  autoUpdater.on('update-downloaded', (i) => set({ state: 'ready', version: i.version }))
  autoUpdater.on('error', (e) => set({ state: 'error', message: e?.message?.split('\n')[0] ?? 'Unbekannter Fehler' }))

  const check = (): void => {
    autoUpdater.checkForUpdates().catch(() => {
      /* Fehler kommt über das 'error'-Event */
    })
  }
  ipcMain.handle('update:check', () => check())
  let installing = false
  ipcMain.on('update:install', async () => {
    if (installing) return
    installing = true
    await display.beforeInstall?.(status.state === 'ready' ? status.version : '').catch(() => {})
    autoUpdater.quitAndInstall(true, true)
  })
  setTimeout(check, display.checkNow ? 0 : FIRST_CHECK_MS)
  setInterval(check, INTERVAL_MS)
}
