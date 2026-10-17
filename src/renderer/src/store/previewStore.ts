import { create } from 'zustand'
import { api } from '../api'
import { detectLocalUrls } from '../windows/localUrls'
import { centeredRect, useUi } from './uiStore'
import { enqueue } from './queueStore'
import { sendToSession } from './sessionPrompt'
import { termWin, useSessions } from './sessionStore'
import { useWorkflow } from './workflowStore'

export const previewWin = (key: string): string => `preview:${key}`

interface PreviewState {
  /** erkannte Dev-Server-URLs pro Session (neueste zuerst) */
  urls: Record<string, string[]>
  /** offene Vorschau-Fenster: key → aktuelle URL */
  open: Record<string, string>
  openPreview(url?: string): void
  closePreview(key: string): void
  setUrl(key: string, url: string): void
}

let seq = 0

export const usePreview = create<PreviewState>((set, get) => ({
  urls: {},
  open: {},
  openPreview: (url = '') => {
    // gleiche URL → vorhandenes Fenster nach vorne holen
    const existing = Object.entries(get().open).find(([, u]) => url && u === url)
    const key = existing?.[0] ?? String(++seq)
    if (!existing) set((s) => ({ open: { ...s.open, [key]: url } }))
    useUi.getState().openWin(previewWin(key), centeredRect(Math.min(1100, window.innerWidth - 80), Math.min(760, window.innerHeight - 160)))
  },
  closePreview: (key) => {
    useUi.getState().closeWin(previewWin(key))
    set((s) => {
      const { [key]: _gone, ...open } = s.open
      return { open }
    })
  },
  setUrl: (key, url) => set((s) => ({ open: { ...s.open, [key]: url } }))
}))

let wired = false
export function wirePreview(): void {
  if (wired) return
  wired = true
  const carry: Record<string, string> = {}
  api.on.sessionData((id, data) => {
    const r = detectLocalUrls(data, carry[id] ?? '')
    carry[id] = r.carry
    if (!r.urls.length) return
    usePreview.setState((s) => {
      const list = [...r.urls, ...(s.urls[id] ?? []).filter((u) => !r.urls.includes(u))].slice(0, 4)
      return { urls: { ...s.urls, [id]: list } }
    })
  })
  api.on.sessionExit((id) => {
    delete carry[id]
  })
}

export function shortUrl(url: string): string {
  try {
    const u = new URL(url)
    return `:${u.port}${u.pathname !== '/' ? u.pathname : ''}`
  } catch {
    return url
  }
}

/** Welche Session gehört zur Vorschau? Die, deren Terminal die URL ausgegeben hat – sonst die oberste. */
export function sessionForUrl(url: string): string | null {
  const origin = (u: string): string => {
    try {
      return new URL(u).origin
    } catch {
      return u
    }
  }
  const sessions = useSessions.getState().sessions
  const urls = usePreview.getState().urls
  const hit = sessions.find((s) => (urls[s.id] ?? []).some((u) => origin(u) === origin(url)))
  if (hit) return hit.id
  const ui = useUi.getState()
  for (let i = ui.open.length - 1; i >= 0; i--) {
    const s = sessions.find((x) => termWin(x.id) === ui.open[i])
    if (s) return s.id
  }
  return sessions[0]?.id ?? null
}

/** Auftrag aus der Vorschau an Claude – läuft Claude gerade, wird er vorgemerkt */
export function askClaudeFromPreview(url: string, text: string): 'sent' | 'queued' | 'none' {
  const id = sessionForUrl(url)
  if (!id) return 'none'
  const st = useWorkflow.getState().sessions[id]?.status
  if (st === 'working' || st === 'waiting') {
    enqueue(id, text)
    return 'queued'
  }
  // Vorschau bleibt vorn – man will ja sehen, wie sich die Seite ändert
  sendToSession(id, text, false)
  return 'sent'
}
