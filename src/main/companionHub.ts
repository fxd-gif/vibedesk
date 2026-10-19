// Zentrale des Handy-Begleiters: führt Session-Stand, Freigaben und Claudes letzte Antworten zusammen
// und erledigt die Aufträge vom Handy (Prompt ausformulieren + abschicken, Vorschläge).
import { t } from '../shared/i18n'
import fs from 'fs'
import path from 'path'
import { RateLimiter } from '../shared/lounge'
import type { HookEvent } from '../shared/types'
import type { PermissionDecision } from '../shared/permissions'
import {
  cleanPolished,
  digestTranscript,
  emptySnapshot,
  IDEA_MAX,
  oneLine,
  parseSuggestions,
  polishInput,
  PROMPT_MAX,
  suggestInput,
  TERM_KEYS,
  type AiContext,
  type CompanionSnapshot,
  type CompanionState,
  type Digest,
  type PromptTarget,
  type Suggestion,
  type TermChunk,
  type TermQuery
} from '../shared/companion'
import type { PermissionBroker } from './permissionBroker'

const TAIL_BYTES = 256 * 1024
/** Hooks, nach denen Claude etwas Neues gesagt haben kann */
const REFRESH_ON = new Set(['Stop', 'Notification', 'PermissionRequest', 'SubagentStop'])

export interface HubDeps {
  broker: PermissionBroker
  /** claude -p mit Haiku, ohne Werkzeuge; liefert stdout */
  ai(input: string): Promise<string>
  /** Prompt in die passende Session tippen und abschicken (über den Renderer) */
  sendPrompt(target: PromptTarget, text: string): Promise<boolean>
  push(state: CompanionState): void
  /** Ordner mit Claudes Transkripten – nur dort wird gelesen */
  transcriptsDir: string
  shutdownAt?(): number | null
  /** ganzes Terminal fürs Handy freigegeben? (Einstellung am PC, wird bei jeder Abfrage geprüft) */
  terminalOn?(): boolean
  /** Zeilen aus dem Terminal einer Session (über den Renderer) */
  readTerminal?(q: TermQuery): Promise<TermChunk | null>
  /** Tasten vom Handy erlaubt? (zweite Einstellung, nur mit Terminal) */
  keysOn?(): boolean
  /** Rohdaten ins PTY einer Session */
  writeSession?(sessionId: string, data: string): void
}

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

interface SessionExtra {
  transcript?: string
  digest: Digest
  suggestions?: { key: string; list: Suggestion[] }
}

