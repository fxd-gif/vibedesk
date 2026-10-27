import { t } from '../shared/i18n'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { execFile, execFileSync } from 'child_process'
import { claudeMissingMessage } from '../shared/setupHints'
import { AGENT_DEFAULT_CMD, agentCommand, agentMissingMessage, parseAgent } from '../shared/agents'
import { AgentActivity, type ActivityStatus } from '../shared/agentActivity'
import type { AgentKind, Project, SessionInfo } from '../shared/types'
import { buildBrainMcpConfig, buildHookSettings, userStatusLine } from './hookSettings'

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
  /** Gemini CLI / Codex: liegt der Befehl im PATH? */
  isCommandInstalled?: (cmd: string) => boolean
  /** Gehirn: MCP-Server mitgeben, solange eingeschaltet */
  brain?: { mcpPath: string; enabled: () => boolean }
  /** Datei mit aktuellem Port + Token – Hooks und Gehirn finden darüber eine neu gestartete App */
  endpointFile?: string
  /** VibeDesk-Statuszeile (Abo-Limits); die eigene Statuszeile des Nutzers läuft darin weiter */
  statusLine?: { path: string; configDir: string }
}

interface Running {
  info: SessionInfo
  pty: PtyLike
  /** nur bei Claude: Hooks, Statuszeile und MCP */
  settingsFile?: string
  mcpFile?: string
  /** nur bei Gemini CLI / Codex: Status aus dem Ausgabestrom statt aus Hooks */
  activity?: AgentActivity
}

/** so oft prüft VibeDesk, ob die Ausgabe eines Agenten ohne Hooks zur Ruhe gekommen ist */
const ACTIVITY_TICK_MS = 1000

