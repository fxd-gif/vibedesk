import http from 'http'
import { timingSafeEqual } from 'crypto'
import type { AddressInfo } from 'net'
import type { HookEvent } from '../shared/types'

const MAX_BODY = 1024 * 1024

/** Lokaler HTTP-Endpunkt für Claude-Code-Hooks (nur 127.0.0.1, Token-geschützt). */
export class HookServer {
  private server: http.Server | null = null

  constructor(
    private token: string,
    private onEvent: (e: HookEvent) => void
  ) {}

  start(): Promise<number> {
    const server = http.createServer((req, res) => this.handle(req, res))
    this.server = server
    return new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port))
    })
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) return resolve()
      this.server.close(() => resolve())
      this.server.closeAllConnections()
      this.server = null
    })
  }

  private tokenOk(given: string | string[] | undefined): boolean {
    if (typeof given !== 'string') return false
    const a = Buffer.from(given)
    const b = Buffer.from(this.token)
    return a.length === b.length && timingSafeEqual(a, b)
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    const reply = (code: number): void => {
      res.writeHead(code, { connection: 'close' })
      res.end()
    }
    if (req.method !== 'POST' || req.url !== '/event') return reply(404)
    if (!this.tokenOk(req.headers['x-vibedesk-token'])) return reply(403)

    let size = 0
    const chunks: Buffer[] = []
    let aborted = false
    req.on('data', (c: Buffer) => {
      if (aborted) return
      size += c.length
      if (size > MAX_BODY) {
        aborted = true
        reply(413)
        req.resume()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      if (aborted) return
      let body: { sessionId?: unknown; payload?: unknown }
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        return reply(400)
      }
      if (typeof body?.sessionId !== 'string' || typeof body.payload !== 'object' || body.payload === null) return reply(400)
      const payload = body.payload as Record<string, unknown>
      const name = typeof payload.hook_event_name === 'string' ? payload.hook_event_name : 'unknown'
      try {
        this.onEvent({ sessionId: body.sessionId, name, payload, ts: Date.now() })
      } catch (err) {
        console.error('[hookServer] onEvent failed', err)
      }
      reply(200)
    })
  }
}
