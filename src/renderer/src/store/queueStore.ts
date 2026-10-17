// Prompt-Warteschlange: Aufträge vormerken, die automatisch losgehen, sobald Claude fertig ist.
import { create } from 'zustand'
import type { SessionStatus } from '../../../shared/types'
import { inform } from './notifyStore'
import { sendToSession } from './sessionPrompt'
import { useSessions } from './sessionStore'
import { useWorkflow } from './workflowStore'

export interface QueuedPrompt {
  id: number
  text: string
}

export const QUEUE_MAX = 20
/** Claude Code braucht nach „fertig“ einen Moment, bis die Eingabe wieder steht */
const RELEASE_DELAY_MS = 1200

interface QueueState {
  items: Record<string, QueuedPrompt[]>
  /** Warteschlange angehalten (z. B. weil etwas schiefging) */
  paused: Record<string, boolean>
}

export const useQueue = create<QueueState>(() => ({ items: {}, paused: {} }))

let seq = 0

/** Darf der nächste Auftrag los? Nur wenn Claude gerade frei ist – nie, während es arbeitet oder fragt. */
export const isFree = (s: SessionStatus | undefined): boolean => s === 'idle' || s === 'done'

/** Wechsel von „arbeitet“ zu „fertig“ → nächster Auftrag */
export const shouldRelease = (before: SessionStatus | undefined, now: SessionStatus): boolean => before === 'working' && now === 'done'

const statusOf = (id: string): SessionStatus | undefined => useWorkflow.getState().sessions[id]?.status

function release(sessionId: string): void {
  const st = useQueue.getState()
  const list = st.items[sessionId] ?? []
  if (!list.length || st.paused[sessionId]) return
  if (!useSessions.getState().sessions.some((s) => s.id === sessionId) || useSessions.getState().exited[sessionId] !== undefined) return
  const [next, ...rest] = list
  useQueue.setState((s) => ({ items: { ...s.items, [sessionId]: rest } }))
  sendToSession(sessionId, next.text, false)
  const name = useSessions.getState().sessions.find((s) => s.id === sessionId)?.name ?? 'Session'
  inform(`${name}: nächster Auftrag läuft`, next.text.length > 90 ? next.text.slice(0, 90) + ' …' : next.text, undefined, `queue:${sessionId}`)
}

export function enqueue(sessionId: string, text: string): boolean {
  const t = text.trim()
  if (!t) return false
  const list = useQueue.getState().items[sessionId] ?? []
  if (list.length >= QUEUE_MAX) return false
  useQueue.setState((s) => ({ items: { ...s.items, [sessionId]: [...list, { id: ++seq, text: t }] } }))
  // Claude ist gerade frei → sofort los
  if (isFree(statusOf(sessionId)) && !list.length) setTimeout(() => release(sessionId), 50)
  return true
}

export function dequeue(sessionId: string, id: number): void {
  useQueue.setState((s) => ({ items: { ...s.items, [sessionId]: (s.items[sessionId] ?? []).filter((x) => x.id !== id) } }))
}

export function moveUp(sessionId: string, id: number): void {
  const list = [...(useQueue.getState().items[sessionId] ?? [])]
  const i = list.findIndex((x) => x.id === id)
  if (i <= 0) return
  ;[list[i - 1], list[i]] = [list[i], list[i - 1]]
  useQueue.setState((s) => ({ items: { ...s.items, [sessionId]: list } }))
}

export function setPaused(sessionId: string, paused: boolean): void {
  useQueue.setState((s) => ({ paused: { ...s.paused, [sessionId]: paused } }))
  if (!paused && isFree(statusOf(sessionId))) release(sessionId)
}

let wired = false
export function wireQueue(): void {
  if (wired) return
  wired = true
  const prev: Record<string, SessionStatus> = {}
  useWorkflow.subscribe((st) => {
    for (const [id, w] of Object.entries(st.sessions)) {
      const before = prev[id]
      prev[id] = w.status
      if (shouldRelease(before, w.status)) setTimeout(() => isFree(statusOf(id)) && release(id), RELEASE_DELAY_MS)
      // abgestürzt → anhalten statt ins Leere zu schicken
      if (w.status === 'error' && (useQueue.getState().items[id] ?? []).length) setPaused(id, true)
    }
  })
  useSessions.subscribe((st, p) => {
    for (const s of p.sessions)
      if (!st.sessions.some((x) => x.id === s.id))
        useQueue.setState((q) => {
          const { [s.id]: _gone, ...items } = q.items
          return { items }
        })
  })
}
