// Ruhe auf dem Desktop: Zen-Modus (nur ein Fenster), Aufräumen und ein Dock, das beim Tippen zurücktritt.
import { t } from '../../../shared/i18n'
import { inform } from '../store/notifyStore'
import { kindOf } from '../store/sessionStore'
import { useSettings } from '../store/settingsStore'
import { useUi } from '../store/uiStore'

/** so lange unbenutzt, dann minimiert „Fenster automatisch aufräumen“ ein Panel */
export const TIDY_IDLE_MS = 15 * 60_000
/** so lange nach dem letzten Tastendruck im Terminal bleibt das Dock abgeblendet */
const TYPING_MS = 2500

/** Zen: das oberste Terminal (sonst das oberste Fenster) groß, alles andere tritt zurück. Mit `target` gezielt eins. */
export function toggleZen(target?: string): void {
  const ui = useUi.getState()
  if (ui.zen && (!target || target === ui.zen)) return ui.setZen(null)
  const visible = ui.open.filter((id) => !ui.minimized.includes(id))
  const pick = target ?? [...visible].reverse().find((id) => id.startsWith('term:')) ?? visible[visible.length - 1] ?? [...ui.open].reverse().find((id) => id.startsWith('term:'))
  if (!pick) return inform(t('Zen-Modus braucht ein Fenster'), t('Starte eine Session – dann zeigt Zen nur noch Claude und den Regen.'))
  ui.setZen(pick)
}

/** Aufräumen per Klick: alle Panels außer dem obersten minimieren, Rest neu anordnen */
export function tidyNow(): void {
  const ui = useUi.getState()
  const gone = ui.tidy(kindOf, 0)
  ui.arrangeAll(kindOf)
  inform(gone.length ? t('{n} Fenster weggeräumt', { n: gone.length }) : t('Schon aufgeräumt'), gone.length ? t('Sie warten minimiert im Dock.') : undefined)
}

let wired = false
export function wireCalm(): void {
  if (wired) return
  wired = true
  // Strg+. schaltet Zen um – auch im Terminal, dort hat die Kombination keine Bedeutung
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === '.') {
        e.preventDefault()
        e.stopPropagation()
        toggleZen()
      }
    },
    true
  )
  // Tippen im Terminal: Dock abblenden
  let timer: ReturnType<typeof setTimeout> | undefined
  window.addEventListener(
    'keydown',
    (e) => {
      if (!useSettings.getState().s?.dockFade) return
      if (!(e.target as HTMLElement | null)?.closest?.('.xterm')) return
      document.documentElement.dataset.typing = '1'
      clearTimeout(timer)
      timer = setTimeout(() => delete document.documentElement.dataset.typing, TYPING_MS)
    },
    true
  )
  window.addEventListener('pointermove', (e) => {
    // Maus unten am Rand holt das Dock sofort zurück
    if (document.documentElement.dataset.typing && e.clientY > window.innerHeight - 110) delete document.documentElement.dataset.typing
  })
  // automatisch aufräumen: einmal pro Minute nachsehen
  setInterval(() => {
    if (!useSettings.getState().s?.autoTidy || useUi.getState().zen) return
    useUi.getState().tidy(kindOf, TIDY_IDLE_MS)
  }, 60_000)
}
