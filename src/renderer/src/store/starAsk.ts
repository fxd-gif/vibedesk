// Einmal im Leben einer Installation leise um einen GitHub-Stern bitten – erst nach 10 fertigen Claude-Runden.
import { t } from '../../../shared/i18n'
import { api } from '../api'
import { inform, retract } from './notifyStore'
import { useSettings } from './settingsStore'
import { starAskDue } from '../../../shared/starAsk'

const REPO = 'https://github.com/fxd-gif/vibedesk'
const KEY = 'star-ask'

/** Eine Claude-Runde ist fertig geworden */
export function noteDone(): void {
  const st = useSettings.getState()
  const s = st.s
  if (!s) return
  const doneCount = (s.doneCount ?? 0) + 1
  if (!starAskDue(doneCount, !!s.starAsked)) {
    // nach der Bitte wird nicht mehr gezählt – kein Schreiben bei jeder Runde
    if (!s.starAsked) st.set({ doneCount })
    return
  }
  st.set({ doneCount, starAsked: true })
  inform(
    t('Gefällt dir VibeDesk?'),
    t('VibeDesk ist kostenlos und wird von einer Person gebaut. Ein Stern auf GitHub hilft anderen, es zu finden. Diese Frage kommt nur dieses eine Mal.'),
    [
      {
        label: t('★ Stern geben'),
        primary: true,
        run: () => {
          api.openExternal(REPO)
          retract(KEY)
        }
      },
      { label: t('Nein danke'), run: () => retract(KEY) }
    ],
    KEY,
    true
  )
}
