// Zeigt, was Claude gerade im Gehirn festhält: geschriebene Notizen kurz als Karte (mehrere in Folge zusammengefasst).
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
  let timer: ReturnType<typeof setTimeout> | undefined
  const flush = (): void => {
    const list = titles
    titles = []
    if (!list.length || !useSettings.getState().s?.brainOn) return
    const title = tn(list.length, 'Gehirn aktualisiert', 'Gehirn: {n} Notizen aktualisiert')
    inform(title, list.join(' · '), [{ label: t('Ansehen'), run: () => useUi.getState().openWin('brain') }], 'brain-write')
  }
  api.on.brainPulse((p) => {
    if (p.kind !== 'write' || !p.title) return
    if (!titles.includes(p.title)) titles.push(p.title)
    clearTimeout(timer)
    timer = setTimeout(flush, GATHER_MS)
  })
}
