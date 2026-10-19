// Das Dock wächst mit: Werkzeuge erscheinen erst, wenn sie etwas zu tun haben – der Rest liegt unter „Mehr“.
import type { PanelId } from '../../../shared/types'
import { moduleOn } from './modules'

export interface DockCtx {
  /** Nutzer will immer alle Symbole */
  all: boolean
  sessions: number
  addons: number
  loungeOn: boolean
  /** Fenster ist offen (auch minimiert) */
  isOpen(id: PanelId): boolean
  /** Claude hat in einer Session Dateien geändert – erst dann gibt es etwas zu committen */
  edits?: boolean
  /** Claude hat das Gehirn benutzt (gelesen oder geschrieben) */
  brainUsed?: boolean
  /** im Werkzeugkasten ausgeblendete Module */
  off?: readonly PanelId[]
  /** schon einmal verdient – bleibt, damit das Dock nicht herumspringt */
  sticky?: ReadonlySet<PanelId>
}

/** Reihenfolge im Dock bzw. im Mehr-Menü */
const OPTIONAL: PanelId[] = ['inspector', 'editor', 'git', 'brain', 'merge', 'addons', 'lounge', 'prompts', 'skills', 'companion', 'discord', 'streamer']

export function earned(id: PanelId, c: DockCtx): boolean {
  switch (id) {
    case 'inspector':
      return c.sessions > 0
    // Editor kommt über den Live-Feed oder die Palette – im Dock erst, wenn er offen ist
    case 'git':
      return c.sessions > 0 && !!c.edits
    case 'brain':
      return c.sessions > 0 && !!c.brainUsed
    // erst bei parallelen Sessions gibt es etwas zusammenzuführen
    case 'merge':
      return c.sessions > 1
    case 'addons':
      return c.addons > 0
    case 'lounge':
      return c.loungeOn
    default:
      return false
  }
}

/** Nur diese wandern mit „Alle Symbole“ ins Dock – der Rest bleibt im Mehr-Menü */
const DOCKABLE = new Set<PanelId>(['inspector', 'editor', 'git', 'brain', 'merge', 'addons', 'lounge'])

export function dockPlan(c: DockCtx): { dock: PanelId[]; more: PanelId[] } {
  const shown = OPTIONAL.filter((id) => c.isOpen(id) || moduleOn(id, c.off))
  const dock = shown.filter((id) => DOCKABLE.has(id) && (c.all || c.isOpen(id) || earned(id, c) || !!c.sticky?.has(id)))
  return { dock, more: shown.filter((id) => !dock.includes(id)) }
}

/** Vorschau erst, wenn es etwas anzusehen gibt: offene Vorschau oder erkannter Dev-Server */
export const showPreviewInDock = (c: DockCtx, previews: number): boolean => c.all || previews > 0
