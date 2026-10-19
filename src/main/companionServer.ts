// Handy-Begleiter: kleiner Webserver im lokalen Netz. Bewusst nicht nur 127.0.0.1 – das Handy muss ihn im WLAN
// erreichen. Darum: standardmäßig aus, Koppeln nur mit einem Einmal-Code, den der PC auf Knopfdruck zeigt; danach
// braucht jeder API-Aufruf den Geräte-Schlüssel (Authorization-Header, nie in der URL). Keine CORS-Freigaben,
// kleine Bodies, Bremse für Fehlversuche.
import { t } from '../shared/i18n'
import http from 'http'
import type { AddressInfo } from 'net'
import { randomBytes } from 'crypto'
import { RateLimiter } from '../shared/lounge'
import { isDecision } from '../shared/permissions'
import { deviceName, type CompanionDevice, type CompanionState } from '../shared/companion'
import { companionIcon, companionManifest, companionPage } from './companionPage'
import type { CompanionAuth } from './companionAuth'
import type { CompanionHub } from './companionHub'
import type { PowerControl } from './powerControl'

const MAX_BODY = 16 * 1024
const MAX_CLIENTS = 8
/** Long-Polling hält höchstens so lange, dann kommt der unveränderte Stand */
export const POLL_HOLD_MS = 25_000

/**
 * Absender für die Fehlversuch-Bremse. Hinter dem Cloudflare-Tunnel kommt alles von 127.0.0.1 –
 * dann zählt die Adresse, die Cloudflare mitschickt. Nur von loopback, sonst könnte man sie fälschen.
 */
export function clientIp(remote: string | undefined, cf: string | string[] | undefined): string {
  const r = remote ?? '?'
  const loop = r === '127.0.0.1' || r === '::1' || r === '::ffff:127.0.0.1'
  return loop && typeof cf === 'string' && cf.trim() ? `cf:${cf.trim().slice(0, 64)}` : r
}

export class CompanionServer {
  private server: http.Server | null = null
  private port = 0
  private clients = new Map<http.ServerResponse, string>()
  private state = '{}'
  /** zählt jeden neuen Stand hoch – fürs Long-Polling */
  private version = 0
  private waiters = new Set<() => void>()
  private heartbeat: ReturnType<typeof setInterval> | null = null
  /** Fehlversuche (falscher Schlüssel oder Code) pro Adresse und insgesamt */
  private fails = new RateLimiter(20, 10 * 60_000)
  private pairTries = new RateLimiter(30, 10 * 60_000)
  private powerLimit = new RateLimiter(5, 60_000)

  constructor(
    private auth: CompanionAuth,
    private hub: CompanionHub,
    private power: PowerControl,
    private onPaired: (d: CompanionDevice) => void = () => {}
  ) {}

  get running(): boolean {
    return !!this.server
  }

  /** tatsächlicher Port (bei 0 vom System gewählt) */
  get boundPort(): number {
    return this.port
  }

