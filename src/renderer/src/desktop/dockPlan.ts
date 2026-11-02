// Das Dock wächst mit: Werkzeuge erscheinen erst, wenn sie etwas zu tun haben – der Rest liegt unter „Mehr“.
import type { PanelId } from '../../../shared/types'
import { moduleOn } from './modules'
import { t } from '../../../shared/i18n'

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

/** Mit anderen und fürs Publikum – alles andere ist Arbeitswerkzeug */
const SOCIAL = new Set<PanelId>(['lounge', 'companion', 'discord', 'streamer'])

/** Arbeiten · Gemeinsam & Streaming; Überschriften nur, wenn es beide Gruppen gibt */
export function moreGroups(items: PanelId[]): { id: string; label: string; items: PanelId[] }[] {
  const work = items.filter((id) => !SOCIAL.has(id))
  const social = items.filter((id) => SOCIAL.has(id))
  const both = work.length > 0 && social.length > 0
  return [
    { id: 'work', label: both ? t('Arbeiten') : '', items: work },
    { id: 'social', label: both ? t('Gemeinsam & Streaming') : '', items: social }
  ].filter((g) => g.items.length)
}
