import type { ReactNode } from 'react'
import type { PanelId } from '../../../shared/types'
import { ProjectsWindow } from './ProjectsWindow'
import { SkillsWindow } from './SkillsWindow'
import { StatsPanel } from './StatsPanel'
import { PromptsWindow } from './PromptsWindow'
import { FocusPanel } from './FocusPanel'
import { DiscordWindow } from './DiscordWindow'
import { AgentPanel, FeedPanel, StatusPanel, TodoPanel } from './WorkflowPanels'

export interface PanelDef {
  id: PanelId
  title: string
  icon: string
  w: number
  h: number
  render: () => ReactNode
}

export const PANELS: PanelDef[] = [
  { id: 'projects', title: 'Projekte', icon: 'folder', w: 520, h: 480, render: () => <ProjectsWindow /> },
  { id: 'skills', title: 'Skills', icon: 'spark', w: 600, h: 540, render: () => <SkillsWindow /> },
  { id: 'prompts', title: 'Prompts & Notizen', icon: 'pen', w: 520, h: 560, render: () => <PromptsWindow /> },
  { id: 'focus', title: 'Fokus-Timer', icon: 'timer', w: 340, h: 470, render: () => <FocusPanel /> },
  { id: 'discord', title: 'Discord Rich Presence', icon: 'discord', w: 900, h: 660, render: () => <DiscordWindow /> },
  { id: 'status', title: 'Status', icon: 'status', w: 420, h: 260, render: () => <StatusPanel /> },
  { id: 'feed', title: 'Live-Feed', icon: 'feed', w: 520, h: 340, render: () => <FeedPanel /> },
  { id: 'todos', title: 'Todos', icon: 'todos', w: 420, h: 340, render: () => <TodoPanel /> },
  { id: 'stats', title: 'Stats', icon: 'stats', w: 460, h: 520, render: () => <StatsPanel /> },
  { id: 'agents', title: 'Agent-Baum', icon: 'agents', w: 420, h: 340, render: () => <AgentPanel /> }
]

export const PANEL_IDS = PANELS.map((p) => p.id) as string[]
export const panelDef = (id: string): PanelDef | undefined => PANELS.find((p) => p.id === id)
