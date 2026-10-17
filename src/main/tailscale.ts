// Handy von unterwegs: Tailscale verbindet PC und Handy in einem privaten, verschlüsselten Netz.
// VibeDesk muss dafür nichts ins Internet öffnen – es erkennt nur die Tailscale-Adresse des PCs.
import { execFile, spawn } from 'child_process'
import fs from 'fs'
import { join } from 'path'
import { tailnetAddress, type NetIf, type TailscaleState } from '../shared/companion'

/** Antwort von `tailscale status --json` → Zustand */
export function parseTailscaleStatus(raw: string): TailscaleState {
  let j: {
    BackendState?: unknown
    Self?: { TailscaleIPs?: unknown; DNSName?: unknown }
    CurrentTailnet?: { Name?: unknown }
    User?: Record<string, { LoginName?: unknown }>
    Peer?: Record<string, { OS?: unknown }> | null
  }
  try {
    j = JSON.parse(raw)
  } catch {
    return { state: 'stopped' }
  }
  if (j.BackendState !== 'Running') return { state: 'stopped' }
  const ips = Array.isArray(j.Self?.TailscaleIPs) ? (j.Self!.TailscaleIPs as unknown[]).filter((x): x is string => typeof x === 'string') : []
  const ip = ips.find((x) => /^\d+\.\d+\.\d+\.\d+$/.test(x))
  if (!ip) return { state: 'stopped' }
  const dns = typeof j.Self?.DNSName === 'string' ? j.Self.DNSName.replace(/\.$/, '') : ''
  const out: Extract<TailscaleState, { state: 'ready' }> = dns ? { state: 'ready', ip, name: dns } : { state: 'ready', ip }
  const account = typeof j.CurrentTailnet?.Name === 'string' ? j.CurrentTailnet.Name : undefined
  if (account) out.account = account
  // Peer fehlt oder ist null, wenn nur dieser PC im Tailnet ist
  if ('Peer' in j || 'CurrentTailnet' in j) {
    const peers = j.Peer && typeof j.Peer === 'object' ? Object.values(j.Peer) : []
    out.peers = peers.length
    out.phones = peers.filter((p) => typeof p?.OS === 'string' && /^(ios|android)$/i.test(p.OS)).length
  }
  return out
}

const cli = (): string | null => {
  const base = process.env.ProgramFiles || 'C:\\Program Files'
  const exe = join(base, 'Tailscale', 'tailscale.exe')
  return fs.existsSync(exe) ? exe : null
}

export function tailscaleState(ifs: Record<string, NetIf[] | undefined>): Promise<TailscaleState> {
  const exe = process.platform === 'win32' ? cli() : null
  // ohne CLI: Adresse am Netzwerkadapter reicht als Zeichen, dass Tailscale läuft
  const fallback = (): TailscaleState => {
    const ip = tailnetAddress(ifs)
    return ip ? { state: 'ready', ip } : exe ? { state: 'stopped' } : { state: 'missing' }
  }
  if (!exe) return Promise.resolve(fallback())
  return new Promise((resolve) => {
    execFile(exe, ['status', '--json'], { timeout: 3000, windowsHide: true }, (err, out) => {
      const s = parseTailscaleStatus(String(out ?? ''))
      resolve(err && s.state !== 'ready' ? fallback() : s)
    })
  })
}

const exePath = (name: string): string => join(process.env.ProgramFiles || 'C:\\Program Files', 'Tailscale', name)

/** Tailscale per winget installieren (feste Befehle, nichts aus dem Renderer) */
export function installTailscale(): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(false)
  const args = ['install', '-e', '--id', 'Tailscale.Tailscale', '--source', 'winget', '--silent', '--accept-source-agreements', '--accept-package-agreements', '--disable-interactivity']
  return new Promise((resolve) => {
    execFile('winget', args, { timeout: 10 * 60_000, windowsHide: true }, () => resolve(fs.existsSync(exePath('tailscale.exe'))))
  })
}

/** Port, unter dem Tailscale den Handy-Begleiter im Tailnet anbietet */
export const servePort = (local: number): number => (local < 65535 ? local + 1 : local - 1)

/** Feste Argumente für `tailscale serve` – nur Zahlen, nichts aus dem Renderer */
export function serveArgs(local: number, on: boolean): string[] {
  const p = servePort(local)
  return on ? ['serve', '--bg', `--http=${p}`, `http://127.0.0.1:${local}`] : ['serve', `--http=${p}`, 'off']
}

/**
 * Tailscale nimmt Verbindungen aus dem Tailnet selbst an und reicht sie lokal weiter.
 * Vorteil: Der Tailscale-Dienst hat schon eine Firewall-Freigabe für alle Netze –
 * VibeDesk braucht keine eigene und damit keine Adminrechte. Liefert den Port oder null.
 */
export function startServe(local: number): Promise<number | null> {
  const exe = exePath('tailscale.exe')
  if (process.platform !== 'win32' || !Number.isInteger(local) || !fs.existsSync(exe)) return Promise.resolve(null)
  return new Promise((resolve) => {
    execFile(exe, serveArgs(local, true), { timeout: 10_000, windowsHide: true }, (err) => resolve(err ? null : servePort(local)))
  })
}

export function stopServe(local: number): Promise<void> {
  const exe = exePath('tailscale.exe')
  if (process.platform !== 'win32' || !fs.existsSync(exe)) return Promise.resolve()
  return new Promise((resolve) => {
    execFile(exe, serveArgs(local, false), { timeout: 10_000, windowsHide: true }, () => resolve())
  })
}

/** Login-Link aus der Ausgabe von `tailscale up` */
export function loginUrl(out: string): string | null {
  return /https:\/\/login\.tailscale\.com\/[^\s]+/.exec(out)?.[0] ?? null
}

/**
 * Anmelden: startet die Tailscale-App (Symbol im Infobereich) und `tailscale up`.
 * Braucht es eine Anmeldung, kommt der Link zurück – VibeDesk öffnet ihn im Browser.
 */
export function startTailscaleLogin(open: (url: string) => void): Promise<boolean> {
  const ipn = exePath('tailscale-ipn.exe')
  const exe = exePath('tailscale.exe')
  if (!fs.existsSync(exe)) return Promise.resolve(false)
  if (fs.existsSync(ipn)) spawn(ipn, [], { detached: true, stdio: 'ignore' }).unref()
  return new Promise((resolve) => {
    let opened = false
    let out = ''
    const p = spawn(exe, ['up', '--timeout=5m'], { windowsHide: true })
    const onData = (d: Buffer): void => {
      out += d.toString()
      const url = loginUrl(out)
      if (url && !opened) {
        opened = true
        open(url)
        resolve(true)
      }
    }
    p.stdout.on('data', onData)
    p.stderr.on('data', onData)
    p.on('error', () => resolve(false))
    // ohne Link: schon angemeldet (Exit 0) oder Fehler
    p.on('exit', (code) => !opened && resolve(code === 0))
  })
}
