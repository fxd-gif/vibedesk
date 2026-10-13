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
import { LoungeWindow } from './LoungeWindow'
import { StreamerWindow } from './StreamerWindow'
import { BrainWindow } from './brain/BrainWindow'
import { GitWindow } from './git/GitWindow'
import { CompanionWindow } from './CompanionWindow'

export interface PanelDef {
  id: PanelId
  title: string
  /** ein Satz: wofür das Fenster da ist (Tooltip, Mehr-Menü) */
  hint: string
  icon: string
  w: number
  h: number
  render: () => ReactNode
  /** eigener Schließen-Ablauf (z. B. Nachfrage bei ungespeicherten Änderungen) */
  onClose?: () => void
}

export const PANELS: PanelDef[] = [
  { id: 'projects', title: 'Projekte', hint: 'Projekte öffnen, anlegen und frühere Sessions fortsetzen', icon: 'folder', w: 520, h: 480, render: () => <ProjectsWindow /> },
  { id: 'skills', title: 'Skills', hint: 'Fähigkeiten für Claude installieren – per Drag & Drop oder GitHub-Link', icon: 'spark', w: 600, h: 540, render: () => <SkillsWindow /> },
  { id: 'prompts', title: 'Prompts & Notizen', hint: 'Fertige Prompts und Notizen pro Projekt', icon: 'pen', w: 520, h: 560, render: () => <PromptsWindow /> },
  { id: 'focus', title: 'Fokus-Timer', hint: 'Pomodoro-Timer – in Pausen wird es leiser', icon: 'timer', w: 340, h: 470, render: () => <FocusPanel /> },
  { id: 'discord', title: 'Discord Rich Presence', hint: 'Zeig in Discord, woran du gerade baust', icon: 'discord', w: 900, h: 660, render: () => <DiscordWindow /> },
  { id: 'inspector', title: 'Session-Inspector', hint: 'Live sehen, was Claude tut: Aktionen, Todos, Agents, Kosten', icon: 'inspect', w: 560, h: 520, render: () => <InspectorWindow /> },
  { id: 'lounge', title: 'Vibe-Lounge', hint: 'Mit Freunden im selben Raum vibecoden', icon: 'users', w: 520, h: 620, render: () => <LoungeWindow /> },
  { id: 'companion', title: 'Handy-Begleiter', hint: 'Claude vom Handy aus Freigaben geben, Vorschläge holen und Aufträge schicken', icon: 'phone', w: 560, h: 660, render: () => <CompanionWindow /> },
  { id: 'streamer', title: 'Streamer-Modus', hint: 'Geheimnisse schwärzen, OBS-Overlay und Twitch-Chat', icon: 'broadcast', w: 580, h: 680, render: () => <StreamerWindow /> },
  { id: 'editor', title: 'Editor', hint: 'Dateien ansehen und schnell selbst anpassen', icon: 'code', ...EDITOR_SIZE, render: () => <EditorWindow />, onClose: () => void closeEditor() },
  { id: 'git', title: 'Git & GitHub', hint: 'Änderungen ansehen, committen und mit GitHub synchronisieren', icon: 'github', w: 1080, h: 680, render: () => <GitWindow /> },
  { id: 'brain', title: 'Gehirn', hint: 'Was Claude über dein Projekt weiß – als lebendiger Graph', icon: 'brain', w: 1160, h: 720, render: () => <BrainWindow /> },
  { id: 'addons', title: 'Addons', hint: 'Eigene Abläufe bauen – ganz ohne Code', icon: 'puzzle', w: 1240, h: 780, render: () => <AddonWindow /> }
]

export const PANEL_IDS = PANELS.map((p) => p.id) as string[]

/** Frühere Einzel-Panels leben jetzt als Tabs im Session-Inspector. */
const LEGACY_INSPECTOR = new Set(['status', 'feed', 'todos', 'agents', 'stats'])
export function migratePanels(ids: string[]): PanelId[] {
  const out = ids.map((id) => (LEGACY_INSPECTOR.has(id) ? 'inspector' : id)).filter((id) => PANEL_IDS.includes(id))
  return [...new Set(out)] as PanelId[]
}
export const panelDef = (id: string): PanelDef | undefined => PANELS.find((p) => p.id === id)
