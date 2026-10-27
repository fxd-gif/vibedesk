// Reine Übersetzung von App-Zuständen in Addon-Ereignisse (ohne Store-Abhängigkeiten, testbar).
import type { HookEvent, InstalledAddon, SessionStatus } from '../../../shared/types'
import { ADDON_SCHEME } from '../../../shared/addonFormat'
import type { Phase } from '../store/focusTimer'
import type { AddonEvent } from './interpreter'

type StatusMap = Record<string, { status: SessionStatus }>

export function statusTransitions(prev: StatusMap, next: StatusMap, projectOf: (sessionId: string) => string | undefined = () => undefined): AddonEvent[] {
  const out: AddonEvent[] = []
  for (const [id, s] of Object.entries(next)) {
    if (prev[id]?.status === s.status) continue
    const project = projectOf(id)
    const extra = { ...(project ? { project } : {}), session: id }
    if (s.status === 'waiting') out.push({ type: 'session_waiting', ...extra })
    else if (s.status === 'done') out.push({ type: 'session_done', ...extra })
  }
  return out
}

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
/** Details höchstens so lang (Befehl, Pfad) – Addons brauchen nur einen Anhaltspunkt */
const DETAIL_MAX = 300

/** Pfad relativ zum Ordner der Session, mit / */
function rel(file: string, cwd: string | undefined): string {
  const f = file.replace(/\\/g, '/')
  if (!cwd) return f
  const root = cwd.replace(/\\/g, '/').replace(/\/+$/, '') + '/'
  return f.toLowerCase().startsWith(root.toLowerCase()) ? f.slice(root.length) : f
}

/** Commit-Nachricht aus „git commit -m …“ (erste -m, mit oder ohne Anführungszeichen) */
export function commitMessage(cmd: string): string {
  const m = /\s-(?:m|-message)(?:=|\s+)(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+))/.exec(cmd)
  return (m?.[1] ?? m?.[2] ?? m?.[3] ?? '').replace(/\\"/g, '"').split('\n')[0].trim()
}

/**
 * Claude benutzt ein Werkzeug (PostToolUse): „Werkzeug benutzt“, bei Dateiänderungen „Datei geändert“
 * und bei „git commit“ im Terminal „Commit“. Gehirn-Notizen zählen nicht als Projektdateien.
 */
export function hookTransitions(e: HookEvent, session?: { project?: string; cwd?: string }): AddonEvent[] {
  if (e.name !== 'PostToolUse') return []
  const p = e.payload
  const tool = typeof p.tool_name === 'string' ? p.tool_name : ''
  if (!tool) return []
  const input = (p.tool_input ?? {}) as Record<string, unknown>
  const extra = { ...(session?.project ? { project: session.project } : {}), session: e.sessionId }
  const file = typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : ''
  const cmd = typeof input.command === 'string' ? input.command : ''
  const detail = (cmd || (file ? rel(file, session?.cwd) : '')).slice(0, DETAIL_MAX)
  const out: AddonEvent[] = [{ type: 'tool', tool, ...(detail ? { detail } : {}), ...extra }]
  if (EDIT_TOOLS.has(tool) && file && !/[\\/]\.vibedesk[\\/]brain[\\/]/i.test(file)) out.push({ type: 'file_changed', path: rel(file, session?.cwd), ...extra })
  if (tool === 'Bash' && /\bgit\s+(?:-\S+\s+)*commit\b/.test(cmd)) out.push({ type: 'commit', message: commitMessage(cmd), ...extra })
  return out
}

export function focusTransition(prev: Phase, next: Phase): AddonEvent | null {
  if (prev === next) return null
  if (next === 'work') return { type: 'focus', phase: 'work' }
  if (next === 'short' || next === 'long') return { type: 'focus', phase: 'break' }
  return { type: 'focus', phase: 'end' }
}

const ADDON_SCENE = `custom:${ADDON_SCHEME}://`

export const addonSceneValue = (id: string, asset: string): string => `${ADDON_SCENE}${id}/${encodeURIComponent(asset)}`

/** Szene aus einem gelöschten oder deaktivierten Addon → zurück auf die Stadt. */
export function sceneFallback(scene: string, installed: InstalledAddon[]): string | null {
  if (!scene.startsWith(ADDON_SCENE)) return null
  const id = scene.slice(ADDON_SCENE.length).split('/')[0]
  return installed.some((a) => a.manifest.id === id && a.enabled) ? null : 'city'
}

/**
 * Welche Runner beim Neuladen anhalten bzw. (neu) starten? Unveränderte laufen weiter.
 * Das gerade im Maker getestete Addon läuft nicht doppelt: es wird angehalten und nicht neu gestartet.
 */
export function planRebuild(running: Map<string, string>, wanted: { id: string; sig: string }[], testId: string | null): { stop: string[]; start: string[] } {
  const want = new Map(wanted.map((w) => [w.id, w.sig]))
  const stop = [...running.keys()].filter((id) => id === testId || want.get(id) !== running.get(id))
  const start = wanted.filter((w) => w.id !== testId && running.get(w.id) !== w.sig).map((w) => w.id)
  return { stop, start }
}
