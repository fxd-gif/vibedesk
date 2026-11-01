// Anonym mitzählen – nur, wenn der User zugestimmt hat (Einstellung countMe).
// Alle paar Minuten meldet VibeDesk „diese Installation läuft“: einen Tages-Hash einer Zufalls-ID und die Version.
// Kein Name, keine Pfade, keine Projekte; der Hash wechselt jeden Tag, Tage lassen sich nicht verknüpfen.
// Wohin, steht in ping.json auf der Website – so lässt sich das Ziel ohne neues Release umstellen.
import { createHash, randomUUID } from 'crypto'
import type { SettingsStore } from './settingsStore'

export const PING_CONFIG_URL = 'https://fxd-gif.github.io/vibedesk/ping.json'
const EVERY_MS = 5 * 60_000
const CONFIG_TTL_MS = 60 * 60_000

/** Kennung für heute (UTC) – aus der Zufalls-ID, nicht zurückrechenbar */
export function dayHash(installId: string, now = new Date()): string {
  return createHash('sha256').update(`${installId}:${now.toISOString().slice(0, 10)}`).digest('hex')
}

/** Ziel aus ping.json – nur https (localhost für Tests), sonst nichts senden */
export function pingTarget(config: unknown): string | null {
  const url = (config as { url?: unknown } | null)?.url
  if (typeof url !== 'string') return null
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || (u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname)) ? url : null
  } catch {
    return null
  }
}

export class UsagePing {
  private timer: ReturnType<typeof setInterval> | null = null
  private target: { url: string | null; at: number } = { url: null, at: 0 }

  constructor(
    private settings: SettingsStore,
    private version: string,
    private configUrl = process.env.VIBEDESK_PING_CONFIG || PING_CONFIG_URL
  ) {}

  start(): void {
    if (this.timer) return
    setTimeout(() => void this.tick(), Number(process.env.VIBEDESK_PING_FIRST_MS) || 20_000)
    this.timer = setInterval(() => void this.tick(), EVERY_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Eingeschaltet → sofort einmal melden (etwa direkt nach der Zustimmung) */
  async tick(): Promise<boolean> {
    const s = this.settings.get()
    if (s.countMe !== true) return false
    let id = s.installId
    if (!id) {
      id = randomUUID()
      this.settings.set({ installId: id })
    }
    try {
      const url = await this.url()
      if (!url) return false
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ d: dayHash(id), v: this.version }),
        signal: AbortSignal.timeout(10_000)
      })
      return res.ok
    } catch {
      // offline oder Ziel weg – egal, nächstes Mal wieder
      return false
    }
  }

  private async url(): Promise<string | null> {
    if (Date.now() - this.target.at < CONFIG_TTL_MS) return this.target.url
    try {
      const res = await fetch(this.configUrl, { signal: AbortSignal.timeout(10_000) })
      this.target = { url: res.ok ? pingTarget(await res.json()) : null, at: Date.now() }
    } catch {
      this.target = { url: null, at: Date.now() }
    }
    return this.target.url
  }
}
