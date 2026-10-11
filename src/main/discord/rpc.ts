// Schlanker Discord-RPC-Client über die lokale Named Pipe – ohne Fremdbibliothek.
import net from 'net'
import { randomUUID } from 'crypto'
import type { Activity } from '../../shared/presence'
import type { DiscordAppInfo, DiscordStatus } from '../../shared/types'

export type { DiscordAppInfo, DiscordStatus }
import { decodeFrames, encodeFrame, OP, pipeNames } from './frame'


const RETRY_MS = 15_000
const MIN_GAP_MS = 5_000 // Discord erlaubt 5 Updates pro 20 s

export class DiscordRpc {
  private sock: net.Socket | null = null
  private clientId = ''
  private enabled = false
  private ready = false
  private buf: Buffer = Buffer.alloc(0)
  private retry: ReturnType<typeof setTimeout> | null = null
  private activity: Activity | null = null
  private lastSent = 0
  private sendTimer: ReturnType<typeof setTimeout> | null = null
  private lastJson = ''

  constructor(private onStatus: (s: DiscordStatus) => void) {}

  configure(enabled: boolean, clientId: string): void {
    const changed = clientId !== this.clientId
    this.enabled = enabled
    this.clientId = clientId
    if (!enabled || !/^\d{15,22}$/.test(clientId)) {
      this.disconnect()
      this.onStatus(enabled ? { state: 'unavailable', reason: 'Ungültige App-ID' } : { state: 'off' })
      return
    }
    if (changed) this.disconnect()
    if (!this.sock) this.connect(0)
  }

  setActivity(a: Activity | null): void {
    this.activity = a
    this.schedule()
  }

  shutdown(): void {
    this.enabled = false
    if (this.sock && this.ready) this.send(OP.FRAME, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: null }, nonce: randomUUID() })
    this.disconnect()
  }

  private schedule(): void {
    if (!this.ready || this.sendTimer) return
    const wait = Math.max(0, this.lastSent + MIN_GAP_MS - Date.now())
    this.sendTimer = setTimeout(() => {
      this.sendTimer = null
      const json = JSON.stringify(this.activity)
      if (json === this.lastJson || !this.ready) return
      this.lastJson = json
      this.lastSent = Date.now()
      this.send(OP.FRAME, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: this.activity }, nonce: randomUUID() })
    }, wait)
  }

  private connect(i: number): void {
    if (!this.enabled) return
    const pipes = pipeNames()
    if (i >= pipes.length) {
      this.onStatus({ state: 'unavailable', reason: 'Discord läuft nicht' })
      this.retry = setTimeout(() => {
        this.retry = null
        this.connect(0)
      }, RETRY_MS)
      return
    }
    if (i === 0) this.onStatus({ state: 'connecting' })
    const sock = net.connect(pipes[i])
    sock.once('error', () => {
      sock.destroy()
      if (this.sock === sock) this.sock = null
      if (!this.ready) this.connect(i + 1)
    })
    sock.once('connect', () => {
      this.sock = sock
      this.buf = Buffer.alloc(0)
      sock.write(encodeFrame(OP.HANDSHAKE, { v: 1, client_id: this.clientId }))
    })
    sock.on('data', (d: Buffer) => this.onData(d))
    sock.on('close', () => {
      if (this.sock !== sock) return
      const was = this.ready
      this.sock = null
      this.ready = false
      this.lastJson = ''
      if (this.enabled && was) {
        this.onStatus({ state: 'connecting' })
        this.retry = setTimeout(() => {
          this.retry = null
          this.connect(0)
        }, 3000)
      }
    })
  }

  private onData(d: Buffer): void {
    const { frames, rest } = decodeFrames(Buffer.concat([this.buf, d]))
    this.buf = rest
    for (const f of frames) {
      if (f.op === OP.PING) this.send(OP.PONG, f.data)
      else if (f.op === OP.CLOSE) {
        this.onStatus({ state: 'unavailable', reason: f.data?.message ?? 'Verbindung abgelehnt' })
        this.enabled = false
        this.disconnect()
      } else if (f.data?.evt === 'READY') {
        this.ready = true
        const u = f.data.data?.user ?? {}
        this.onStatus({ state: 'connected', user: { id: String(u.id ?? ''), username: u.username ?? '', globalName: u.global_name ?? null, avatar: u.avatar ?? null } })
        this.schedule()
      } else if (f.data?.evt === 'ERROR') {
        console.warn('[discord]', f.data.data?.message)
      }
    }
  }

  private send(op: number, data: unknown): void {
    this.sock?.write(encodeFrame(op, data))
  }

  private disconnect(): void {
    if (this.retry) clearTimeout(this.retry)
    if (this.sendTimer) clearTimeout(this.sendTimer)
    this.retry = null
    this.sendTimer = null
    this.ready = false
    this.lastJson = ''
    const s = this.sock
    this.sock = null
    s?.destroy()
  }
}


/** Öffentliche Infos einer Discord-App (Name, Icon, hochgeladene Rich-Presence-Bilder). */
export async function fetchAppInfo(clientId: string): Promise<DiscordAppInfo | null> {
  if (!/^\d{15,22}$/.test(clientId)) return null
  try {
    const [app, assets] = await Promise.all([
      fetch(`https://discord.com/api/v10/applications/${clientId}/rpc`).then((r) => (r.ok ? r.json() : null)),
      fetch(`https://discord.com/api/v10/oauth2/applications/${clientId}/assets`).then((r) => (r.ok ? r.json() : []))
    ])
    if (!app) return null
    return {
      name: app.name ?? 'App',
      icon: app.icon ? `https://cdn.discordapp.com/app-icons/${clientId}/${app.icon}.png?size=128` : null,
      assets: (Array.isArray(assets) ? assets : []).map((a: { id: string; name: string }) => ({
        id: a.id,
        name: a.name,
        url: `https://cdn.discordapp.com/app-assets/${clientId}/${a.id}.png`
      }))
    }
  } catch {
    return null
  }
}
