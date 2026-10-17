// Anhänge pro Claude-Session: was eingefügt, abgeschickt und von Claude gelesen wurde (Statuswechsel per Hooks).
import { create } from 'zustand'
import { api } from '../api'
import { addAttachments, markPromptSent, markToolUse, type Attachment } from '../../../shared/attachments'

interface AttachState {
  items: Record<string, Attachment[]>
}

const KEY = (id: string): string => `vd-attach:${id}`

function load(id: string): Attachment[] | undefined {
  try {
    const raw = sessionStorage.getItem(KEY(id))
    return raw ? (JSON.parse(raw) as Attachment[]) : undefined
  } catch {
    return undefined
  }
}

export const useAttach = create<AttachState>(() => ({ items: {} }))

/** Liste einer Session – nach einem Neuladen des Fensters aus sessionStorage */
export function attachmentsOf(id: string): Attachment[] {
  return useAttach.getState().items[id] ?? load(id) ?? []
}

function put(id: string, list: Attachment[]): void {
  useAttach.setState((s) => ({ items: { ...s.items, [id]: list } }))
  try {
    sessionStorage.setItem(KEY(id), JSON.stringify(list))
  } catch {
    /* voll oder gesperrt – dann nur im Speicher */
  }
}

/** Nach einem Neuladen des Fensters die gespeicherte Liste wieder anzeigen */
export function hydrateAttachments(id: string): void {
  if (useAttach.getState().items[id]) return
  const saved = load(id)
  if (saved?.length) useAttach.setState((s) => ({ items: { ...s.items, [id]: saved } }))
}

export function recordAttachments(id: string, files: { path: string; size?: number }[]): void {
  if (files.length) put(id, addAttachments(attachmentsOf(id), files, Date.now()))
}

export function removeAttachment(id: string, path: string): void {
  put(id, attachmentsOf(id).filter((a) => a.path !== path))
}

export function clearAttachments(id: string, onlyDone = false): void {
  put(id, onlyDone ? attachmentsOf(id).filter((a) => a.status === 'pending') : [])
}

let wired = false
export function wireAttachments(): void {
  if (wired) return
  wired = true
  api.on.hookEvent((e) => {
    const list = attachmentsOf(e.sessionId)
    if (!list.length) return
    let next = list
    if (e.name === 'UserPromptSubmit' && typeof e.payload.prompt === 'string') next = markPromptSent(list, e.payload.prompt)
    else if (e.name === 'PreToolUse') next = markToolUse(list, e.payload.tool_input)
    if (next !== list && JSON.stringify(next) !== JSON.stringify(list)) put(e.sessionId, next)
  })
}
