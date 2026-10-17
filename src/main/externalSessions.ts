// Claude-Sessions, die VibeDesk nicht selbst gestartet hat (z. B. noch aus der Zeit vor einem Update):
// Melden sie sich per Hook aus einem Projektordner, zeigt der Inspector sie trotzdem an – nur ohne Terminal.
import type { HookEvent, Project, SessionInfo } from '../shared/types'

export class ExternalSessions {
  private map = new Map<string, SessionInfo>()

  constructor(
    private d: {
      known: (sessionId: string) => boolean
      projectOfDir: (dir: string) => Project | undefined
      added: (info: SessionInfo) => void
      ended: (sessionId: string) => void
    }
  ) {}

  /** Vor dem Weiterreichen jedes Hook-Events aufrufen – dann kennt der Renderer die Session schon */
  observe(e: HookEvent): void {
    if (this.d.known(e.sessionId)) return
    if (e.name === 'SessionEnd') {
      if (this.map.delete(e.sessionId)) this.d.ended(e.sessionId)
      return
    }
    if (this.map.has(e.sessionId)) return
    const cwd = typeof e.payload.cwd === 'string' ? e.payload.cwd : ''
    const p = cwd ? this.d.projectOfDir(cwd) : undefined
    if (!p) return
    const info: SessionInfo = { id: e.sessionId, projectId: p.id, name: p.name, cwd, external: true }
    this.map.set(e.sessionId, info)
    this.d.added(info)
  }

  get(sessionId: string): SessionInfo | undefined {
    return this.map.get(sessionId)
  }

  list(): SessionInfo[] {
    return [...this.map.values()]
  }
}
