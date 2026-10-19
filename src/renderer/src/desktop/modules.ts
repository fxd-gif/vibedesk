// Werkzeugkasten: Module, die man ausblenden kann. Der Kern (Projekte, Sessions, Atmosphäre, Inspector, Editor, Git) bleibt immer.
import type { PanelId } from '../../../shared/types'

/** Reihenfolge im Werkzeugkasten */
export const MODULES: PanelId[] = ['brain', 'merge', 'prompts', 'skills', 'addons', 'companion', 'lounge', 'discord', 'streamer']

/** „Einfach“ beim ersten Start: nur der Kern plus Gehirn, Merge Studio, Prompts und Skills */
export const SIMPLE_OFF: PanelId[] = ['addons', 'companion', 'lounge', 'discord', 'streamer']

export const isModule = (id: string): boolean => (MODULES as string[]).includes(id)

/** Ist ein Fenster sichtbar erlaubt? Kern-Fenster immer. */
export function moduleOn(id: string, off: readonly string[] | undefined): boolean {
  return !isModule(id) || !(off ?? []).includes(id)
}
