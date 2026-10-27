import type { HookEvent, SessionStatus } from '../../../shared/types'
import { nextWaitingSince } from '../../../shared/waiting'

export interface FeedEntry {
  id: number
  sessionId: string
  ts: number
  tool: string
  target: string
  result: 'pending' | 'ok' | 'fail' | 'stopped'
  /** voller Pfad bei Datei-Tools → Klick öffnet den Editor */
  filePath?: string
  /** eingefügter Text bei Edit → Editor springt dorthin */
  find?: string
}

export interface TodoItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  /** Task-ID bei TaskCreate/TaskUpdate (TodoWrite schickt immer die ganze Liste ohne IDs) */
  id?: string
  /** Text während der Arbeit, z. B. „Baue Terminal-Optik“ */
  activeForm?: string
}

export interface AgentNode {
  id: string
  sessionId: string
  type: string
  description: string
  done: boolean
  ts: number
  /** von SubagentStart – eindeutige Zuordnung für SubagentStop */
  agentId?: string
  /** letzte Nachricht des Subagents (SubagentStop) */
  result?: string
}

export interface SessionWorkflow {
  status: SessionStatus
  feed: FeedEntry[]
  todos: TodoItem[]
  agents: AgentNode[]
  lastActivity: number
  /** Claude pflegt gerade auf Anstoß von VibeDesk das Gehirn */
  tending?: boolean
  /** seit wann die Session auf dich wartet (nur bei Status „waiting“) */
  waitingSince?: number
}

export interface WorkflowState {
  sessions: Record<string, SessionWorkflow>
  nextFeedId: number
}

export type WorkflowAction =
  | { type: 'hook'; event: HookEvent }
  | { type: 'exit'; sessionId: string; code: number }
  | { type: 'start'; sessionId: string }
  | { type: 'remove'; sessionId: string }
  /** Gemini CLI / Codex: Status aus dem Ausgabestrom statt aus Hooks */
  | { type: 'activity'; sessionId: string; status: 'working' | 'waiting'; ts: number }

export const FEED_LIMIT = 500
const AGENT_TOOLS = new Set(['Task', 'Agent'])
const TODO_STATES = new Set(['pending', 'in_progress', 'completed'])

export const emptyWorkflow = (): WorkflowState => ({ sessions: {}, nextFeedId: 1 })
const emptySession = (): SessionWorkflow => ({ status: 'idle', feed: [], todos: [], agents: [], lastActivity: 0 })

const obj = (x: unknown): Record<string, unknown> =>
  x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {}
const str = (x: unknown): string => (typeof x === 'string' ? x : '')

const settle = (feed: FeedEntry[]): FeedEntry[] =>
  feed.some((f) => f.result === 'pending') ? feed.map((f) => (f.result === 'pending' ? { ...f, result: 'stopped' } : f)) : feed

function shortPath(p: string): string {
  return p.split(/[\\/]+/).filter(Boolean).slice(-2).join('/')
}

export function describeTarget(tool: string, input: unknown): string {
  const i = obj(input)
  if (i.file_path || i.notebook_path) return shortPath(str(i.file_path || i.notebook_path))
  if (tool === 'Bash') return str(i.command).slice(0, 80)
  if (i.pattern) return str(i.pattern).slice(0, 80)
  if (i.url) return str(i.url).slice(0, 80)
  if (i.query) return str(i.query).slice(0, 80)
  if (i.description) return str(i.description).slice(0, 80)
  return ''
}

const isAbs = (p: string): boolean => /^([a-zA-Z]:[\\/]|[\\/])/.test(p)

/** Voller Dateipfad und Sprungziel für Datei-Tools (Edit, Write, Read …). */
export function fileTarget(input: unknown, cwd: string): { filePath?: string; find?: string } {
  const i = obj(input)
  const p = str(i.file_path || i.notebook_path)
  if (!p) return {}
  const filePath = isAbs(p) || !cwd ? p : cwd.replace(/[\\/]+$/, '') + '\\' + p
  const edits = Array.isArray(i.edits) ? i.edits : []
  const find = str(i.new_string) || str(obj(edits[0]).new_string) || undefined
  return find ? { filePath, find } : { filePath }
}

