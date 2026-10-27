// Lokales Fehlerprotokoll: nichts verlässt den Rechner – „Fehler melden“ hängt es auf Wunsch an ein GitHub-Issue.
import { app, ipcMain, powerMonitor, shell } from 'electron'
import fs from 'fs'
import os from 'os'
import { join } from 'path'
import { bugReportUrl, scrubPaths } from '../shared/bugReport'
import { logTail, type DiagnosticsInfo, type GhState } from '../shared/diagnostics'
import type { GitTools } from '../shared/git'
import type { AppInfo, Settings } from '../shared/types'
import { systemNodeVersion } from './toolSetup'

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

export interface DiagnosticsDeps {
  claudeVersion(): Promise<string | null>
  gitTools(): Promise<GitTools>
  hooks(): DiagnosticsInfo['hooks']
  sessions(): number
  settings(): Settings
}

/** Wartet höchstens ms – die GitHub-CLI fragt bei der Anmeldung manchmal lange nach */
const within = <T>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))])

/** Diagnose: alles, was hilft herauszufinden, woran es hakt – Pfade im Protokoll unkenntlich */
export function registerDiagnosticsIpc(d: DiagnosticsDeps): void {
  ipcMain.handle('app:diagnostics', async (): Promise<DiagnosticsInfo> => {
    const [claude, systemNode, tools] = await Promise.all([d.claudeVersion(), systemNodeVersion(), within(d.gitTools(), 8000)])
    const s = d.settings()
    const kb = app.getAppMetrics().reduce((sum, m) => sum + (m.memory?.workingSetSize ?? 0), 0)
    const gh: GhState = tools ? tools.gh : 'unknown'
    return {
      versions: {
        vibedesk: app.getVersion(),
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
        os: osLabel(),
        claude,
        systemNode,
        git: tools?.git ?? null,
        gh
      },
      hooks: d.hooks(),
      sessions: d.sessions(),
      brainOn: s.brainOn,
      companionOn: !!s.companion?.enabled,
      memoryMb: Math.round(kb / 1024),
      energySaver: s.energySaver ?? 'auto',
      onBattery: powerMonitor.isOnBatteryPower(),
      log: scrubPaths(logTail(readErrorLog(20000)))
    }
  })
}
