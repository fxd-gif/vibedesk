import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { execFile, execFileSync } from 'child_process'
import type { Project, SessionInfo } from '../shared/types'
import { buildBrainMcpConfig, buildHookSettings } from './hookSettings'

export interface PtyLike {
  onData(cb: (d: string) => void): void
  onExit(cb: (e: { exitCode: number }) => void): void
  write(d: string): void
  resize(cols: number, rows: number): void
  kill(): void
}

export type SpawnFn = (
  file: string,
  args: string[],
  opts: { cwd: string; env: Record<string, string>; cols: number; rows: number }
) => PtyLike

export interface SessionManagerOptions {
  spawn: SpawnFn
  tmpDir: string
  nodeExe: string
  forwarderPath: string
  port: () => number
  token: string
  maxSessions: () => number
  isClaudeInstalled?: () => boolean
  /** Gehirn: MCP-Server mitgeben, solange eingeschaltet */
  brain?: { mcpPath: string; enabled: () => boolean }
  /** Datei mit aktuellem Port + Token – Hooks und Gehirn finden darüber eine neu gestartete App */
  endpointFile?: string
}

interface Running {
  info: SessionInfo
  pty: PtyLike
  settingsFile: string
  mcpFile?: string
}

export function claudeOnPath(): boolean {
  try {
    execFileSync('where', ['claude'], { stdio: 'ignore', windowsHide: true })
    return true
  } catch {
    return false
  }
}

/** Version von Claude Code, z. B. "2.1.296" – null, wenn nicht installiert */
export function claudeVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('cmd.exe', ['/d', '/c', 'claude', '--version'], { windowsHide: true, timeout: 15000 }, (err, stdout) => {
      if (err) return resolve(null)
      resolve(/(\d+\.\d+\.\d+)/.exec(stdout)?.[1] ?? stdout.trim().slice(0, 40))
    })
  })
}

export class SessionManager {
  private sessions = new Map<string, Running>()
  private dataCbs: ((id: string, d: string) => void)[] = []
  private exitCbs: ((id: string, code: number) => void)[] = []

  constructor(private o: SessionManagerOptions) {}

  start(project: Project, opts: { resumeId?: string } = {}): SessionInfo {
    // ID landet in der cmd.exe-Zeile → nur harmlose Zeichen zulassen
    if (opts.resumeId !== undefined && !/^[A-Za-z0-9-]{1,64}$/.test(opts.resumeId)) throw new Error('Ungültige Session-ID')
    const max = this.o.maxSessions()
    if (this.sessions.size >= max) throw new Error(`Maximal ${max} Sessions gleichzeitig – schließe zuerst eine.`)
    const cmd = process.env.VIBEDESK_CLAUDE_CMD || 'claude'
    if (cmd === 'claude' && !(this.o.isClaudeInstalled ?? claudeOnPath)())
      throw new Error('Claude Code nicht gefunden. Installiere es mit: npm i -g @anthropic-ai/claude-code')

    const id = randomUUID()
    fs.mkdirSync(this.o.tmpDir, { recursive: true })
    const settingsFile = path.join(this.o.tmpDir, `session-${id}.json`)
    const brain = !!this.o.brain?.enabled()
    fs.writeFileSync(settingsFile, JSON.stringify(buildHookSettings(this.o.nodeExe, this.o.forwarderPath, { brain })))
    let mcpFile: string | undefined
    if (brain) {
      mcpFile = path.join(this.o.tmpDir, `session-${id}-mcp.json`)
      fs.writeFileSync(mcpFile, JSON.stringify(buildBrainMcpConfig(this.o.nodeExe, this.o.brain!.mcpPath, { sessionId: id, port: this.o.port(), token: this.o.token, endpoint: this.o.endpointFile })))
    }

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      VIBEDESK_SESSION_ID: id,
      VIBEDESK_PORT: String(this.o.port()),
      VIBEDESK_TOKEN: this.o.token,
      ...(this.o.endpointFile ? { VIBEDESK_ENDPOINT: this.o.endpointFile } : {})
    }
    delete env.ELECTRON_RUN_AS_NODE
    // Kein /s: der erste Token bleibt unquotiert, damit cmd die Anführungszeichen des Pfads stehen lässt
    const args = ['/d', '/c', cmd, '--settings', settingsFile, ...(mcpFile ? ['--mcp-config', mcpFile] : []), ...(opts.resumeId ? ['--resume', opts.resumeId] : [])]
    const pty = this.o.spawn('cmd.exe', args, {
      cwd: project.path,
      env,
      cols: 100,
      rows: 30
    })
    const info: SessionInfo = { id, projectId: project.id, name: project.name, cwd: project.path }
    this.sessions.set(id, { info, pty, settingsFile, mcpFile })
    pty.onData((d) => this.dataCbs.forEach((cb) => cb(id, d)))
    pty.onExit(({ exitCode }) => {
      this.cleanup(id)
      this.exitCbs.forEach((cb) => cb(id, exitCode))
    })
    return info
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.pty.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    if (cols > 0 && rows > 0) this.sessions.get(id)?.pty.resize(cols, rows)
  }

  stop(id: string): void {
    const s = this.sessions.get(id)
    if (!s) return
    this.cleanup(id)
    try {
      s.pty.kill()
    } catch {
      /* bereits beendet */
    }
  }

  stopAll(): void {
    ;[...this.sessions.keys()].forEach((id) => this.stop(id))
  }

  list(): SessionInfo[] {
    return [...this.sessions.values()].map((s) => s.info)
  }

  on(evt: 'data', cb: (id: string, d: string) => void): void
  on(evt: 'exit', cb: (id: string, code: number) => void): void
  on(evt: 'data' | 'exit', cb: (id: string, x: never) => void): void {
    if (evt === 'data') this.dataCbs.push(cb as (id: string, d: string) => void)
    else this.exitCbs.push(cb as (id: string, c: number) => void)
  }

  private cleanup(id: string): void {
    const s = this.sessions.get(id)
    if (!s) return
    this.sessions.delete(id)
    fs.rmSync(s.settingsFile, { force: true })
    if (s.mcpFile) fs.rmSync(s.mcpFile, { force: true })
  }
}