function parseTodos(x: unknown): TodoItem[] {
  if (!Array.isArray(x)) return []
  return x
    .filter((t) => t && typeof t === 'object' && typeof (t as { content?: unknown }).content === 'string')
    .map((t) => {
      const { content, status } = t as { content: string; status?: unknown }
      return { content, status: (TODO_STATES.has(str(status)) ? status : 'pending') as TodoItem['status'] }
    })
}

/**
 * Neuere Claude-Code-Versionen planen mit TaskCreate/TaskUpdate statt TodoWrite: einzelne Aufgaben mit ID.
 * Ausgewertet nach dem Aufruf, weil erst die Antwort die ID der neuen Aufgabe kennt.
 */
export function applyTaskTool(todos: TodoItem[], tool: string, input: Record<string, unknown>, resp: unknown): TodoItem[] {
  if (tool === 'TaskCreate') {
    const content = str(input.subject).trim()
    if (!content) return todos
    const maxId = Math.max(0, ...todos.map((t) => Number(t.id) || 0))
    const id = str(obj(obj(resp).task).id) || String(maxId + 1)
    if (todos.some((t) => t.id === id)) return todos
    const activeForm = str(input.activeForm)
    return [...todos, { id, content, status: 'pending', ...(activeForm ? { activeForm } : {}) }]
  }
  if (tool === 'TaskUpdate') {
    const id = str(input.taskId)
    if (!id || obj(resp).success === false) return todos
    if (str(input.status) === 'deleted') return todos.filter((t) => t.id !== id)
    return todos.map((t) => {
      if (t.id !== id) return t
      const next = { ...t }
      if (TODO_STATES.has(str(input.status))) next.status = input.status as TodoItem['status']
      if (str(input.subject).trim()) next.content = str(input.subject).trim()
      if (str(input.activeForm)) next.activeForm = str(input.activeForm)
      return next
    })
  }
  return todos
}

function hasError(resp: unknown): boolean {
  const r = obj(resp)
  return r.is_error === true || (r.error !== undefined && r.error !== null && r.error !== '')
}

function applyHook(s: SessionWorkflow, e: HookEvent, nextId: number): { s: SessionWorkflow; usedId: boolean } {
  const p = e.payload
  const tool = str(p.tool_name) || '?'
  const touch = (patch: Partial<SessionWorkflow>): SessionWorkflow => ({ ...s, ...patch, lastActivity: e.ts })
  switch (e.name) {
    case 'UserPromptSubmit':
      return { s: touch({ status: 'working', tending: false }), usedId: false }
    case 'BrainTend':
      return { s: touch({ status: 'working', tending: true }), usedId: false }
    case 'Notification':
    case 'PermissionRequest':
      return { s: touch({ status: 'waiting' }), usedId: false }
    case 'Stop':
      return { s: touch({ status: 'done', feed: settle(s.feed), tending: false }), usedId: false }
    case 'SessionStart':
      return { s: touch({ status: s.status === 'idle' ? 'idle' : s.status }), usedId: false }
    case 'SubagentStart': {
      const agentId = str(p.agent_id)
      const type = str(p.agent_type) || 'general-purpose'
      if (!agentId || s.agents.some((a) => a.agentId === agentId)) return { s: touch({}), usedId: false }
      // dem ältesten Aufruf desselben Typs zuordnen, der noch keinen Agent hat
      const idx = s.agents.findIndex((a) => !a.agentId && !a.done && a.type === type)
      if (idx >= 0) return { s: touch({ agents: s.agents.map((a, i) => (i === idx ? { ...a, agentId } : a)) }), usedId: false }
      const node: AgentNode = { id: `${e.sessionId}:${agentId}`, sessionId: e.sessionId, type, description: '', done: false, ts: e.ts, agentId }
      return { s: touch({ agents: [...s.agents, node] }), usedId: false }
    }
    case 'SubagentStop': {
      const agentId = str(p.agent_id)
      const result = str(p.last_assistant_message).slice(0, 300) || undefined
      // mit agent_id exakt zuordnen; ältere Claude-Versionen ohne ID: ältester offener Agent
      const idx = agentId ? s.agents.findIndex((a) => a.agentId === agentId) : s.agents.findIndex((a) => !a.done)
      if (idx < 0) return { s: touch({}), usedId: false }
      const agents = s.agents.map((a, i) => (i === idx ? { ...a, done: true, result } : a))
      return { s: touch({ agents }), usedId: false }
    }
    case 'PreToolUse': {
      const input = p.tool_input
      const entry: FeedEntry = { id: nextId, sessionId: e.sessionId, ts: e.ts, tool, target: describeTarget(tool, input), result: 'pending', ...fileTarget(input, str(p.cwd)) }
      const feed = [...s.feed, entry].slice(-FEED_LIMIT)
      const patch: Partial<SessionWorkflow> = { status: 'working', feed }
      if (tool === 'TodoWrite') patch.todos = parseTodos(obj(input).todos)
      if (AGENT_TOOLS.has(tool)) {
        const i = obj(input)
        patch.agents = [
          ...s.agents,
          { id: `${e.sessionId}:${nextId}`, sessionId: e.sessionId, type: str(i.subagent_type) || 'general-purpose', description: str(i.description), done: false, ts: e.ts }
        ]
      }
      return { s: touch(patch), usedId: true }
    }
    case 'PostToolUse': {
      let idx = -1
      for (let i = s.feed.length - 1; i >= 0; i--)
        if (s.feed[i].tool === tool && s.feed[i].result === 'pending') {
          idx = i
          break
        }
      // Ein Tool lief zu Ende → Claude arbeitet weiter (auch nach bestätigter Berechtigungsfrage)
      const status: SessionStatus = 'working'
      const todos = hasError(p.tool_response) ? s.todos : applyTaskTool(s.todos, tool, obj(p.tool_input), p.tool_response)
      if (idx < 0) return { s: touch({ status, todos }), usedId: false }
      const result: FeedEntry['result'] = hasError(p.tool_response) ? 'fail' : 'ok'
      const feed = s.feed.map((f, i) => (i === idx ? { ...f, result } : f))
      return { s: touch({ feed, status, todos }), usedId: false }
    }
    default:
      return { s, usedId: false }
  }
}

