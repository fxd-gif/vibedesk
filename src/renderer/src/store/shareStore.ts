import { create } from 'zustand'
import { api, errorText } from '../api'
import { decodeShare, encodeShare, findShareCode, type ShareEnvelope } from '../../../shared/shareCode'
import type { Prompt, SkillCandidateSummary } from '../../../shared/types'
import { SCENES } from '../ambience/sceneParams'
import { alert } from './dialogStore'
import { useSettings } from './settingsStore'

export interface PendingImport {
  env: ShareEnvelope
  code: string
  /** vom Main-Prozess geprüfte Skill-Kandidaten (Name/Beschreibung aus der SKILL.md) */
  skill?: SkillCandidateSummary[]
}

interface ShareState {
  exported: { title: string; code: string } | null
  pending: PendingImport | null
  /** Einfüge-Feld für einen Code */
  pasteOpen: boolean
}

export const useShare = create<ShareState>(() => ({ exported: null, pending: null, pasteOpen: false }))

/** Absendername für Codes – der Lounge-Name, falls gesetzt. */
const author = (): string => useSettings.getState().s?.lounge.name ?? ''

export function showCode(title: string, code: string): void {
  useShare.setState({ exported: { title, code } })
}

export function sharePrompts(prompts: Prompt[], title = prompts.length === 1 ? `Prompt „${prompts[0].title}“` : `${prompts.length} Prompts`): void {
  showCode(title, encodeShare({ kind: 'prompts', prompts: prompts.map((p) => ({ title: p.title, text: p.text })), from: author() }))
}

export async function shareSkill(dir: string, name: string): Promise<void> {
  try {
    showCode(`Skill „${name}“`, await api.skills.exportCode(dir, author()))
  } catch (err) {
    await alert('Teilen nicht möglich', errorText(err))
  }
}

export async function shareAmbience(): Promise<void> {
  const s = useSettings.getState().s
  if (!s) return
  if (!SCENES.some((x) => x.id === s.scene)) {
    await alert('Eigene Bilder lassen sich nicht teilen', 'Wähle einen der eingebauten Ausblicke – Regen, Musik und Stream werden mitgeteilt.')
    return
  }
  showCode(
    'Deine Atmosphäre',
    encodeShare({
      kind: 'ambience',
      from: author(),
      ambience: {
        scene: s.scene,
        rainIntensity: s.rainIntensity,
        blur: s.blur,
        rainSoundOn: s.rainSoundOn,
        rainSoundVolume: s.rainSoundVolume,
        musicOn: s.musicOn,
        musicVolume: s.musicVolume,
        streamUrl: s.streamUrl
      }
    })
  )
}

/** Prüft einen Code (oder Text mit Code) und öffnet die Vorschau. Nichts wird ohne Bestätigung übernommen. */
export async function startImport(text: string): Promise<boolean> {
  const code = findShareCode(text.replace(/\s+/g, '')) ?? text.trim()
  try {
    const env = decodeShare(code)
    let skill: SkillCandidateSummary[] | undefined
    if (env.kind === 'skill') skill = await api.skills.importCode(code)
    if (env.kind === 'ambience' && !SCENES.some((x) => x.id === env.ambience.scene)) throw new Error('Dieser Ausblick ist in deiner VibeDesk-Version nicht enthalten.')
    useShare.setState({ pending: { env, code, skill }, pasteOpen: false })
    return true
  } catch (err) {
    await alert('Code lässt sich nicht öffnen', errorText(err))
    return false
  }
}

export function openPaste(): void {
  useShare.setState({ pasteOpen: true })
}
