// Reine Übersetzung von App-Zuständen in Addon-Ereignisse (ohne Store-Abhängigkeiten, testbar).
import type { InstalledAddon, SessionStatus } from '../../../shared/types'
import { ADDON_SCHEME } from '../../../shared/addonFormat'
import type { Phase } from '../store/focusTimer'
import type { AddonEvent } from './interpreter'

type StatusMap = Record<string, { status: SessionStatus }>

export function statusTransitions(prev: StatusMap, next: StatusMap, projectOf: (sessionId: string) => string | undefined = () => undefined): AddonEvent[] {
  const out: AddonEvent[] = []
  for (const [id, s] of Object.entries(next)) {
    if (prev[id]?.status === s.status) continue
    const project = projectOf(id)
    if (s.status === 'waiting') out.push(project ? { type: 'session_waiting', project } : { type: 'session_waiting' })
    else if (s.status === 'done') out.push(project ? { type: 'session_done', project } : { type: 'session_done' })
  }
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