/** Wartezeitpunkt beim Statuswechsel mitführen – „wartet · 3 min“ statt nur „wartet auf dich“ */
function stampWaiting(prev: SessionWorkflow | undefined, s: SessionWorkflow, ts: number): SessionWorkflow {
  const since = nextWaitingSince(prev?.status ?? 'idle', s.status, prev?.waitingSince, ts)
  if (since === s.waitingSince) return s
  if (since !== undefined) return { ...s, waitingSince: since }
  const { waitingSince: _gone, ...rest } = s
  return rest
}

export function workflowReducer(state: WorkflowState, a: WorkflowAction): WorkflowState {
  const cur = (id: string): SessionWorkflow => state.sessions[id] ?? emptySession()
  const put = (id: string, s: SessionWorkflow, nextFeedId = state.nextFeedId, ts = Date.now()): WorkflowState => ({
    sessions: { ...state.sessions, [id]: stampWaiting(state.sessions[id], s, ts) },
    nextFeedId
  })
  switch (a.type) {
    case 'start':
      return put(a.sessionId, emptySession())
    case 'remove': {
      const { [a.sessionId]: _gone, ...rest } = state.sessions
      return { ...state, sessions: rest }
    }
    case 'exit':
      return put(a.sessionId, { ...cur(a.sessionId), status: a.code === 0 ? 'done' : 'error', feed: settle(cur(a.sessionId).feed) })
    case 'activity': {
      // nur laufende Sessions – nach Ende oder Schließen zählt der letzte Stand
      const s = state.sessions[a.sessionId]
      if (!s || s.status === 'done' || s.status === 'error') return state
      return put(a.sessionId, { ...s, status: a.status, lastActivity: a.ts }, state.nextFeedId, a.ts)
    }
    case 'hook': {
      const { s, usedId } = applyHook(cur(a.event.sessionId), a.event, state.nextFeedId)
      return put(a.event.sessionId, s, usedId ? state.nextFeedId + 1 : state.nextFeedId, a.event.ts)
    }
  }
}

/** Werkzeuge, mit denen Claude Dateien ändert */
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

/** Hat Claude in irgendeiner Session schon Dateien geändert? */
export const hasEdits = (s: Pick<WorkflowState, 'sessions'>): boolean => Object.values(s.sessions).some((w) => w.feed.some((f) => EDIT_TOOLS.has(f.tool) && f.result !== 'fail'))
