// Handy von unterwegs: Tailscale verbindet PC und Handy in einem privaten, verschlüsselten Netz.
// VibeDesk muss dafür nichts ins Internet öffnen – es erkennt nur die Tailscale-Adresse des PCs.
import { execFile } from 'child_process'
import fs from 'fs'
import { join } from 'path'
import { tailnetAddress, type NetIf, type TailscaleState } from '../shared/companion'

/** Antwort von `tailscale status --json` → Zustand */
export function parseTailscaleStatus(raw: string): TailscaleState {
  let j: { BackendState?: unknown; Self?: { TailscaleIPs?: unknown; DNSName?: unknown } }
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
  return dns ? { state: 'ready', ip, name: dns } : { state: 'ready', ip }
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
