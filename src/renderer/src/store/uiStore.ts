import { create } from 'zustand'
import type { WindowRect } from '../../../shared/types'
import { arrange, restoreRects } from '../desktop/layout'

export const DOCK_H = 84

export type WindowKind = 'terminal' | 'panel'

interface UiState {
  /** Offene Fenster in Z-Reihenfolge, letztes = oben */
  open: string[]
  minimized: string[]
  maximized: string | null
  rects: Record<string, WindowRect>
  /** Zen-Modus: nur dieses Fenster ist zu sehen (null = aus) */
  zen: string | null
  /** wann ein Fenster zuletzt nach vorn kam – fürs Aufräumen */
  used: Record<string, number>
  setZen(id: string | null): void
  /** minimiert Panels, die seit `idleMs` nicht benutzt wurden (nie das oberste, nie Terminals) */
  tidy(kindOf: (id: string) => WindowKind, idleMs: number): string[]
  initRects(rects: Record<string, WindowRect>): void
  openWin(id: string, fallback?: WindowRect): void
  closeWin(id: string): void
  toggleWin(id: string, fallback?: WindowRect): void
  minimize(id: string): void
  focus(id: string): void
  setRect(id: string, r: WindowRect): void
  toggleMax(id: string): void
  arrangeAll(kindOf: (id: string) => WindowKind): void
}

/** Zen und ein anderes Fenster kommt nach vorn: Terminal → Zen wechselt dorthin, Panel → Zen endet (sonst bliebe es unsichtbar) */
export function zenAfter(zen: string | null, id: string): string | null {
  if (!zen || zen === id) return zen
  return id.startsWith('term:') ? id : null
}

const screen = () => ({ w: window.innerWidth, h: window.innerHeight })

export function centeredRect(w: number, h: number): WindowRect {
  const s = screen()
  return { x: Math.round((s.w - w) / 2), y: Math.max(16, Math.round((s.h - DOCK_H - h) / 2)), w, h }
}

export const useUi = create<UiState>((set, get) => ({
  open: [],
  minimized: [],
  maximized: null,
  rects: {},
  zen: null,
  used: {},
  initRects: (rects) => set({ rects: restoreRects(rects, screen(), DOCK_H) }),
  openWin: (id, fallback) =>
    set((s) => ({
      open: [...s.open.filter((x) => x !== id), id],
      minimized: s.minimized.filter((x) => x !== id),
      rects: s.rects[id] ? s.rects : { ...s.rects, [id]: fallback ?? centeredRect(560, 420) },
      used: { ...s.used, [id]: Date.now() },
      zen: zenAfter(s.zen, id)
    })),
  closeWin: (id) =>
    set((s) => ({
      open: s.open.filter((x) => x !== id),
      minimized: s.minimized.filter((x) => x !== id),
      maximized: s.maximized === id ? null : s.maximized,
      zen: s.zen === id ? null : s.zen
    })),
  toggleWin: (id, fallback) => {
    const s = get()
    if (s.open.includes(id) && !s.minimized.includes(id)) s.closeWin(id)
    else s.openWin(id, fallback)
  },
  minimize: (id) => set((s) => ({ minimized: [...s.minimized.filter((x) => x !== id), id] })),
  focus: (id) =>
    set((s) =>
      s.open.includes(id)
        ? { open: [...s.open.filter((x) => x !== id), id], minimized: s.minimized.filter((x) => x !== id), used: { ...s.used, [id]: Date.now() }, zen: zenAfter(s.zen, id) }
        : s
    ),
  setRect: (id, r) => set((s) => ({ rects: { ...s.rects, [id]: r } })),
  setZen: (id) => set((s) => (id ? { zen: id, open: [...s.open.filter((x) => x !== id), id], minimized: s.minimized.filter((x) => x !== id) } : { zen: null })),
  tidy: (kindOf, idleMs) => {
    const s = get()
    const top = s.open[s.open.length - 1]
    const now = Date.now()
    const stale = s.open.filter((id) => id !== top && !s.minimized.includes(id) && kindOf(id) === 'panel' && now - (s.used[id] ?? 0) >= idleMs)
    if (stale.length) set({ minimized: [...s.minimized, ...stale] })
    return stale
  },
  toggleMax: (id) => set((s) => ({ maximized: s.maximized === id ? null : id })),
  arrangeAll: (kindOf) => {
    const s = get()
    const visible = s.open.filter((id) => !s.minimized.includes(id))
    const rects = arrange(visible.map((id) => ({ id, kind: kindOf(id) })), screen(), DOCK_H)
    set({ rects: { ...s.rects, ...rects }, maximized: null })
  }
}))
