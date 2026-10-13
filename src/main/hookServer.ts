import http from 'http'
import { timingSafeEqual } from 'crypto'
import type { AddressInfo } from 'net'
import type { HookEvent } from '../shared/types'

const MAX_BODY = 1024 * 1024

/** Antwort an Claude Code (z. B. Kontext beim Session-Start) – wird vom Forwarder auf stdout ausgegeben */
export type HookReply = string | void | undefined

/** Werkzeug-Aufruf des Gehirn-MCP-Servers */
export type BrainHandler = (sessionId: string, tool: string, args: Record<string, unknown>) => { text: string; isError?: boolean }

/** Freigabe-Anfrage: wartet auf eine Antwort ('' = keine Entscheidung); cancel, wenn der Hook vorher aufgibt */
export type PermissionHandler = (e: HookEvent) => { reply: Promise<string>; cancel(): void }

/** Lokaler HTTP-Endpunkt für Claude-Code-Hooks (nur 127.0.0.1, Token-geschützt). */
export class HookServer {
  private server: http.Server | null = null

  constructor(
    private token: string,
    private onEvent: (e: HookEvent) => HookReply,
    private onBrain?: BrainHandler,
    private onPermission?: PermissionHandler
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
    const reply = (code: number, body?: string, type = 'text/plain; charset=utf-8'): void => {
      res.writeHead(code, body ? { connection: 'close', 'content-type': type } : { connection: 'close' })
      res.end(body)
    }
    if (req.method !== 'POST' || (req.url !== '/event' && req.url !== '/brain' && req.url !== '/permission')) return reply(404)
    if (req.url === '/brain' && !this.onBrain) return reply(404)
    if (req.url === '/permission' && !this.onPermission) return reply(404)
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
      let body: { sessionId?: unknown; payload?: unknown } & Record<string, unknown>
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        return reply(400)
      }
      if (req.url === '/brain') return this.brain(body, reply)
      if (typeof body?.sessionId !== 'string' || typeof body.payload !== 'object' || body.payload === null) return reply(400)
      const payload = body.payload as Record<string, unknown>
      const name = typeof payload.hook_event_name === 'string' ? payload.hook_event_name : 'unknown'
      const event: HookEvent = { sessionId: body.sessionId, name, payload, ts: Date.now() }
      let out: HookReply
      try {
        out = this.onEvent(event)
      } catch (err) {
        console.error('[hookServer] onEvent failed', err)
      }
      if (req.url === '/permission') return this.permission(event, res, reply)
      reply(200, out || undefined)
    })
  }

  /** Long-Poll: Antwort erst, wenn jemand entschieden hat. Bricht der Hook ab (Claude fragt dann selbst), verfällt die Anfrage. */
  private permission(e: HookEvent, res: http.ServerResponse, reply: (code: number, body?: string, type?: string) => void): void {
    let ask: ReturnType<PermissionHandler>
    try {
      ask = this.onPermission!(e)
    } catch (err) {
      console.error('[hookServer] onPermission failed', err)
      return reply(200)
    }
    let open = true
    res.on('close', () => {
      if (!open) return
      open = false
      ask.cancel()
    })
    const answer = (body: string): void => {
      if (!open) return
      open = false
      if (!res.destroyed) reply(200, body || undefined, 'application/json')
    }
    ask.reply.then(answer, () => answer(''))
  }

  private brain(body: Record<string, unknown>, reply: (code: number, body?: string, type?: string) => void): void {
    const { sessionId, tool, args } = (body ?? {}) as { sessionId?: unknown; tool?: unknown; args?: unknown }
    if (typeof sessionId !== 'string' || typeof tool !== 'string') return reply(400)
    const a = args && typeof args === 'object' && !Array.isArray(args) ? (args as Record<string, unknown>) : {}
    let r: { text: string; isError?: boolean }
    try {
      r = this.onBrain!(sessionId, tool, a)
    } catch (err) {
      r = { text: err instanceof Error ? err.message : String(err), isError: true }
    }
    reply(200, JSON.stringify(r), 'application/json')
  }
}
