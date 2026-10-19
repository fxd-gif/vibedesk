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
import { MergeStudio } from './merge/MergeStudio'
import { CompanionWindow } from './CompanionWindow'
import { AmbienceWindow } from './ambience/AmbienceWindow'
import { t } from '../../../shared/i18n'

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

/** title/hint werden erst beim Lesen übersetzt (Getter) – die Tabelle selbst entsteht beim Import */
type PanelInit = Omit<PanelDef, 'title' | 'hint'> & { title: () => string; hint: () => string }
function panel({ title, hint, ...rest }: PanelInit): PanelDef {
  return {
    ...rest,
    get title() {
      return title()
    },
    get hint() {
      return hint()
    }
  }
}

export const PANELS: PanelDef[] = [
  panel({ id: 'projects', title: () => t('Projekte'), hint: () => t('Projekte öffnen, anlegen und frühere Sessions fortsetzen'), icon: 'folder', w: 520, h: 480, render: () => <ProjectsWindow /> }),
  panel({ id: 'skills', title: () => t('Skills'), hint: () => t('Fähigkeiten für Claude installieren – per Drag & Drop oder GitHub-Link'), icon: 'spark', w: 600, h: 540, render: () => <SkillsWindow /> }),
  panel({ id: 'prompts', title: () => t('Prompts & Notizen'), hint: () => t('Fertige Prompts und Notizen pro Projekt'), icon: 'pen', w: 520, h: 560, render: () => <PromptsWindow /> }),
  panel({ id: 'ambience', title: () => t('Atmosphäre & Musik'), hint: () => t('Spotify, Lofi-Radio, Szene und Regen'), icon: 'rain', w: 1100, h: 680, render: () => <AmbienceWindow /> }),
  panel({ id: 'focus', title: () => t('Fokus-Timer'), hint: () => t('Pomodoro-Timer – in Pausen wird es leiser'), icon: 'timer', w: 340, h: 470, render: () => <FocusPanel /> }),
  panel({ id: 'discord', title: () => t('Discord Rich Presence'), hint: () => t('Zeig in Discord, woran du gerade baust'), icon: 'discord', w: 900, h: 660, render: () => <DiscordWindow /> }),
  panel({ id: 'inspector', title: () => t('Session-Inspector'), hint: () => t('Live sehen, was Claude tut: Aktionen, Todos, Agents, Kosten'), icon: 'inspect', w: 560, h: 520, render: () => <InspectorWindow /> }),
  panel({ id: 'lounge', title: () => t('Vibe-Lounge'), hint: () => t('Mit Freunden im selben Raum vibecoden'), icon: 'users', w: 520, h: 620, render: () => <LoungeWindow /> }),
  panel({ id: 'companion', title: () => t('Handy-Begleiter'), hint: () => t('Claude vom Handy aus Freigaben geben, Vorschläge holen und Aufträge schicken'), icon: 'phone', w: 560, h: 660, render: () => <CompanionWindow /> }),
  panel({ id: 'streamer', title: () => t('Streamer-Modus'), hint: () => t('Geheimnisse schwärzen, OBS-Overlay und Twitch-Chat'), icon: 'broadcast', w: 580, h: 680, render: () => <StreamerWindow /> }),
  panel({ id: 'editor', title: () => t('Editor'), hint: () => t('Dateien ansehen und schnell selbst anpassen'), icon: 'code', ...EDITOR_SIZE, render: () => <EditorWindow />, onClose: () => void closeEditor() }),
  panel({ id: 'git', title: () => t('Git & GitHub'), hint: () => t('Änderungen ansehen, committen und mit GitHub synchronisieren'), icon: 'github', w: 1080, h: 680, render: () => <GitWindow /> }),
  panel({ id: 'merge', title: () => t('Merge Studio'), hint: () => t('Parallele Sessions vergleichen, Konflikte erkennen und sicher zusammenführen'), icon: 'merge', w: 1240, h: 800, render: () => <MergeStudio /> }),
  panel({ id: 'brain', title: () => t('Gehirn'), hint: () => t('Was Claude über dein Projekt weiß – als lebendiger Graph'), icon: 'brain', w: 1160, h: 720, render: () => <BrainWindow /> }),
  panel({ id: 'addons', title: () => t('Addons'), hint: () => t('Eigene Abläufe bauen – ganz ohne Code'), icon: 'puzzle', w: 1240, h: 780, render: () => <AddonWindow /> })
]

export const PANEL_IDS = PANELS.map((p) => p.id) as string[]

/** Frühere Einzel-Panels leben jetzt als Tabs im Session-Inspector. */
const LEGACY_INSPECTOR = new Set(['status', 'feed', 'todos', 'agents', 'stats'])
export function migratePanels(ids: string[]): PanelId[] {
  const out = ids.map((id) => (LEGACY_INSPECTOR.has(id) ? 'inspector' : id)).filter((id) => PANEL_IDS.includes(id))
  return [...new Set(out)] as PanelId[]
}
export const panelDef = (id: string): PanelDef | undefined => PANELS.find((p) => p.id === id)
