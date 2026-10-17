import { create } from 'zustand'
import type { Eol, FileChange, FileErrorCode, FilesApi } from '../../../shared/types'

export interface Tab {
  path: string
  name: string
  status: 'ready' | 'binary' | 'too_large'
  diskText: string
  mtime: number | null
  eol: Eol
  bom: boolean
  dirty: boolean
  /** Claude (oder jemand anders) hat die Datei geändert/gelöscht, während der Tab ungespeicherte Änderungen hatte */
  conflict: null | 'changed' | 'deleted'
  /** nächstes Speichern überschreibt bewusst */
  force: boolean
  error?: string
  /** steigt, wenn diskText von außen ersetzt wurde → Editor lädt den Inhalt neu */
  rev: number
}

export interface Reveal {
  path: string
  find?: string
  /** 1-basierte Zeile (z. B. aus einem Terminal-Link datei.ts:42) */
  line?: number
  seq: number
}

export type OpenResult = { ok: true; path: string } | { ok: false; code: FileErrorCode; message: string }

export interface EditorStoreState {
  tabs: Tab[]
  active: string | null
  reveal: Reveal | null
  open(path: string, opts?: { find?: string; line?: number }): Promise<OpenResult>
  activate(path: string): void
  close(path: string): void
  closeAll(): void
  setDirty(path: string, dirty: boolean): void
  save(path: string, text: string): Promise<boolean>
  external(c: FileChange): Promise<void>
  resolveConflict(path: string, choice: 'theirs' | 'mine'): Promise<void>
}

export const samePath = (a: string, b: string): boolean => a.replace(/\//g, '\\').toLowerCase() === b.replace(/\//g, '\\').toLowerCase()
export const baseName = (p: string): string => p.split(/[\\/]/).filter(Boolean).pop() ?? p

let revealSeq = 0

export function createEditorStore(files: () => FilesApi) {
  return create<EditorStoreState>((set, get) => {
    const find = (p: string): Tab | undefined => get().tabs.find((t) => samePath(t.path, p))
    const patch = (p: string, fn: (t: Tab) => Partial<Tab>): void =>
      set((s) => ({ tabs: s.tabs.map((t) => (samePath(t.path, p) ? { ...t, ...fn(t) } : t)) }))
    const focusTab = (p: string, o?: { find?: string; line?: number }): void => set({ active: p, reveal: { path: p, find: o?.find, line: o?.line, seq: ++revealSeq } })

    return {
      tabs: [],
      active: null,
      reveal: null,

      open: async (path, opts) => {
        const existing = find(path)
        if (existing) {
          focusTab(existing.path, opts)
          return { ok: true, path: existing.path }
        }
        const r = await files().read(path)
        if (!r.ok && r.code !== 'binary' && r.code !== 'too_large') return r
        const canonical = r.ok ? r.path : path
        const again = find(canonical)
        if (again) {
          focusTab(again.path, opts)
          return { ok: true, path: again.path }
        }
        const base = { path: canonical, name: baseName(canonical), dirty: false, conflict: null, force: false, rev: 0 }
        const tab: Tab = r.ok
          ? { ...base, status: 'ready', diskText: r.text, mtime: r.mtime, eol: r.eol, bom: r.bom }
          : { ...base, status: r.code as 'binary' | 'too_large', diskText: '', mtime: null, eol: 'lf', bom: false }
        set((s) => ({ tabs: [...s.tabs, tab] }))
        if (r.ok) files().watch(canonical)
        focusTab(canonical, opts)
        return { ok: true, path: canonical }
      },

      activate: (path) => {
        const t = find(path)
        if (t) set({ active: t.path })
      },

      close: (path) => {
        const t = find(path)
        if (!t) return
        if (t.status === 'ready') files().unwatch(t.path)
        set((s) => {
          const idx = s.tabs.indexOf(t)
          const tabs = s.tabs.filter((x) => x !== t)
          const active = s.active && samePath(s.active, t.path) ? (tabs[Math.min(idx, tabs.length - 1)]?.path ?? null) : s.active
          return { tabs, active }
        })
      },

      closeAll: () => {
        for (const t of get().tabs) if (t.status === 'ready') files().unwatch(t.path)
        set({ tabs: [], active: null, reveal: null })
      },

      setDirty: (path, dirty) => {
        const t = find(path)
        if (t && t.dirty !== dirty) patch(path, () => ({ dirty }))
      },

      save: async (path, text) => {
        const t = find(path)
        if (!t || t.status !== 'ready') return false
        const expected = t.force || t.conflict === 'deleted' ? null : t.mtime
        const r = await files().write(t.path, text, expected, t.eol, t.bom)
        if (r.ok) {
          patch(path, () => ({ diskText: text, mtime: r.mtime, dirty: false, force: false, conflict: null, error: undefined }))
          return true
        }
        if (r.code === 'conflict') patch(path, () => ({ conflict: 'changed', error: undefined }))
        else patch(path, () => ({ error: r.message }))
        return false
      },

      external: async (c) => {
        const t = find(c.path)
        if (!t || t.status !== 'ready') return
        if (c.kind === 'deleted') {
          patch(t.path, () => ({ conflict: 'deleted' }))
          return
        }
        if (t.mtime === c.mtime) return // eigenes Speichern
        if (t.dirty) {
          patch(t.path, () => ({ conflict: 'changed' }))
          return
        }
        const r = await files().read(t.path)
        if (r.ok) patch(t.path, (cur) => ({ diskText: r.text, mtime: r.mtime, eol: r.eol, bom: r.bom, conflict: null, rev: cur.rev + 1 }))
      },

      resolveConflict: async (path, choice) => {
        const t = find(path)
        if (!t) return
        if (choice === 'mine') {
          patch(path, () => ({ conflict: null, force: true }))
          return
        }
        const r = await files().read(t.path)
        if (r.ok) patch(path, (cur) => ({ diskText: r.text, mtime: r.mtime, eol: r.eol, bom: r.bom, dirty: false, conflict: null, force: false, rev: cur.rev + 1 }))
        else get().close(path) // Claudes Version ist: gelöscht
      }
    }
  })
}