  async start(port: number, host = '0.0.0.0'): Promise<{ ok: true } | { ok: false; error: string }> {
    if (this.server && this.port === port) return { ok: true }
    await this.stop()
    const server = http.createServer((req, res) => this.handle(req, res))
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, host, () => resolve())
      })
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      return { ok: false, error: code === 'EADDRINUSE' ? t('Port {port} ist schon belegt – wähle einen anderen.', { port }) : String((err as Error).message) }
    }
    this.server = server
    this.port = (server.address() as AddressInfo).port
    this.heartbeat = setInterval(() => this.clients.forEach((_d, c) => c.write(': ping\n\n')), 15_000)
    return { ok: true }
  }

  stop(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = null
    this.clients.forEach((_d, c) => c.end())
    this.clients.clear()
    this.wake()
    const s = this.server
    this.server = null
    if (!s) return Promise.resolve()
    return new Promise((resolve) => {
      s.close(() => resolve())
      s.closeAllConnections()
    })
  }

  /** Abgemeldete Geräte sofort trennen (deviceId oder alle) */
  disconnect(deviceId?: string): void {
    for (const [c, id] of this.clients) {
      if (deviceId && id !== deviceId) continue
      c.end()
      this.clients.delete(c)
    }
    this.wake()
  }

  private wake(): void {
    const w = [...this.waiters]
    this.waiters.clear()
    w.forEach((f) => f())
  }

  push(state: CompanionState): void {
    this.state = JSON.stringify(state)
    this.version++
    const msg = `data: ${this.state}\n\n`
    this.clients.forEach((_d, c) => c.write(msg))
    this.wake()
  }

  private token(req: http.IncomingMessage): string {
    const h = req.headers.authorization
    return typeof h === 'string' && h.startsWith('Bearer ') ? h.slice(7).trim() : ''
  }

  private device(req: http.IncomingMessage): CompanionDevice | null {
    const given = this.token(req)
    return given ? this.auth.verify(given) : null
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    const common = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY' }
    const send = (code: number, body: string, type = 'application/json; charset=utf-8'): void => {
      if (res.headersSent) return
      res.writeHead(code, { ...common, 'content-type': type })
      res.end(body)
    }
    const json = (code: number, x: unknown): void => send(code, JSON.stringify(x))
    const url = new URL(req.url ?? '/', 'http://companion')
    const ip = clientIp(req.socket.remoteAddress, req.headers['cf-connecting-ip'])

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const nonce = randomBytes(16).toString('base64')
      res.writeHead(200, {
        ...common,
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
      })
      res.end(companionPage(nonce))
      return
    }
    if (req.method === 'GET' && url.pathname === '/manifest.webmanifest') return send(200, companionManifest(), 'application/manifest+json')
    if (req.method === 'GET' && url.pathname === '/icon.svg') return send(200, companionIcon(), 'image/svg+xml')
    if (!url.pathname.startsWith('/api/')) return send(404, '"not found"')

    // Koppeln: ohne Schlüssel, aber nur mit dem Code vom PC-Bildschirm
    if (url.pathname === '/api/pair') {
      if (req.method !== 'POST') return json(405, { ok: false, error: t('Methode nicht erlaubt') })
      if (!this.pairTries.allow(ip) || !this.pairTries.allow('*')) return json(429, { ok: false, error: t('Zu viele Versuche – warte ein paar Minuten.') })
      return this.body(req, (b) => {
        const r = this.auth.pair(b?.code, typeof b?.name === 'string' && b.name.trim() ? b.name : deviceName(String(req.headers['user-agent'] ?? '')))
        if (!r.ok) return json(200, r)
        this.onPaired(r.device)
        json(200, { ok: true, token: r.token, name: r.device.name })
      }, () => json(413, { ok: false, error: t('Zu groß') }))
    }

    const dev = this.device(req)
    if (!dev) {
      if (!this.fails.allow(ip)) return json(429, { ok: false, error: t('Zu viele Fehlversuche – warte ein paar Minuten.') })
      return json(401, { ok: false, error: t('Nicht gekoppelt') })
    }

    if (req.method === 'GET' && url.pathname === '/api/events') {
      if (this.clients.size >= MAX_CLIENTS) return json(503, { ok: false, error: t('Zu viele Geräte verbunden.') })
      res.writeHead(200, { ...common, 'content-type': 'text/event-stream; charset=utf-8', connection: 'keep-alive' })
      res.write(`retry: 2000\ndata: ${this.state}\n\n`)
      this.clients.set(res, dev.id)
      req.on('close', () => this.clients.delete(res))
      return
    }
      // Long-Polling für den Internet-Link: Cloudflare-Quick-Tunnels puffern SSE bis zum Ende
    if (req.method === 'GET' && url.pathname === '/api/poll') {
      const since = Number(url.searchParams.get('v'))
      const reply = (): void => send(200, `{"v":${this.version},"state":${this.state}}`)
      if (since !== this.version || this.waiters.size >= MAX_CLIENTS * 2) return reply()
      let done = false
      const finish = (): void => {
        if (done) return
        done = true
        clearTimeout(hold)
        this.waiters.delete(finish)
        // abgemeldet, während gewartet wurde?
        if (!this.server || !this.auth.verify(this.token(req))) return json(401, { ok: false, error: t('Nicht gekoppelt') })
        reply()
      }
      const hold = setTimeout(finish, POLL_HOLD_MS)
      this.waiters.add(finish)
      req.on('close', () => {
        done = true
        clearTimeout(hold)
        this.waiters.delete(finish)
      })
      return
    }
    // Terminal-Zeilen (nur wenn am PC freigegeben) – wartet auf Neues, darum wie Long-Polling
    if (req.method === 'GET' && url.pathname === '/api/term') {
      if (!this.hub.terminalAllowed()) return json(403, { ok: false, error: t('Das Terminal ist am PC nicht fürs Handy freigegeben.') })
      const p = url.searchParams
      void this.hub
        .terminal({ s: p.get('s'), e: p.get('e'), h: p.get('h'), v: p.get('v'), b: p.get('b'), w: p.get('w') })
        .then((r) => {
          if (req.destroyed) return
          // in der Zwischenzeit abgemeldet?
          if (!this.server || !this.auth.verify(this.token(req))) return json(401, { ok: false, error: t('Nicht gekoppelt') })
          json(200, r)
        })
        .catch((e) => json(500, { ok: false, error: String(e) }))
      return
    }
    if (req.method !== 'POST') return json(405, { ok: false, error: t('Methode nicht erlaubt') })

    this.body(req, (body) => {
      if (!body) return json(400, { ok: false, error: t('Ungültige Anfrage') })
      const fail = (e: unknown): void => json(500, { ok: false, error: String(e) })
      switch (url.pathname) {
        case '/api/permission':
          if (!isDecision(body.decision) || body.decision === 'terminal') return json(400, { ok: false, error: t('Ungültige Entscheidung') })
          return json(200, this.hub.answer(body.id, body.decision))
        case '/api/prompt':
          return void this.hub.prompt(body).then((r) => json(200, r), fail)
        case '/api/suggest':
          return void this.hub.suggest(body.sessionId).then((r) => json(200, r), fail)
        case '/api/power':
          if (!this.powerLimit.allow('p')) return json(429, { ok: false, error: t('Langsam – kurz warten.') })
          return void this.power.act(body.action).then((r) => {
            json(200, r)
            this.hub.touch()
          }, fail)
        case '/api/unpair':
          this.auth.revoke(dev.id)
          json(200, { ok: true })
          return this.disconnect(dev.id)
        default:
          return json(404, { ok: false, error: 'Unbekannt' })
      }
    }, () => json(413, { ok: false, error: t('Zu groß') }))
  }

  private body(req: http.IncomingMessage, done: (b: Record<string, unknown> | null) => void, tooBig: () => void): void {
    let size = 0
    let aborted = false
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      if (aborted) return
      size += c.length
      if (size > MAX_BODY) {
        aborted = true
        tooBig()
        req.resume()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      if (aborted) return
      try {
        const b = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        done(b && typeof b === 'object' && !Array.isArray(b) ? b : null)
      } catch {
        done(null)
      }
    })
  }
}
