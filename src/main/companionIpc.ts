// Handy-Begleiter verdrahten: Server an/aus, Koppeln per Code, Geräte, QR-Codes, Strom, KI-Aufrufe und Prompts über den Renderer.
import { t } from '../shared/i18n'
import { ipcMain, powerMonitor, powerSaveBlocker } from 'electron'
import { randomBytes } from 'crypto'
import fs from 'fs'
import os from 'os'
import QRCode from 'qrcode'
import { createRelay } from './relayTransport'
import type { LimitWindow, PlanLimits } from '../shared/limits'
import { cleanChunk, companionUrl, FEED_SHOWN, emptySnapshot, lanAddresses, type CompanionSnapshot, type CompanionStatus, type PromptTarget, type TermChunk, type TermQuery } from '../shared/companion'
import { isDecision } from '../shared/permissions'
import { defaultRunner } from './gitService'
import { CompanionAuth } from './companionAuth'
import { CompanionHub } from './companionHub'
import { CompanionServer } from './companionServer'
import { PowerControl } from './powerControl'
import type { PermissionBroker } from './permissionBroker'
import type { SettingsStore } from './settingsStore'

const PROMPT_REPLY_MS = 30_000
/** Renderer wartet bis zu 20 s auf Neues – etwas mehr Luft, dann gilt es als verloren */
const TERM_REPLY_MS = 24_000
/** gleichzeitig offene Terminal-Abfragen (Long-Polling) */
const TERM_MAX_WAIT = 16
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
  /** Rohdaten ins PTY einer Claude-Session (Tasten vom Handy) */
  writeSession(id: string, data: string): void
}

