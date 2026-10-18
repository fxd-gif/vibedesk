// Eigene Shell-Terminals (PowerShell/cmd) neben Claude – ohne Hooks, ohne Gehirn, nicht in Statistik oder Handy.
import { t } from '../shared/i18n'
import { randomUUID } from 'crypto'
import type { Project, ShellInfo, ShellKind } from '../shared/types'
import type { PtyLike, SpawnFn } from './sessionManager'

const MAX_SHELLS = 12

/** Programm + Argumente je Shell; ohne Logo, damit das Fenster gleich mit dem Prompt anfängt */
export function shellCommand(kind: ShellKind): { file: string; args: string[] } {
  if (kind === 'cmd') return { file: 'cmd.exe', args: ['/k'] }
  if (kind === 'pwsh') return { file: 'pwsh.exe', args: ['-NoLogo'] }
  return { file: 'powershell.exe', args: ['-NoLogo'] }
}

/** Shells bekommen die Umgebung der App – aber nichts, womit sie sich als VibeDesk-Session ausgeben könnten */
export function shellEnv(base: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(base)) {
    if (v === undefined || /^VIBEDESK_/i.test(k) || k === 'ELECTRON_RUN_AS_NODE') continue
    env[k] = v
  }
  return env
}

export class ShellManager {
  private shells = new Map<string, { info: ShellInfo; pty: PtyLike }>()
  private dataCbs: ((id: string, d: string) => void)[] = []
  private exitCbs: ((id: string, code: number) => void)[] = []

  constructor(private o: { spawn: SpawnFn; kind: () => ShellKind; env?: NodeJS.ProcessEnv }) {}

  start(project: Project, attachedTo?: string): ShellInfo {
    if (this.shells.size >= MAX_SHELLS) throw new Error(t('Maximal {max} Shells gleichzeitig – schließe zuerst eine.', { max: MAX_SHELLS }))
    const kind = this.o.kind()
    const { file, args } = shellCommand(kind)
    const id = randomUUID()
    const pty = this.o.spawn(file, args, { cwd: project.path, env: shellEnv(this.o.env ?? process.env), cols: 100, rows: 24 })
    const info: ShellInfo = { id, projectId: project.id, name: project.name, cwd: project.path, kind, ...(attachedTo ? { attachedTo } : {}) }
    this.shells.set(id, { info, pty })
    pty.onData((d) => this.dataCbs.forEach((cb) => cb(id, d)))
    pty.onExit(({ exitCode }) => {
      this.shells.delete(id)
      this.exitCbs.forEach((cb) => cb(id, exitCode))
    })
    return info
  }

  write(id: string, data: string): void {
    this.shells.get(id)?.pty.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    if (cols > 0 && rows > 0) this.shells.get(id)?.pty.resize(cols, rows)
  }

  stop(id: string): void {
    const s = this.shells.get(id)
    if (!s) return
    this.shells.delete(id)
    try {
      s.pty.kill()
    } catch {
      /* bereits beendet */
    }
  }

  stopAll(): void {
    ;[...this.shells.keys()].forEach((id) => this.stop(id))
  }

  list(): ShellInfo[] {
    return [...this.shells.values()].map((s) => s.info)
  }

  on(evt: 'data', cb: (id: string, d: string) => void): void
  on(evt: 'exit', cb: (id: string, code: number) => void): void
  on(evt: 'data' | 'exit', cb: (id: string, x: never) => void): void {
    if (evt === 'data') this.dataCbs.push(cb as (id: string, d: string) => void)
    else this.exitCbs.push(cb as (id: string, c: number) => void)
  }
}
