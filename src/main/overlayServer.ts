import { t } from '../shared/i18n'
import http from 'http'
import { randomBytes, timingSafeEqual } from 'crypto'
import { overlayPage } from './overlayPage'
import type { OverlayStatus } from '../shared/types'

/**
 * Lokaler Endpunkt für die OBS-Browserquelle: nur 127.0.0.1, Token-geschützt, nur lesend.
 * Liefert die Overlay-Seite und den Live-Zustand per Server-Sent Events.
 */
export class OverlayServer {
  private server: http.Server | null = null
  private port = 0
  private clients = new Set<http.ServerResponse>()
  private state = '{}'
  private heartbeat: ReturnType<typeof setInterval> | null = null

  constructor(private token: () => string) {}

  get status(): OverlayStatus {
    return this.server ? { running: true, port: this.port } : { running: false }
  }

  async start(port: number): Promise<OverlayStatus> {
    if (this.server && this.port === port) return this.status
    await this.stop()
    const server = http.createServer((req, res) => this.handle(req, res))
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, '127.0.0.1', () => resolve())
      })
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      return { running: false, error: code === 'EADDRINUSE' ? t('Port {port} ist schon belegt – wähle einen anderen.', { port }) : String((err as Error).message) }
    }
    this.server = server
    this.port = port
    this.heartbeat = setInterval(() => this.clients.forEach((c) => c.write(': ping\n\n')), 20_000)
    return this.status
  }

  stop(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = null
    this.clients.forEach((c) => c.end())
    this.clients.clear()
    const s = this.server
    this.server = null
    if (!s) return Promise.resolve()
    return new Promise((resolve) => {
      s.close(() => resolve())
      s.closeAllConnections()
    })
  }

  push(state: unknown): void {
    this.state = JSON.stringify(state ?? {})
    const msg = `data: ${this.state}\n\n`
    this.clients.forEach((c) => c.write(msg))
  }

  private tokenOk(given: string | null): boolean {
    if (!given) return false
    const a = Buffer.from(given)
    const b = Buffer.from(this.token())
    return a.length === b.length && timingSafeEqual(a, b)
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    const end = (code: number): void => {
      res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8', connection: 'close' })
      res.end(String(code))
    }
    if (req.method !== 'GET') return end(405)
    // Schutz vor DNS-Rebinding: nur direkte Aufrufe über localhost
    const host = (req.headers.host ?? '').toLowerCase()
    if (host !== `127.0.0.1:${this.port}` && host !== `localhost:${this.port}`) return end(403)
    const url = new URL(req.url ?? '/', `http://${host}`)
    if (!this.tokenOk(url.searchParams.get('token'))) return end(403)

    const common = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' }
    if (url.pathname === '/overlay') {
      const nonce = randomBytes(16).toString('base64')
      res.writeHead(200, {
        ...common,
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:`
      })
      res.end(overlayPage(nonce))
      return
    }
    if (url.pathname === '/events') {
      res.writeHead(200, { ...common, 'content-type': 'text/event-stream', connection: 'keep-alive' })
      res.write(`retry: 2000\ndata: ${this.state}\n\n`)
      this.clients.add(res)
      req.on('close', () => this.clients.delete(res))
      return
    }
    end(404)
  }
}
