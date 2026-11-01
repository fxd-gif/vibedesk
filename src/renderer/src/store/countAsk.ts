// Einmal leise fragen, ob VibeDesk anonym mitzählen darf – höchstens zweimal, nie beim Start, nie ohne Antwortknöpfe.
import { t } from '../../../shared/i18n'
import { inform, retract } from './notifyStore'
import { useSettings } from './settingsStore'

const ASK_AFTER_MS = 3 * 60_000
const KEY = 'count-me'

export function wireCountAsk(): void {
  setTimeout(() => {
    const st = useSettings.getState()
    const s = st.s
    if (!s?.onboarded || s.countMe !== null || (s.countMeAsked ?? 0) >= 2) return
    st.set({ countMeAsked: (s.countMeAsked ?? 0) + 1 })
    const answer = (countMe: boolean) => () => {
      useSettings.getState().set({ countMe })
      retract(KEY)
    }
    inform(
      t('Darf VibeDesk anonym mitzählen?'),
      t('Dann sieht der Entwickler, wie viele VibeDesk gerade nutzen – das motiviert enorm. Geschickt wird nur eine zufällige Kennung, die jeden Tag neu verschlüsselt wird, und die Versionsnummer. Kein Name, keine Projekte, keine Pfade. Änderbar unter Einstellungen → Updates.'),
      [
        { label: t('Ja, gern'), primary: true, run: answer(true) },
        { label: t('Nein danke'), run: answer(false) }
      ],
      KEY,
      true
    )
  }, ASK_AFTER_MS)
}
