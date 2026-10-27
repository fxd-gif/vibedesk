// Arbeitsbereiche pro Projekt: welche Werkzeug-Fenster offen sind und wo sie liegen – merken und beim Projektwechsel zurückholen.
import type { PanelId, WindowRect, Workspace } from './types'

/** so viele Projekte merkt sich VibeDesk, ältere fliegen raus */
export const MAX_WORKSPACES = 30

/** wird nie von selbst geöffnet oder geschlossen (Editor hat ungespeicherte Änderungen und ein eigenes Projekt) */
const NEVER_TOUCH = new Set<string>(['editor'])
/** wird nie von selbst geschlossen – dort laufen womöglich Commits, Zusammenführungen oder ein Addon-Test mit ungespeicherten Änderungen */
const NEVER_CLOSE = new Set<string>(['editor', 'git', 'merge', 'addons'])

const sameRect = (a: WindowRect | undefined, b: WindowRect): boolean => !!a && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h

const isWorkspace = (w: unknown): w is Workspace =>
  !!w && typeof w === 'object' && Array.isArray((w as Workspace).panels) && !!(w as Workspace).rects && typeof (w as Workspace).rects === 'object'

/** Anordnung unter dem Projekt ablegen; über `max` hinaus fliegen die am längsten nicht gespeicherten raus */
export function saveWorkspace(
  all: Record<string, Workspace> | undefined | null,
  projectId: string,
  ws: { rects: Record<string, WindowRect>; panels: PanelId[] },
  now: number,
  max = MAX_WORKSPACES
): Record<string, Workspace> {
  const base = all && typeof all === 'object' ? all : {}
  const next: Record<string, Workspace> = { ...base, [projectId]: { rects: { ...ws.rects }, panels: [...ws.panels], savedAt: now } }
  const ids = Object.keys(next)
  if (ids.length <= max) return next
  const keep = new Set(ids.sort((a, b) => (next[b].savedAt ?? 0) - (next[a].savedAt ?? 0)).slice(0, max))
  keep.add(projectId)
  return Object.fromEntries(Object.entries(next).filter(([id]) => keep.has(id)))
}

/** Anordnung eines Projekts vergessen */
export function forgetWorkspace(all: Record<string, Workspace> | undefined | null, projectId: string): Record<string, Workspace> {
  const base = all && typeof all === 'object' ? all : {}
  return Object.fromEntries(Object.entries(base).filter(([id]) => id !== projectId))
}

/** gespeicherter Arbeitsbereich eines Projekts – kaputte Einträge zählen als „keiner“ */
export function workspaceOf(all: Record<string, Workspace> | undefined | null, projectId: string | null): Workspace | null {
  if (!projectId || !all || typeof all !== 'object') return null
  const w = all[projectId]
  return isWorkspace(w) ? w : null
}

export interface RestoreInput {
  /** offene Fenster (Z-Reihenfolge) */
  open: string[]
  rects: Record<string, WindowRect>
  /** Werkzeug-Fenster, die angefasst werden dürfen (keine Terminals, Shells, Vorschauen; ausgeblendete Module fehlen) */
  tools: string[]
  /** zuletzt benutzt – gerade erst Geöffnetes bleibt offen */
  used?: Record<string, number>
  now?: number
  /** so frisch benutzte Fenster werden nicht geschlossen */
  freshMs?: number
}

export interface RestorePlan {
  open: string[]
  close: string[]
  rects: Record<string, WindowRect>
}

/** Was beim Wechsel in ein Projekt geändert wird – null, wenn es nichts zu tun gibt */
export function planRestore(ws: Workspace | null, cur: RestoreInput): RestorePlan | null {
  if (!ws) return null
  const tools = new Set(cur.tools)
  const want = new Set<string>(ws.panels.filter((id) => tools.has(id)))
  const now = cur.now ?? Date.now()
  const fresh = (id: string): boolean => !!cur.freshMs && now - (cur.used?.[id] ?? 0) < cur.freshMs
  const open = [...want].filter((id) => !cur.open.includes(id) && !NEVER_TOUCH.has(id))
  const close = cur.open.filter((id) => tools.has(id) && !want.has(id) && !NEVER_CLOSE.has(id) && !fresh(id))
  const rects: Record<string, WindowRect> = {}
  for (const [id, r] of Object.entries(ws.rects ?? {})) {
    if (!tools.has(id) || !r || typeof r !== 'object') continue
    if (!sameRect(cur.rects[id], r)) rects[id] = r
  }
  if (!open.length && !close.length && !Object.keys(rects).length) return null
  return { open, close, rects }
}

/**
 * Was nach der Beruhigung beim (vielleicht) neuen Projekt passiert:
 * 'nothing' = gleiches/kein Projekt, 'adopt' = still übernehmen (erstes Projekt nach dem Start oder Funktion aus),
 * 'later' = jetzt nicht umräumen (Zen, Studio) – beim nächsten Blick wieder prüfen, 'wait' = Maus gedrückt, gleich nochmal,
 * 'restore' = gespeicherte Anordnung des Projekts zurückholen
 */
export type SwitchStep = 'nothing' | 'adopt' | 'later' | 'wait' | 'restore'

export function switchStep(o: { shown: string | null; current: string | null; on: boolean; desktop: boolean; zen: boolean; dragging: boolean }): SwitchStep {
  if (!o.current || o.current === o.shown) return 'nothing'
  if (!o.shown || !o.on) return 'adopt'
  if (!o.desktop || o.zen) return 'later'
  if (o.dragging) return 'wait'
  return 'restore'
}

/** Aus dem Fensterzustand den Teil, der zu einem Arbeitsbereich gehört (nur Werkzeug-Fenster) */
export function workspaceSnapshot(open: string[], rects: Record<string, WindowRect>, tools: string[]): { rects: Record<string, WindowRect>; panels: PanelId[] } {
  const set = new Set(tools)
  return {
    rects: Object.fromEntries(Object.entries(rects).filter(([id]) => set.has(id))),
    panels: open.filter((id) => set.has(id)) as PanelId[]
  }
}
