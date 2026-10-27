import { t } from '../../../shared/i18n'
import { create } from 'zustand'
import { api, errorText } from '../api'
import { decodeShare, encodeShare, findShareCode, type ShareEnvelope } from '../../../shared/shareCode'
import type { Prompt, SkillCandidateSummary } from '../../../shared/types'
import { SCENES } from '../ambience/sceneParams'
import { alert } from './dialogStore'
import { useSettings } from './settingsStore'
import { useLiving } from '../ambience/LivingScene'
import { isLivingScene, livingId } from '../../../shared/living'

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

export function sharePrompts(prompts: Prompt[], title = prompts.length === 1 ? t('Prompt „{title}“', { title: prompts[0].title }) : t('{n} Prompts', { n: prompts.length })): void {
  showCode(title, encodeShare({ kind: 'prompts', prompts: prompts.map((p) => ({ title: p.title, text: p.text })), from: author() }))
}

export async function shareSkill(dir: string, name: string): Promise<void> {
  try {
    showCode(t('Skill „{name}“', { name }), await api.skills.exportCode(dir, author()))
  } catch (err) {
    await alert(t('Teilen nicht möglich'), errorText(err))
  }
}

/** Lebende Szene als Code – ohne das Bild, das bleibt privat */
export async function shareLivingScene(id: string, name: string): Promise<void> {
  try {
    showCode(t('Szene „{name}“', { name }), await api.living.exportCode(id, author()))
  } catch (err) {
    await alert(t('Teilen nicht möglich'), errorText(err))
  }
}

export async function shareAmbience(): Promise<void> {
  const s = useSettings.getState().s
  if (!s) return
  // läuft gerade eine lebende Szene: die teilen statt abzulehnen
  if (isLivingScene(s.scene)) {
    const sc = useLiving.getState().list.find((x) => x.id === livingId(s.scene))
    if (sc) return shareLivingScene(sc.id, sc.name)
  }
  if (!SCENES.some((x) => x.id === s.scene)) {
    await alert(t('Eigene Bilder lassen sich nicht teilen'), t('Wähle einen der eingebauten Ausblicke – Regen, Musik und Stream werden mitgeteilt.'))
    return
  }
  showCode(
    t('Deine Atmosphäre'),
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
    if (env.kind === 'ambience' && !SCENES.some((x) => x.id === env.ambience.scene)) throw new Error(t('Dieser Ausblick ist in deiner VibeDesk-Version nicht enthalten.'))
    useShare.setState({ pending: { env, code, skill }, pasteOpen: false })
    return true
  } catch (err) {
    await alert(t('Code lässt sich nicht öffnen'), errorText(err))
    return false
  }
}

export function openPaste(): void {
  useShare.setState({ pasteOpen: true })
}