export class CompanionHub {
  private snap: CompanionSnapshot = emptySnapshot()
  private extra = new Map<string, SessionExtra>()
  private busy: CompanionState['busy'] = {}
  private running = new Set<string>()
  private promptFast = new RateLimiter(1, 2000)
  private promptHour = new RateLimiter(60, 3600_000)
  private aiHour = new RateLimiter(40, 3600_000)
  private keyLimit = new RateLimiter(12, 4000)
  private pushTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private d: HubDeps) {}

  setSnapshot(s: CompanionSnapshot): void {
    this.snap = s
    for (const id of this.extra.keys()) if (!s.sessions.some((x) => x.id === id)) this.extra.delete(id)
    this.changed()
  }

  onHook(e: HookEvent): void {
    const x = this.ensure(e.sessionId)
    const tp = e.payload.transcript_path
    if (typeof tp === 'string' && this.allowedTranscript(tp)) x.transcript = tp
    if (e.name === 'UserPromptSubmit') {
      const prompt = typeof e.payload.prompt === 'string' ? e.payload.prompt : ''
      x.digest = { ...x.digest, prompt: prompt.slice(0, 1200), reply: '' }
      x.suggestions = undefined
      this.changed()
    }
    if (REFRESH_ON.has(e.name)) void this.refresh(e.sessionId)
  }

  /** Freigaben oder Strom-Zustand haben sich geändert → Handys neu versorgen */
  touch(): void {
    this.changed()
  }

  state(): CompanionState {
    return {
      sessions: this.snap.sessions.map((s) => {
        const x = this.extra.get(s.id)
        const key = x ? this.suggestKey(x.digest, s.status) : ''
        return { ...s, said: x?.digest.reply ?? '', asked: (x?.digest.prompt ?? '').slice(0, 600), suggestions: x?.suggestions?.key === key ? x.suggestions.list : null }
      }),
      projects: this.snap.projects,
      notices: this.snap.notices,
      permissions: this.d.broker.list(),
      busy: { ...this.busy },
      shutdownAt: this.d.shutdownAt?.() ?? null,
      terminal: this.terminalAllowed(),
      keys: this.keysAllowed(),
      limits: this.snap.limits ?? null
    }
  }

  keysAllowed(): boolean {
    return this.terminalAllowed() && !!this.d.keysOn?.() && !!this.d.writeSession
  }

  /** Eine Taste aus TERM_KEYS in die Session – gebremst, damit kein Dauerfeuer durchgeht */
  key(body: { sessionId?: unknown; key?: unknown }): Result {
    if (!this.keysAllowed()) return { ok: false, error: t('Tasten vom Handy sind am PC nicht erlaubt.') }
    const session = typeof body.sessionId === 'string' ? this.snap.sessions.find((x) => x.id === body.sessionId) : undefined
    if (!session) return { ok: false, error: t('Diese Session gibt es nicht mehr.') }
    const seq = typeof body.key === 'string' && Object.hasOwn(TERM_KEYS, body.key) ? TERM_KEYS[body.key] : undefined
    if (!seq) return { ok: false, error: t('Diese Taste gibt es nicht.') }
    if (!this.keyLimit.allow(session.id)) return { ok: false, error: t('Langsam – kurz warten und nochmal.') }
    this.d.writeSession!(session.id, seq)
    return { ok: true }
  }

  terminalAllowed(): boolean {
    return !!this.snap.terminal && !!this.d.terminalOn?.() && !!this.d.readTerminal
  }

  /** Terminal-Zeilen fürs Handy – Werte aus der URL streng prüfen */
  async terminal(raw: Record<string, string | null>): Promise<Result<{ chunk: TermChunk }>> {
    if (!this.terminalAllowed()) return { ok: false, error: t('Das Terminal ist am PC nicht fürs Handy freigegeben.') }
    const sessionId = raw.s ?? ''
    if (!this.snap.sessions.some((x) => x.id === sessionId)) return { ok: false, error: t('Diese Session gibt es nicht mehr.') }
    const int = (v: string | null, dflt: number): number => {
      const n = Number(v)
      return v !== null && v !== '' && Number.isInteger(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER ? n : dflt
    }
    const q: TermQuery = { sessionId, epoch: int(raw.e, 0), have: int(raw.h, 0), v: int(raw.v, 0), wait: raw.w === '1' }
    if (raw.b !== null && raw.b !== undefined && raw.b !== '') q.before = int(raw.b, 0)
    const chunk = await this.d.readTerminal!(q)
    if (!chunk) return { ok: false, error: t('Das Terminal antwortet gerade nicht.') }
    return { ok: true, chunk }
  }

  answer(id: unknown, decision: PermissionDecision, feedback?: unknown): Result {
    if (typeof id !== 'string' || !this.d.broker.answer(id, decision, typeof feedback === 'string' ? feedback : undefined)) return { ok: false, error: t('Diese Freigabe ist schon erledigt.') }
    return { ok: true }
  }

  /** Idee oder fertiger Vorschlag vom Handy → (optional ausformulieren) → in die Session */
  async prompt(body: { sessionId?: unknown; projectId?: unknown; text?: unknown; polish?: unknown }): Promise<Result<{ text: string }>> {
    const raw = typeof body.text === 'string' ? body.text.trim() : ''
    const polish = body.polish === true
    if (!raw) return { ok: false, error: t('Schreib erst, was Claude tun soll.') }
    if (raw.length > (polish ? IDEA_MAX : PROMPT_MAX)) return { ok: false, error: t('Das ist zu lang fürs Handy.') }
    const session = typeof body.sessionId === 'string' ? this.snap.sessions.find((s) => s.id === body.sessionId) : undefined
    const project = !session && typeof body.projectId === 'string' ? this.snap.projects.find((p) => p.id === body.projectId) : undefined
    if (!session && !project) return { ok: false, error: t('Diese Session gibt es nicht mehr.') }
    if (session && this.d.broker.list().some((p) => p.sessionId === session.id)) return { ok: false, error: t('Claude wartet noch auf eine Freigabe – beantworte sie zuerst.') }
    if (!this.promptFast.allow('p') || !this.promptHour.allow('p')) return { ok: false, error: t('Langsam – kurz warten und nochmal.') }

    let text = raw
    if (polish) {
      const key = session?.id ?? `project:${project!.id}`
      const r = await this.runAi(key, 'polish', polishInput(raw, this.context(session?.id, project?.name)))
      if (!r.ok) return r
      text = cleanPolished(r.out) || raw
    }
    text = oneLine(text).slice(0, PROMPT_MAX)
    const sent = await this.d.sendPrompt(session ? { sessionId: session.id } : { projectId: project!.id }, text)
    if (!sent) return { ok: false, error: t('VibeDesk konnte den Prompt nicht abschicken.') }
    if (session) {
      const x = this.ensure(session.id)
      x.suggestions = undefined
    }
    this.changed()
    return { ok: true, text }
  }

  /** „Wie geht es weiter?“ – drei Vorschläge für die Session */
  async suggest(sessionId: unknown): Promise<Result<{ suggestions: Suggestion[] }>> {
    const s = typeof sessionId === 'string' ? this.snap.sessions.find((x) => x.id === sessionId) : undefined
    if (!s) return { ok: false, error: t('Diese Session gibt es nicht mehr.') }
    const x = this.ensure(s.id)
    await this.refresh(s.id)
    const key = this.suggestKey(x.digest, s.status)
    if (x.suggestions?.key === key) return { ok: true, suggestions: x.suggestions.list }
    const r = await this.runAi(s.id, 'suggest', suggestInput(this.context(s.id)))
    if (!r.ok) return r
    const list = parseSuggestions(r.out)
    if (!list.length) return { ok: false, error: t('Claude hatte gerade keine Idee – versuch es gleich nochmal.') }
    x.suggestions = { key, list }
    this.changed()
    return { ok: true, suggestions: list }
  }

  /** Je Session und Art höchstens ein Auftrag – Vorschläge (laufen auch automatisch) blockieren das Ausformulieren nicht */
  private async runAi(key: string, kind: 'polish' | 'suggest', input: string): Promise<{ ok: true; out: string } | { ok: false; error: string }> {
    const job = `${key}|${kind}`
    if (this.running.has(job)) return { ok: false, error: kind === 'polish' ? t('Claude formuliert gerade schon einen Prompt.') : t('Claude überlegt schon.') }
    if (!this.aiHour.allow('ai')) return { ok: false, error: t('Für diese Stunde sind genug KI-Aufträge gelaufen.') }
    this.running.add(job)
    this.syncBusy()
    try {
      return { ok: true, out: await this.d.ai(input) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    } finally {
      this.running.delete(job)
      this.syncBusy()
    }
  }

  /** Anzeige fürs Handy: Ausformulieren hat Vorrang */
  private syncBusy(): void {
    const busy: CompanionState['busy'] = {}
    for (const job of this.running) {
      const [key, kind] = job.split('|') as [string, 'polish' | 'suggest']
      if (kind === 'polish' || !busy[key]) busy[key] = kind
    }
    this.busy = busy
    this.changed()
  }

  private context(sessionId?: string, projectName?: string): AiContext {
    const s = sessionId ? this.snap.sessions.find((x) => x.id === sessionId) : undefined
    const x = sessionId ? this.extra.get(sessionId) : undefined
    return {
      project: s?.name ?? projectName ?? '',
      digest: x?.digest ?? { prompt: '', reply: '', title: '' },
      todos: s?.todos ?? { done: 0, total: 0, active: '' },
      status: s?.status ?? 'idle'
    }
  }

  private suggestKey(d: Digest, status: string): string {
    return `${status}|${d.prompt.length}:${d.prompt.slice(0, 40)}|${d.reply.length}:${d.reply.slice(-40)}`
  }

  private ensure(id: string): SessionExtra {
    let x = this.extra.get(id)
    if (!x) {
      x = { digest: { prompt: '', reply: '', title: '' } }
      this.extra.set(id, x)
    }
    return x
  }

  private allowedTranscript(p: string): boolean {
    if (!path.isAbsolute(p) || !p.toLowerCase().endsWith('.jsonl')) return false
    const rel = path.relative(this.d.transcriptsDir, path.resolve(p))
    return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel)
  }

  private async refresh(id: string): Promise<void> {
    const x = this.extra.get(id)
    if (!x?.transcript) return
    let fh: fs.promises.FileHandle | undefined
    try {
      fh = await fs.promises.open(x.transcript, 'r')
      const { size } = await fh.stat()
      const len = Math.min(size, TAIL_BYTES)
      const buf = Buffer.alloc(len)
      await fh.read(buf, 0, len, size - len)
      const d = digestTranscript(buf.toString('utf8'))
      // Ein Prompt aus dem Hook ist frischer als das, was schon im Transkript steht
      x.digest = { prompt: d.prompt || x.digest.prompt, reply: d.reply, title: d.title || x.digest.title }
      this.changed()
    } catch {
      // Datei noch nicht da oder gerade gesperrt – beim nächsten Hook wieder
    } finally {
      await fh?.close()
    }
  }

  private changed(): void {
    if (this.pushTimer) return
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null
      this.d.push(this.state())
    }, 150)
  }
}
