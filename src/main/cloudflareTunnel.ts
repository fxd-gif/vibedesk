// Handy von überall ohne App: Ein Cloudflare-Quick-Tunnel gibt dem Handy-Begleiter einen HTTPS-Link im Internet.
// cloudflared baut nur ausgehende Verbindungen auf – kein Router, keine Firewall-Freigabe, kein Konto.
// Wer den Link kennt, sieht nur die Koppel-Seite; ohne Code vom PC-Bildschirm kommt niemand weiter.
import { t } from '../shared/i18n'
import { execFile, spawn, type ChildProcess } from 'child_process'
import { Resolver } from 'dns/promises'
import fs from 'fs'
import { join } from 'path'
import type { TunnelState } from '../shared/companion'
import type { RelayTransport } from './relayTransport'

/** Öffentlicher Link aus der Ausgabe von `cloudflared tunnel --url …` */
export function tunnelUrl(out: string): string | null {
  return /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(out)?.[0] ?? null
}

/** Wo winget cloudflared hinlegt */
export function cloudflaredPath(env: NodeJS.ProcessEnv = process.env, exists: (p: string) => boolean = fs.existsSync): string | null {
  const dirs = [env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', env.ProgramFiles || 'C:\\Program Files']
  if (env.LOCALAPPDATA) dirs.push(join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links'))
  for (const d of dirs) {
    const exe = d.endsWith('Links') ? join(d, 'cloudflared.exe') : join(d, 'cloudflared', 'cloudflared.exe')
    if (exists(exe)) return exe
  }
  return null
}

/** cloudflared per winget installieren (feste Befehle, nichts aus dem Renderer) */
export function installCloudflared(): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(false)
  const args = ['install', '-e', '--id', 'Cloudflare.cloudflared', '--source', 'winget', '--silent', '--accept-source-agreements', '--accept-package-agreements', '--disable-interactivity']
  return new Promise((resolve) => {
    execFile('winget', args, { timeout: 10 * 60_000, windowsHide: true }, () => resolve(!!cloudflaredPath()))
  })
}

/** Wartezeit vor dem n-ten Neustart: 3 s, 6 s, 12 s … höchstens eine Minute */
export const restartDelay = (n: number): number => Math.min(60_000, 3000 * 2 ** Math.max(0, n))

/**
 * Wartet, bis der neue Name im öffentlichen DNS steht. Fragt ein Router (z. B. FRITZ!Box) zu früh,
 * merkt er sich „gibt's nicht“ minutenlang – darum zeigt VibeDesk den Link erst danach.
 */
export async function waitForDns(url: string, tries = 30, gap = 2000): Promise<boolean> {
  const r = new Resolver({ timeout: 3000, tries: 1 })
  r.setServers(['1.1.1.1', '8.8.8.8'])
  const host = new URL(url).hostname
  for (let i = 0; i < tries; i++) {
    try {
      if ((await r.resolve4(host)).length) return true
    } catch {
      /* noch nicht da */
    }
    await new Promise((res) => setTimeout(res, gap))
  }
  return false
}

export interface TunnelDeps {
  find(): string | null
  install(): Promise<boolean>
  spawn(exe: string, args: string[]): ChildProcess
  /** löst auf, sobald der Link von außen erreichbar ist (oder es aufgegeben hat) */
  ready(url: string): Promise<unknown>
  onChange(): void
}

const realDeps = (onChange: () => void): TunnelDeps => ({
  find: () => cloudflaredPath(),
  install: installCloudflared,
  spawn: (exe, args) => spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }),
  ready: waitForDns,
  onChange
})

/**
 * Hält einen Quick Tunnel zum lokalen Port offen. Stürzt cloudflared ab oder reißt das Netz ab,
 * startet er neu – der Link ändert sich dann (Quick Tunnels haben keinen festen Namen).
 */
export class QuickTunnel implements RelayTransport {
  state: TunnelState = 'off'
  url: string | null = null
  error: string | null = null
  private proc: ChildProcess | null = null
  private port: number | null = null
  private fails = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private d: TunnelDeps

  constructor(d: TunnelDeps | (() => void)) {
    this.d = typeof d === 'function' ? realDeps(d) : d
  }

  get wanted(): number | null {
    return this.port
  }

  private set(state: TunnelState, url: string | null = null, error: string | null = null): void {
    this.state = state
    this.url = url
    this.error = error
    this.d.onChange()
  }

  async start(port: number): Promise<void> {
    if (this.port === port && this.state !== 'off' && this.state !== 'error') return
    this.stop()
    this.port = port
    this.fails = 0
    let exe = this.d.find()
    if (!exe) {
      this.set('installing')
      await this.d.install()
      if (this.port !== port) return
      exe = this.d.find()
      if (!exe) return this.set('error', null, t('cloudflared ließ sich nicht installieren.'))
    }
    this.launch(exe, port)
  }

  private launch(exe: string, port: number): void {
    this.set('starting')
    const p = this.d.spawn(exe, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`])
    this.proc = p
    let out = ''
    let found = false
    const onData = (b: Buffer): void => {
      if (this.proc !== p || found) return
      out = (out + b.toString()).slice(-8000)
      const url = tunnelUrl(out)
      if (!url) return
      found = true
      void this.d.ready(url).then(() => {
        if (this.proc !== p) return
        this.fails = 0
        this.set('ready', url)
      })
    }
    p.stdout?.on('data', onData)
    p.stderr?.on('data', onData)
    const ended = (): void => {
      if (this.proc !== p) return
      this.proc = null
      if (this.port !== port) return
      const n = this.fails++
      this.set('starting', null, t('Tunnel getrennt – verbinde neu …'))
      this.timer = setTimeout(() => {
        this.timer = null
        if (this.port === port) this.launch(exe, port)
      }, restartDelay(n))
    }
    p.on('exit', ended)
    p.on('error', ended)
  }

  stop(): void {
    this.port = null
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const p = this.proc
    this.proc = null
    if (p && p.exitCode === null) p.kill()
    if (this.state !== 'off') this.set('off')
  }
}
