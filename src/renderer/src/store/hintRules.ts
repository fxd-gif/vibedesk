// Wann welcher leise Tipp passt – reine Regeln, die Texte und Aktionen stehen in hintStore.ts.
import type { PanelId, Settings } from '../../../shared/types'
import { moduleOn } from '../desktop/modules'

export type HintId = 'merge' | 'calm' | 'git' | 'scene' | 'toolbox' | 'discord'

export interface HintCtx {
  sessions: number
  /** wie oft eine Session schon fertig wurde (seit dem Start) */
  done: number
  edits: boolean
  /** sichtbare, nicht minimierte Fenster */
  visible: number
  settings: { modulesOff: PanelId[]; discord: Pick<Settings['discord'], 'enabled'> }
}

/** Reihenfolge = Vorrang */
const RULES: { id: HintId; when(c: HintCtx): boolean }[] = [
  { id: 'merge', when: (c) => c.sessions >= 2 && moduleOn('merge', c.settings.modulesOff) },
  { id: 'calm', when: (c) => c.visible >= 4 },
  { id: 'git', when: (c) => c.sessions > 0 && c.edits },
  { id: 'scene', when: (c) => c.done >= 1 },
  { id: 'toolbox', when: (c) => c.done >= 3 && c.settings.modulesOff.length > 0 },
  { id: 'discord', when: (c) => c.done >= 5 && moduleOn('discord', c.settings.modulesOff) && !c.settings.discord.enabled }
]

/** nächster fälliger Tipp oder null – jeder kommt nur einmal */
export function nextHint(c: HintCtx, seen: readonly string[]): HintId | null {
  return RULES.find((r) => !seen.includes(r.id) && r.when(c))?.id ?? null
}
