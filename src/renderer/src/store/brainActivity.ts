// Zeigt, was Claude gerade im Gehirn festhält: geschriebene Notizen kurz als Karte (mehrere in Folge zusammengefasst).
import { ME_ID } from '../../../shared/brain'
import { t, tn } from '../../../shared/i18n'
import { api } from '../api'
import { inform } from './notifyStore'
import { useSettings } from './settingsStore'
import { useUi } from './uiStore'

const GATHER_MS = 1500

let wired = false
export function wireBrainActivity(): void {
  if (wired) return
  wired = true
  let titles: string[] = []
  /** alles in dieser Runde betraf das persönliche Gehirn – dann eine eigene Karte */
  let onlyMe = true
  let timer: ReturnType<typeof setTimeout> | undefined
  const flush = (): void => {
    const list = titles
    const me = onlyMe
    titles = []
    onlyMe = true
    if (!list.length || !useSettings.getState().s?.brainOn) return
    const title = me ? t('Claude hat sich etwas über dich gemerkt') : tn(list.length, 'Gehirn aktualisiert', 'Gehirn: {n} Notizen aktualisiert')
    inform(title, list.join(' · '), [{ label: t('Ansehen'), run: () => useUi.getState().openWin('brain') }], 'brain-write')
  }
  api.on.brainPulse((p) => {
    if (p.kind !== 'write' || !p.title) return
    if (!titles.includes(p.title)) titles.push(p.title)
    if (p.projectId !== ME_ID) onlyMe = false
    clearTimeout(timer)
    timer = setTimeout(flush, GATHER_MS)
  })
}
