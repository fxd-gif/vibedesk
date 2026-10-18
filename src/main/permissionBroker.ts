// Hält Freigabe-Anfragen von Claude Code offen, bis jemand antwortet – am Desktop, auf dem Handy oder im Terminal.
import { t } from '../shared/i18n'
import { randomBytes } from 'crypto'
import type { HookEvent } from '../shared/types'
import { cleanSuggestions, describePermission, permissionReply, sameCall, type PermissionAsk, type PermissionDecision } from '../shared/permissions'

/** knapp unter dem Hook-Timeout (600 s) – danach fragt Claude normal im Terminal */
export const ASK_MAX_MS = 590_000

interface Pending {
  ask: PermissionAsk
  input: unknown
  suggestions: unknown[] | null
  resolve(body: string): void
  timer: ReturnType<typeof setTimeout>
}

/** Ereignisse, nach denen eine offene Anfrage sicher erledigt ist (z. B. im Terminal beantwortet) */
const SETTLES = new Set(['UserPromptSubmit', 'Stop', 'SessionEnd'])

export class PermissionBroker {
  private pending = new Map<string, Pending>()

  constructor(
    private o: {
      /** „Freigaben in VibeDesk beantworten“ */
      enabled(): boolean
      emit(list: PermissionAsk[]): void
      maxMs?: number
    }
  ) {}

  list(): PermissionAsk[] {
    return [...this.pending.values()].map((p) => p.ask).sort((a, b) => a.ts - b.ts)
  }

  /** Neue Anfrage vom Hook. Liefert den Antwort-Body ('' = keine Entscheidung). `cancel` räumt ab, wenn der Hook aufgibt. */
  ask(sessionId: string, payload: Record<string, unknown>): { reply: Promise<string>; cancel(): void } {
    if (!this.o.enabled()) return { reply: Promise.resolve(''), cancel: () => {} }
    const tool = typeof payload.tool_name === 'string' ? payload.tool_name.slice(0, 200) : t('unbekannt')
    const suggestions = cleanSuggestions(payload.permission_suggestions)
    const id = randomBytes(8).toString('hex')
    const { summary, detail } = describePermission(tool, payload.tool_input)
    let resolve!: (b: string) => void
    const reply = new Promise<string>((r) => (resolve = r))
    const timer = setTimeout(() => this.finish(id, ''), this.o.maxMs ?? ASK_MAX_MS)
    this.pending.set(id, {
      ask: { id, sessionId, tool, summary, detail, canAlways: !!suggestions, ts: Date.now() },
      input: payload.tool_input,
      suggestions,
      resolve,
      timer
    })
    this.changed()
    return { reply, cancel: () => this.finish(id, '') }
  }

  answer(id: string, decision: PermissionDecision): boolean {
    const p = this.pending.get(id)
    if (!p) return false
    this.finish(id, permissionReply(decision, p.suggestions))
    return true
  }

  /** Hook-Ereignisse beobachten: Was danach kommt, zeigt, dass die Anfrage anderswo beantwortet wurde. */
  onHook(e: HookEvent): void {
    for (const [id, p] of this.pending) {
      if (p.ask.sessionId !== e.sessionId) continue
      const toolDone = (e.name === 'PostToolUse' || e.name === 'PostToolUseFailure') && sameCall(p.ask.tool, p.input, String(e.payload.tool_name ?? ''), e.payload.tool_input)
      if (toolDone || SETTLES.has(e.name)) this.finish(id, '')
    }
  }

  /** Session beendet → alles von ihr verwerfen */
  dropSession(sessionId: string): void {
    for (const [id, p] of this.pending) if (p.ask.sessionId === sessionId) this.finish(id, '')
  }

  dropAll(): void {
    for (const id of [...this.pending.keys()]) this.finish(id, '')
  }

  private finish(id: string, body: string): void {
    const p = this.pending.get(id)
    if (!p) return
    this.pending.delete(id)
    clearTimeout(p.timer)
    p.resolve(body)
    this.changed()
  }

  private changed(): void {
    this.o.emit(this.list())
  }
}
