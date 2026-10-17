// Prüft und installiert, was VibeDesk zum Laufen braucht: Node.js (Hook-Forwarder) und Claude Code.
import { execFile, spawn } from 'child_process'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { claudeLoginFiles, EXIT_MARK, hasClaudeLogin, SETUP_LINKS } from '../shared/setupHints'
import type { ToolId, ToolStatus } from '../shared/types'
import { claudeVersion } from './sessionManager'

export const NODE_DOWNLOAD_URL = SETUP_LINKS.node
/** Hilfe bei Installationsproblemen (deutsche Seite von Claude Code) */
export const CLAUDE_DOCS_URL = SETUP_LINKS.claude

const run = (file: string, args: string[], timeout = 15000): Promise<string | null> =>
  new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout }, (err, stdout) => resolve(err ? null : String(stdout)))
  })

/** Liest PATH frisch aus der Registry – nach einer Installation kennt der laufende Prozess ihn sonst nicht. */
export async function refreshPath(): Promise<void> {
  if (process.platform !== 'win32') return
  const out = await run('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')"
  ])
  if (!out) return
  const seen = new Set<string>()
  const merged = [...(process.env.PATH ?? '').split(';'), ...out.trim().split(';')]
    .map((p) => p.trim())
    .filter((p) => p && !seen.has(p.toLowerCase()) && seen.add(p.toLowerCase()))
  process.env.PATH = merged.join(';')
}

export function parseNodeVersion(out: string | null): string | null {
  return out ? (/v?(\d+\.\d+\.\d+)/.exec(out)?.[1] ?? null) : null
}

const readJson = async (file: string): Promise<unknown> => {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return null
  }
}

/** Angemeldet? Nur lokale Dateien und Umgebung – kostet kein Kontingent und braucht kein Netz. */
export async function checkClaudeLogin(env: NodeJS.ProcessEnv = process.env, home = os.homedir()): Promise<boolean> {
  if (env.VIBEDESK_CLAUDE_CMD) return true // Tests mit Fake-Claude
  const files = claudeLoginFiles(env, home, path.join)
  const [credentials, config] = await Promise.all([readJson(files.credentials), readJson(files.config)])
  return hasClaudeLogin({ env, credentials, config })
}

export async function checkTools(): Promise<ToolStatus> {
  await refreshPath()
  const [node, claude, winget, login] = await Promise.all([
    run('node', ['--version']).then(parseNodeVersion),
    process.env.VIBEDESK_CLAUDE_CMD ? Promise.resolve('Test') : claudeVersion(),
    run('where', ['winget']).then((x) => x !== null),
    checkClaudeLogin()
  ])
  return { node, claude, winget, login }
}

/** Feste Befehle – keine Eingaben aus dem Renderer landen in der Kommandozeile. */
export function installCommand(tool: ToolId): { file: string; args: string[] } {
  if (tool === 'node')
    return {
      file: 'winget',
      args: ['install', '-e', '--id', 'OpenJS.NodeJS.LTS', '--accept-source-agreements', '--accept-package-agreements', '--disable-interactivity']
    }
  // Offizieller nativer Installer von Claude Code (ohne Admin-Rechte, landet im Benutzerprofil)
  return {
    file: 'powershell.exe',
    args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'irm https://claude.ai/install.ps1 | iex']
  }
}

// Fortschrittsbalken & Steuerzeichen aus winget/PowerShell-Ausgaben entfernen
const clean = (s: string): string =>
  s
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/[▀-▟─-╿]+/g, '')
    .replace(/^[\s\-\\|/]+$/, '')
    .trim()

let running = false

export function installTool(tool: ToolId, log: (line: string) => void): Promise<boolean> {
  if (running) return Promise.resolve(false)
  running = true
  const { file, args } = installCommand(tool)
  return new Promise((resolve) => {
    const finish = async (ok: boolean): Promise<void> => {
      running = false
      await refreshPath()
      resolve(ok)
    }
    let child
    try {
      child = spawn(file, args, { windowsHide: true })
    } catch (err) {
      log((err as Error).message)
      void finish(false)
      return
    }
    const onData = (b: Buffer): void => {
      for (const part of b.toString().split(/[\r\n]+/)) {
        const line = clean(part)
        if (line) log(line)
      }
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.on('error', (err) => {
      log(err.message)
      void finish(false)
    })
    child.on('close', (code) => {
      // Code mitschicken – daraus erkennt die Einrichtung z. B. eine abgelehnte Administrator-Abfrage
      if (code !== 0) log(`${EXIT_MARK}${code}`)
      void finish(code === 0)
    })
  })
}
