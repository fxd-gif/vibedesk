import type { ReactNode } from 'react'
import type { PanelId } from '../../../shared/types'
import { ProjectsWindow } from './ProjectsWindow'
import { SkillsWindow } from './SkillsWindow'
import { PromptsWindow } from './PromptsWindow'
import { FocusPanel } from './FocusPanel'
import { DiscordWindow } from './DiscordWindow'
import { InspectorWindow } from './InspectorWindow'
import { EditorWindow } from './editor/EditorWindow'
import { closeEditor, EDITOR_SIZE } from '../store/editorStore'
import { AddonWindow } from './addons/AddonWindow'

export interface PanelDef {
  id: PanelId
  title: string
  icon: string
  w: number
  h: number
  render: () => ReactNode
  /** eigener Schließen-Ablauf (z. B. Nachfrage bei ungespeicherten Änderungen) */
  onClose?: () => void
}

export const PANELS: PanelDef[] = [
  { id: 'projects', title: 'Projekte', icon: 'folder', w: 520, h: 480, render: () => <ProjectsWindow /> },
  { id: 'skills', title: 'Skills', icon: 'spark', w: 600, h: 540, render: () => <SkillsWindow /> },
  { id: 'prompts', title: 'Prompts & Notizen', icon: 'pen', w: 520, h: 560, render: () => <PromptsWindow /> },
  { id: 'focus', title: 'Fokus-Timer', icon: 'timer', w: 340, h: 470, render: () => <FocusPanel /> },
  { id: 'discord', title: 'Discord Rich Presence', icon: 'discord', w: 900, h: 660, render: () => <DiscordWindow /> },
  { id: 'inspector', title: 'Session-Inspector', icon: 'inspect', w: 560, h: 520, render: () => <InspectorWindow /> },
  { id: 'editor', title: 'Editor', icon: 'code', ...EDITOR_SIZE, render: () => <EditorWindow />, onClose: () => void closeEditor() },
  { id: 'addons', title: 'Addons', icon: 'puzzle', w: 1100, h: 720, render: () => <AddonWindow /> }
]

export const PANEL_IDS = PANELS.map((p) => p.id) as string[]

/** Frühere Einzel-Panels leben jetzt als Tabs im Session-Inspector. */
const LEGACY_INSPECTOR = new Set(['status', 'feed', 'todos', 'agents', 'stats'])
export function migratePanels(ids: string[]): PanelId[] {
  const out = ids.map((id) => (LEGACY_INSPECTOR.has(id) ? 'inspector' : id)).filter((id) => PANEL_IDS.includes(id))
  return [...new Set(out)] as PanelId[]
}
export const panelDef = (id: string): PanelDef | undefined => PANELS.find((p) => p.id === id)
