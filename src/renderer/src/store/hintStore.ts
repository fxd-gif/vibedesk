// Leise Tipps statt neuer Symbole: Jeder Tipp kommt höchstens einmal, nie in Fokus-Runden und nie, wenn schon eine Karte da ist.
import { t } from '../../../shared/i18n'
import { openPanel } from '../windows/palette/CommandPalette'
import { openSettings } from '../windows/SettingsWindow'
import { toggleZen, tidyNow } from '../desktop/calm'
import { useFocus } from './focusStore'
import { inform, useNotify, type NoticeAction } from './notifyStore'
import { useSessions } from './sessionStore'
import { useSettings } from './settingsStore'
import { useUi } from './uiStore'
import { hasEdits } from './workflowReducer'
import { useWorkflow } from './workflowStore'
import { nextHint, type HintId } from './hintRules'

/** Mindestabstand zwischen zwei Tipps */
const GAP_MS = 8 * 60_000
/** erst nach dieser Zeit seit dem Start – niemand will beim Hochfahren belehrt werden */
const WARMUP_MS = 90_000
const CHECK_MS = 20_000

export interface Hint {
  id: HintId
  title(): string
  body(): string
  actions(): NoticeAction[]
}

export const HINTS: Hint[] = [
  {
    id: 'merge',
    title: () => t('Zwei Sessions laufen parallel'),
    body: () => t('Merge Studio zeigt, ob sie sich in die Quere kommen, und führt sie sicher zusammen.'),
    actions: () => [{ label: t('Merge Studio öffnen'), primary: true, run: () => openPanel('merge') }]
  },
  {
    id: 'calm',
    title: () => t('Viel offen?'),
    body: () => t('Strg+. zeigt nur noch Claude – oder räum die übrigen Fenster mit einem Klick weg.'),
    actions: () => [
      { label: t('Zen-Modus'), primary: true, run: () => toggleZen() },
      { label: t('Aufräumen'), run: tidyNow }
    ]
  },
  {
    id: 'git',
    title: () => t('Claude hat Dateien geändert'),
    body: () => t('Im Git-Fenster siehst du, was neu ist, und committest mit einem Klick.'),
    actions: () => [{ label: t('Git öffnen'), primary: true, run: () => openPanel('git') }]
  },
  {
    id: 'scene',
    title: () => t('Lust auf eine andere Aussicht?'),
    body: () => t('Tokyo-Gasse, Wald oder ein eigenes Bild – dazu Lofi oder Spotify.'),
    actions: () => [{ label: t('Atmosphäre öffnen'), primary: true, run: () => openPanel('ambience') }]
  },
  {
    id: 'toolbox',
    title: () => t('Es gibt noch mehr'),
    body: () => t('Handy-Begleiter, Discord, Addons und mehr schaltest du im Werkzeugkasten dazu.'),
    actions: () => [{ label: t('Werkzeugkasten'), primary: true, run: () => openSettings('toolbox') }]
  },
  {
    id: 'discord',
    title: () => t('Zeig in Discord, woran du baust'),
    body: () => t('Mit eigenem Text, Bild und dem, was Claude gerade tut.'),
    actions: () => [{ label: t('Discord einrichten'), primary: true, run: () => openPanel('discord') }]
  }
]


let wired = false
export function wireHints(): void {
  if (wired) return
  wired = true
  const started = Date.now()
  let last = 0
  let done = 0
  // Übergänge nach „fertig“ zählen
  let prev: Record<string, string> = {}
  useWorkflow.subscribe((w) => {
    const now: Record<string, string> = {}
    for (const [id, s] of Object.entries(w.sessions)) {
      now[id] = s.status
      if (s.status === 'done' && prev[id] !== 'done') done++
    }
    prev = now
  })
  setInterval(() => {
    const s = useSettings.getState().s
    if (!s?.onboarded || !s.hintsOn) return
    const at = Date.now()
    if (at - started < WARMUP_MS || at - last < GAP_MS) return
    if (useFocus.getState().state.phase === 'work' || useNotify.getState().toasts.length || useUi.getState().zen) return
    const ui = useUi.getState()
    const id = nextHint(
      {
        sessions: useSessions.getState().sessions.length,
        done,
        edits: hasEdits(useWorkflow.getState()),
        visible: ui.open.filter((id) => !ui.minimized.includes(id)).length,
        settings: s
      },
      s.hintsSeen ?? []
    )
    const hint = HINTS.find((h) => h.id === id)
    if (!hint) return
    last = at
    useSettings.getState().set({ hintsSeen: [...(s.hintsSeen ?? []), hint.id] })
    inform(hint.title(), hint.body(), hint.actions(), 'hint')
  }, CHECK_MS)
}
