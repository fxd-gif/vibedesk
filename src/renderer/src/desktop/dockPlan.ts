// Das Dock wächst mit: Werkzeuge erscheinen erst, wenn sie etwas zu tun haben – der Rest liegt unter „Mehr“.
import type { PanelId } from '../../../shared/types'

export interface DockCtx {
  /** Nutzer will immer alle Symbole */
  all: boolean
  sessions: number
  addons: number
  loungeOn: boolean
  /** Fenster ist offen (auch minimiert) */
  isOpen(id: PanelId): boolean
}

/** Reihenfolge im Dock bzw. im Mehr-Menü */
const OPTIONAL: PanelId[] = ['inspector', 'editor', 'addons', 'lounge', 'prompts', 'skills', 'discord', 'streamer']

function earned(id: PanelId, c: DockCtx): boolean {
  switch (id) {
    case 'inspector':
    case 'editor':
      return c.sessions > 0
    case 'addons':
      return c.addons > 0
    case 'lounge':
      return c.loungeOn
    default:
      return false
  }
}

/** Nur diese wandern mit „Alle Symbole“ ins Dock – der Rest bleibt im Mehr-Menü */
const DOCKABLE = new Set<PanelId>(['inspector', 'editor', 'addons', 'lounge'])

export function dockPlan(c: DockCtx): { dock: PanelId[]; more: PanelId[] } {
  const dock = OPTIONAL.filter((id) => DOCKABLE.has(id) && (c.all || c.isOpen(id) || earned(id, c)))
  return { dock, more: OPTIONAL.filter((id) => !dock.includes(id)) }
}

export const showPreviewInDock = (c: DockCtx, previews: number): boolean => c.all || c.sessions > 0 || previews > 0
