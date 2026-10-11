import { create } from 'zustand'
import { api } from '../api'
import { detectLocalUrls } from '../windows/localUrls'
import { centeredRect, useUi } from './uiStore'

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