export function setupCompanion(d: CompanionDeps): { hub: CompanionHub; stop(): Promise<void> } {
  const waiting = new Map<string, (ok: boolean) => void>()

  const ai = async (input: string): Promise<string> => {
    fs.mkdirSync(d.tmpDir, { recursive: true })
    const args = ['/d', '/c', d.claudeCmd(), '-p', 'Follow the instructions in the input.', '--model', 'haiku', '--output-format', 'text', '--no-session-persistence', '--tools', '']
    const r = await defaultRunner('cmd.exe', args, { cwd: d.tmpDir, input, timeout: AI_TIMEOUT_MS })
    if (r.code !== 0) {
      if (/is not recognized|nicht als interner|ENOENT/i.test(r.stderr)) throw new Error(t('Claude Code wurde nicht gefunden.'))
      throw new Error(r.stderr.trim().split('\n').slice(-2).join(' ') || t('Claude hat nicht geantwortet.'))
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

  const termWaiting = new Map<string, (c: TermChunk | null) => void>()
  const terminalOn = (): boolean => d.settings.get().companion?.terminal === true
  const readTerminal = (q: TermQuery): Promise<TermChunk | null> =>
    new Promise((resolve) => {
      if (termWaiting.size >= TERM_MAX_WAIT) return resolve(null)
      const reqId = randomBytes(8).toString('hex')
      const timer = setTimeout(() => {
        termWaiting.delete(reqId)
        resolve(null)
      }, TERM_REPLY_MS)
      termWaiting.set(reqId, (c) => {
        clearTimeout(timer)
        termWaiting.delete(reqId)
        resolve(c)
      })
      d.send('companion:term', reqId, q)
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
    shutdownAt: () => power.shutdownAt,
    terminalOn,
    readTerminal,
    keysOn: () => terminalOn() && d.settings.get().companion?.terminalKeys === true,
    writeSession: (id, data) => d.writeSession(id, data)
  })
  const server = new CompanionServer(auth, hub, power, (dev) => d.send('companion:devices', auth.list(), dev))

  // Internet-Link: Ändert sich der Tunnel, bekommt das Fenster den neuen Stand (samt QR-Code)
  let pushing: ReturnType<typeof setTimeout> | null = null
  const tunnel = createRelay(() => {
    if (pushing) return
    pushing = setTimeout(() => {
      pushing = null
      void status().then((s) => d.send('companion:status', s))
    }, 100)
  })

  const status = async (error?: string): Promise<CompanionStatus> => {
    if (!server.running) return error ? { running: false, error } : { running: false }
    const port = server.boundPort
    const lan = lanAddresses(os.networkInterfaces()).map((ip) => ({ ip, url: companionUrl(ip, port), via: 'lan' as const }))
    // Internet-Link ganz vorn: braucht am Handy keine App und klappt überall
    const web = tunnel.url && tunnel.wanted === port ? [{ ip: new URL(tunnel.url).hostname, url: tunnel.url + '/', via: 'internet' as const }] : []
    const links = await Promise.all(
      [...web, ...lan].map(async (t) => {
        const url = t.url
        return { ...t, qr: await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b0e17', light: '#ffffff' } }) }
      })
    )
    const internet = tunnel.wanted === port ? { state: tunnel.state, ...(tunnel.error ? { error: tunnel.error } : {}) } : undefined
    return { running: true, port, links, internet }
  }

  ipcMain.handle('companion:configure', async (_e, enabled: unknown, p: unknown, internet: unknown) => {
    if (enabled !== true) {
      tunnel.stop()
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
    // Tunnel startet im Hintergrund (Installieren dauert) – der Link kommt per companion:status nach
    if (internet === true) void tunnel.start(server.boundPort)
    else tunnel.stop()
    return status()
  })
  ipcMain.handle('companion:status', () => status())
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
  ipcMain.on('companion:termDone', (_e, reqId: unknown, chunk: unknown) => {
    if (typeof reqId === 'string') termWaiting.get(reqId)?.(cleanChunk(chunk))
  })
  ipcMain.on('companion:promptDone', (_e, reqId: unknown, ok: unknown) => {
    if (typeof reqId === 'string') waiting.get(reqId)?.(ok === true)
  })

  ipcMain.handle('permissions:list', () => d.broker.list())
  ipcMain.handle('permissions:answer', (_e, id: unknown, decision: unknown, feedback: unknown) => typeof id === 'string' && isDecision(decision) && d.broker.answer(id, decision, typeof feedback === 'string' ? feedback : undefined))

  // Nach einem Standby (z. B. vom Handy) wieder wach halten
  powerMonitor.on('resume', () => {
    if (server.running) power.keepAwake(true)
  })

  return {
    hub,
    stop: async () => {
      tunnel.stop()
      power.keepAwake(false)
      await server.stop()
    }
  }
}

function cleanLimits(x: unknown): PlanLimits | null {
  if (!x || typeof x !== 'object') return null
  const l = x as Partial<PlanLimits>
  const win = (w: unknown): LimitWindow | undefined => {
    const v = w as Partial<LimitWindow> | undefined
    return v && Number.isFinite(v.pct) && Number.isFinite(v.resetsAt) ? { pct: Math.min(100, Math.max(0, Number(v.pct))), resetsAt: Number(v.resetsAt) } : undefined
  }
  const fiveHour = win(l.fiveHour)
  const sevenDay = win(l.sevenDay)
  return fiveHour || sevenDay ? { ...(fiveHour ? { fiveHour } : {}), ...(sevenDay ? { sevenDay } : {}), at: Number(l.at) || 0 } : null
}

/** Kommt aus dem eigenen Renderer, trotzdem in Form bringen – es geht ins Netz */
function cleanSnapshot(x: unknown): CompanionSnapshot {
  const s = x && typeof x === 'object' ? (x as Partial<CompanionSnapshot>) : {}
  const out = emptySnapshot()
  out.sessions = (Array.isArray(s.sessions) ? s.sessions : []).slice(0, 20).map((x) => ({
    ...x,
    feed: (Array.isArray(x.feed) ? x.feed : []).slice(-FEED_SHOWN).map((f) => ({
      tool: String(f?.tool ?? '').slice(0, 60),
      target: String(f?.target ?? '').slice(0, 240),
      result: f?.result === 'ok' || f?.result === 'fail' || f?.result === 'stopped' ? f.result : 'pending',
      ts: Number(f?.ts) || 0
    }))
  }))
  out.projects = (Array.isArray(s.projects) ? s.projects : []).slice(0, 50)
  out.notices = (Array.isArray(s.notices) ? s.notices : []).slice(0, 20)
  out.terminal = s.terminal === true
  out.limits = cleanLimits(s.limits)
  return out
}
