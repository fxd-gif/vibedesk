// Handy-Begleiter verdrahten: Server an/aus, Koppeln per Code, Geräte, QR-Codes, Strom, KI-Aufrufe und Prompts über den Renderer.
import { ipcMain, powerMonitor, powerSaveBlocker } from 'electron'
import { randomBytes } from 'crypto'
import fs from 'fs'
import os from 'os'
import QRCode from 'qrcode'
import { companionUrl, emptySnapshot, lanAddresses, type CompanionSnapshot, type CompanionStatus, type PromptTarget } from '../shared/companion'
import { isDecision } from '../shared/permissions'
import { defaultRunner } from './gitService'
import { CompanionAuth } from './companionAuth'
import { CompanionHub } from './companionHub'
import { CompanionServer } from './companionServer'
import { PowerControl } from './powerControl'
import type { PermissionBroker } from './permissionBroker'
import type { SettingsStore } from './settingsStore'

const PROMPT_REPLY_MS = 30_000
const AI_TIMEOUT_MS = 90_000

export interface CompanionDeps {
  settings: SettingsStore
  broker: PermissionBroker
  send(ch: string, ...args: unknown[]): void
  claudeCmd(): string
  /** Arbeitsordner für claude -p (leer, damit kein Projektkontext geladen wird) */
  tmpDir: string
  transcriptsDir: string
  /** userData/companion.json – gekoppelte Geräte (nur Hashes) */
  devicesFile: string
}

export function setupCompanion(d: CompanionDeps): { hub: CompanionHub; stop(): Promise<void> } {
  const waiting = new Map<string, (ok: boolean) => void>()

  const ai = async (input: string): Promise<string> => {
    fs.mkdirSync(d.tmpDir, { recursive: true })
    const args = ['/d', '/c', d.claudeCmd(), '-p', 'Follow the instructions in the input.', '--model', 'haiku', '--output-format', 'text', '--no-session-persistence', '--tools', '']
    const r = await defaultRunner('cmd.exe', args, { cwd: d.tmpDir, input, timeout: AI_TIMEOUT_MS })
    if (r.code !== 0) {
      if (/is not recognized|nicht als interner|ENOENT/i.test(r.stderr)) throw new Error('Claude Code wurde nicht gefunden.')
      throw new Error(r.stderr.trim().split('\n').slice(-2).join(' ') || 'Claude hat nicht geantwortet.')
    }
    return r.stdout
  }

  const sendPrompt = (target: PromptTarget, text: string): Promise<boolean> =>
    new Promise((resolve) => {
      const reqId = randomBytes(8).toString('hex')
      const t = setTimeout(() => {
        waiting.delete(reqId)
        resolve(false)
      }, PROMPT_REPLY_MS)
      waiting.set(reqId, (ok) => {
        clearTimeout(t)
        waiting.delete(reqId)
        resolve(ok)
      })
      d.send('companion:prompt', reqId, target, text)
    })

  const auth = new CompanionAuth(d.devicesFile, () => d.send('companion:devices', auth.list()))
  const power = new PowerControl({
    run: defaultRunner,
    blocker: { start: () => powerSaveBlocker.start('prevent-app-suspension'), stop: (id) => powerSaveBlocker.stop(id) },
    onChange: (action, at) => {
      d.send('companion:power', action, at)
      hub.touch()
    }
  })
  const hub: CompanionHub = new CompanionHub({
    broker: d.broker,
    ai,
    sendPrompt,
    push: (s) => server.push(s),
    transcriptsDir: d.transcriptsDir,
    shutdownAt: () => power.shutdownAt
  })
  const server = new CompanionServer(auth, hub, power, (dev) => d.send('companion:devices', auth.list(), dev))

  const status = async (error?: string): Promise<CompanionStatus> => {
    if (!server.running) return error ? { running: false, error } : { running: false }
    const port = server.boundPort
    const links = await Promise.all(
      lanAddresses(os.networkInterfaces()).map(async (ip) => {
        const url = companionUrl(ip, port)
        return { ip, url, qr: await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b0e17', light: '#ffffff' } }) }
      })
    )
    return { running: true, port, links }
  }

  ipcMain.handle('companion:configure', async (_e, enabled: unknown, p: unknown) => {
    if (enabled !== true) {
      await server.stop()
      power.keepAwake(false)
      auth.cancelPairing()
      return status()
    }
    const want = Number.isInteger(p) && (p as number) >= 1024 && (p as number) <= 65535 ? (p as number) : 17350
    const r = await server.start(want)
    if (!r.ok) return status(r.error)
    // Solange das Handy steuern kann, geht der PC nicht in den Standby (der Bildschirm darf aus)
    power.keepAwake(true)
    server.push(hub.state())
    return status()
  })
  ipcMain.handle('companion:startPairing', () => auth.startPairing())
  ipcMain.on('companion:cancelPairing', () => auth.cancelPairing())
  ipcMain.handle('companion:devices', () => auth.list())
  ipcMain.handle('companion:revoke', (_e, id: unknown) => {
    if (typeof id !== 'string') return
    auth.revoke(id)
    server.disconnect(id)
  })
  ipcMain.handle('companion:revokeAll', () => {
    auth.revokeAll()
    server.disconnect()
  })
  ipcMain.handle('companion:cancelShutdown', async () => (await power.act('cancel')).ok)
  ipcMain.on('companion:push', (_e, s: CompanionSnapshot) => hub.setSnapshot(cleanSnapshot(s)))
  ipcMain.on('companion:promptDone', (_e, reqId: unknown, ok: unknown) => {
    if (typeof reqId === 'string') waiting.get(reqId)?.(ok === true)
  })

  ipcMain.handle('permissions:list', () => d.broker.list())
  ipcMain.handle('permissions:answer', (_e, id: unknown, decision: unknown) => typeof id === 'string' && isDecision(decision) && d.broker.answer(id, decision))

  // Nach einem Standby (z. B. vom Handy) wieder wach halten
  powerMonitor.on('resume', () => {
    if (server.running) power.keepAwake(true)
  })

  return {
    hub,
    stop: async () => {
      power.keepAwake(false)
      await server.stop()
    }
  }
}

/** Kommt aus dem eigenen Renderer, trotzdem in Form bringen – es geht ins Netz */
function cleanSnapshot(x: unknown): CompanionSnapshot {
  const s = x && typeof x === 'object' ? (x as Partial<CompanionSnapshot>) : {}
  const out = emptySnapshot()
  out.sessions = (Array.isArray(s.sessions) ? s.sessions : []).slice(0, 20)
  out.projects = (Array.isArray(s.projects) ? s.projects : []).slice(0, 50)
  out.notices = (Array.isArray(s.notices) ? s.notices : []).slice(0, 20)
  return out
}
