// Erfahrung aus dem Onboarding: Anfänger bekommen eine einfache, Profis eine professionelle Grundeinstellung.
// Danach bleibt alles einzeln umschaltbar (Einstellungen → Ansicht).
import type { Experience, PanelId, Settings } from '../../../shared/types'
import { SIMPLE_OFF } from './modules'

export type Level = Exclude<Experience, ''>

export function experiencePreset(level: Level): Partial<Settings> {
  return level === 'pro'
    ? { experience: 'pro', layout: 'studio', modulesOff: [], hintsOn: false, dockAll: true }
    : { experience: 'beginner', layout: 'desktop', modulesOff: [...SIMPLE_OFF] as PanelId[], hintsOn: true, dockAll: false }
}