export function commandOnPath(cmd: string): boolean {
  try {
    execFileSync('where', [cmd], { stdio: 'ignore', windowsHide: true })
    return true
  } catch {
    return false
  }
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
  private activityCbs: ((id: string, status: ActivityStatus) => void)[] = []
  private ticker: ReturnType<typeof setInterval> | null = null

  constructor(private o: SessionManagerOptions) {}

  /** opts.cwd: Unterordner des Projekts (z. B. ein Worktree aus Merge Studio) statt des Projektordners; opts.agent: Gemini CLI / Codex (Beta) statt Claude */
  start(project: Project, opts: { resumeId?: string; cwd?: string; agent?: AgentKind } = {}): SessionInfo {
    // ID landet in der cmd.exe-Zeile → nur harmlose Zeichen zulassen
    if (opts.resumeId !== undefined && !/^[A-Za-z0-9-]{1,64}$/.test(opts.resumeId)) throw new Error(t('Ungültige Session-ID'))
    let cwd = project.path
    if (opts.cwd) {
      const abs = path.resolve(opts.cwd)
      const rel = path.relative(project.path, abs)
      if (rel.startsWith('..') || path.isAbsolute(rel) || !fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) throw new Error(t('Ordner liegt nicht im Projekt'))
      cwd = abs
    }
    const max = this.o.maxSessions()
    if (this.sessions.size >= max) throw new Error(t('Maximal {max} Sessions gleichzeitig – schließe zuerst eine.', { max }))
    const agent = parseAgent(opts.agent)
    if (agent !== 'claude') return this.startOther(project, cwd, agent)
    const cmd = process.env.VIBEDESK_CLAUDE_CMD || 'claude'
    if (cmd === 'claude' && !(this.o.isClaudeInstalled ?? claudeOnPath)())
      throw new Error(claudeMissingMessage())

    const id = randomUUID()
    fs.mkdirSync(this.o.tmpDir, { recursive: true })
    const settingsFile = path.join(this.o.tmpDir, `session-${id}.json`)
    const brain = !!this.o.brain?.enabled()
    // Unsere Statuszeile ersetzt per --settings die eigene – darum die eigene finden und darin weiterlaufen lassen
    const own = this.o.statusLine ? userStatusLine(settingsFiles(cwd, this.o.statusLine.configDir)) : null
    const statusLine = this.o.statusLine ? { path: this.o.statusLine.path, padding: own?.padding } : undefined
    // Der MCP-Server läuft immer (Desktop-Werkzeuge); die Gehirn-Werkzeuge nur, solange das Gehirn an ist
    const mcp = !!this.o.brain
    fs.writeFileSync(settingsFile, JSON.stringify(buildHookSettings(this.o.nodeExe, this.o.forwarderPath, { brain: mcp, statusLine })))
    let mcpFile: string | undefined
    if (mcp) {
      mcpFile = path.join(this.o.tmpDir, `session-${id}-mcp.json`)
      fs.writeFileSync(mcpFile, JSON.stringify(buildBrainMcpConfig(this.o.nodeExe, this.o.brain!.mcpPath, { sessionId: id, port: this.o.port(), token: this.o.token, endpoint: this.o.endpointFile, brain })))
    }

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      VIBEDESK_SESSION_ID: id,
      VIBEDESK_PORT: String(this.o.port()),
      VIBEDESK_TOKEN: this.o.token,
      ...(this.o.endpointFile ? { VIBEDESK_ENDPOINT: this.o.endpointFile } : {}),
      ...(own ? { VIBEDESK_USER_STATUSLINE: own.command } : {})
    }
    delete env.ELECTRON_RUN_AS_NODE
    // Kein /s: der erste Token bleibt unquotiert, damit cmd die Anführungszeichen des Pfads stehen lässt
    const args = ['/d', '/c', cmd, '--settings', settingsFile, ...(mcpFile ? ['--mcp-config', mcpFile] : []), ...(opts.resumeId ? ['--resume', opts.resumeId] : [])]
    const pty = this.o.spawn('cmd.exe', args, {
      cwd,
      env,
      cols: 100,
      rows: 30
    })
    const info: SessionInfo = { id, projectId: project.id, name: sessionName(project, cwd), cwd, agent: 'claude' }
    this.sessions.set(id, { info, pty, settingsFile, mcpFile })
    pty.onData((d) => this.dataCbs.forEach((cb) => cb(id, d)))
    pty.onExit(({ exitCode }) => {
      this.cleanup(id)
      this.exitCbs.forEach((cb) => cb(id, exitCode))
    })
    return info
  }

  /** Gemini CLI / Codex (Beta): nur der Befehl im Projektordner – ohne Claude-Flags, Hooks, Statuszeile und Fortsetzen */
  private startOther(project: Project, cwd: string, agent: Exclude<AgentKind, 'claude'>): SessionInfo {
    const cmd = agentCommand(agent, process.env)
    if (cmd === AGENT_DEFAULT_CMD[agent] && !(this.o.isCommandInstalled ?? commandOnPath)(cmd)) throw new Error(agentMissingMessage(agent))
    const id = randomUUID()
    const env: Record<string, string> = { ...(process.env as Record<string, string>) }
    // keine Zugangsdaten für den Hook-Server – auch nicht geerbt, falls VibeDesk selbst aus einer Session kommt
    for (const k of ['ELECTRON_RUN_AS_NODE', 'VIBEDESK_SESSION_ID', 'VIBEDESK_PORT', 'VIBEDESK_TOKEN', 'VIBEDESK_ENDPOINT', 'VIBEDESK_USER_STATUSLINE']) delete env[k]
    const pty = this.o.spawn('cmd.exe', ['/d', '/c', cmd], { cwd, env, cols: 100, rows: 30 })
    const info: SessionInfo = { id, projectId: project.id, name: sessionName(project, cwd), cwd, agent }
    const activity = new AgentActivity()
    this.sessions.set(id, { info, pty, activity })
    pty.onData((d) => {
      this.dataCbs.forEach((cb) => cb(id, d))
      this.emitActivity(id, activity.output(Date.now(), d))
    })
    pty.onExit(({ exitCode }) => {
      this.cleanup(id)
      this.exitCbs.forEach((cb) => cb(id, exitCode))
    })
    this.startTicker()
    return info
  }

  write(id: string, data: string): void {
    const s = this.sessions.get(id)
    s?.activity?.input(Date.now())
    s?.pty.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    if (!(cols > 0 && rows > 0)) return
    const s = this.sessions.get(id)
    // Neuzeichnen nach einer Größenänderung ist keine Arbeit
    s?.activity?.input(Date.now())
    s?.pty.resize(cols, rows)
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
  /** Status von Gemini CLI / Codex aus dem Ausgabestrom (Claude meldet sich per Hook) */
  on(evt: 'activity', cb: (id: string, status: ActivityStatus) => void): void
  on(evt: 'data' | 'exit' | 'activity', cb: (id: string, x: never) => void): void {
    if (evt === 'data') this.dataCbs.push(cb as (id: string, d: string) => void)
    else if (evt === 'activity') this.activityCbs.push(cb as (id: string, s: ActivityStatus) => void)
    else this.exitCbs.push(cb as (id: string, c: number) => void)
  }

  private emitActivity(id: string, status: ActivityStatus | null): void {
    if (status) this.activityCbs.forEach((cb) => cb(id, status))
  }

  private startTicker(): void {
    if (this.ticker) return
    this.ticker = setInterval(() => {
      const now = Date.now()
      for (const [id, s] of this.sessions) if (s.activity) this.emitActivity(id, s.activity.tick(now))
    }, ACTIVITY_TICK_MS)
    this.ticker.unref?.()
  }

  private cleanup(id: string): void {
    const s = this.sessions.get(id)
    if (!s) return
    this.sessions.delete(id)
    if (s.settingsFile) fs.rmSync(s.settingsFile, { force: true })
    if (s.mcpFile) fs.rmSync(s.mcpFile, { force: true })
    if (this.ticker && ![...this.sessions.values()].some((x) => x.activity)) {
      clearInterval(this.ticker)
      this.ticker = null
    }
  }
}

const sessionName = (project: Project, cwd: string): string => (cwd === project.path ? project.name : `${project.name} · ${path.basename(cwd)}`)

/** Claude-Code-Settings in Vorrang-Reihenfolge: Projekt lokal, Projekt, Nutzer */
function settingsFiles(cwd: string, configDir: string): { read(): string | null }[] {
  const read = (f: string) => (): string | null => {
    try {
      return fs.readFileSync(f, 'utf8')
    } catch {
      return null
    }
  }
  return [path.join(cwd, '.claude', 'settings.local.json'), path.join(cwd, '.claude', 'settings.json'), path.join(configDir, 'settings.json')].map((f) => ({ read: read(f) }))
}
