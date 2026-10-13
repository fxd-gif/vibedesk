// Reine Übersetzung von App-Zuständen in Addon-Ereignisse (ohne Store-Abhängigkeiten, testbar).
import type { InstalledAddon, SessionStatus } from '../../../shared/types'
import { ADDON_SCHEME } from '../../../shared/addonFormat'
import type { Phase } from '../store/focusTimer'
import type { AddonEvent } from './interpreter'

type StatusMap = Record<string, { status: SessionStatus }>

export function statusTransitions(prev: StatusMap, next: StatusMap): AddonEvent[] {
  const out: AddonEvent[] = []
  for (const [id, s] of Object.entries(next)) {
    if (prev[id]?.status === s.status) continue
    if (s.status === 'waiting') out.push({ type: 'session_waiting' })
    else if (s.status === 'done') out.push({ type: 'session_done' })
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
