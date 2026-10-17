// Lokales Fehlerprotokoll: nichts verlässt den Rechner – „Fehler melden“ hängt es auf Wunsch an ein GitHub-Issue.
import { app, ipcMain, shell } from 'electron'
import fs from 'fs'
import os from 'os'
import { join } from 'path'
import { bugReportUrl } from '../shared/bugReport'
import type { AppInfo } from '../shared/types'

const MAX_BYTES = 256 * 1024

let file = ''

export function errorLogFile(): string {
  return file
}

/** Schreibt eine Zeile ins Protokoll; wird es zu groß, bleibt nur die jüngere Hälfte */
export function logError(where: string, err: unknown): void {
  if (!file) return
  const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err)
  try {
    if (fs.existsSync(file) && fs.statSync(file).size > MAX_BYTES) {
      const keep = fs.readFileSync(file, 'utf8').slice(-MAX_BYTES / 2)
      fs.writeFileSync(file, keep)
    }
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${where}: ${msg.trim()}\n`)
  } catch {
    /* Protokoll darf nie selbst zum Problem werden */
  }
}

export function readErrorLog(maxChars = 6000): string {
  try {
    return fs.readFileSync(file, 'utf8').slice(-maxChars)
  } catch {
    return ''
  }
}

/** Unbehandelte Fehler protokollieren statt Electrons Fehlerdialog „A JavaScript error occurred“ */
export function installErrorLog(userData: string): void {
  file = join(userData, 'logs', 'fehler.log')
  try {
    fs.mkdirSync(join(userData, 'logs'), { recursive: true })
  } catch {
    /* egal */
  }
  process.on('uncaughtException', (e) => logError('main', e))
  process.on('unhandledRejection', (e) => logError('main (Promise)', e))
}

const osLabel = (): string => `Windows ${os.release()}`

/** Fehler aus dem Renderer, „Fehler melden“ und Infos für den Über-Dialog */
export function registerErrorIpc(claudeVersion: () => Promise<string | null>): void {
  ipcMain.on('app:logError', (_e, where: unknown, msg: unknown) => logError(`Renderer/${String(where).slice(0, 60)}`, String(msg).slice(0, 4000)))
  ipcMain.on('app:reportBug', async (_e, summary: unknown) => {
    const url = bugReportUrl({ version: app.getVersion(), os: osLabel(), claude: await claudeVersion(), summary: typeof summary === 'string' ? summary.slice(0, 300) : undefined, log: readErrorLog() })
    void shell.openExternal(url)
  })
  ipcMain.on('app:openLog', () => {
    if (!fs.existsSync(file)) fs.writeFileSync(file, '')
    shell.showItemInFolder(file)
  })
  ipcMain.handle('app:info', async (): Promise<AppInfo> => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    os: osLabel(),
    claude: await claudeVersion(),
    hasErrors: readErrorLog(10).length > 0
  }))
}
