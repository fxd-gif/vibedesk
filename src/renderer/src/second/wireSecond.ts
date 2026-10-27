// Zweitfenster (Beta): nur lesen und anzeigen – Sessions, Hooks, Addons, Audio und Mitteilungen bleiben im Hauptfenster.
import { api } from '../api'
import { screenDiff, isPreviewItem, type ScreenAction, type ScreenItem, type ScreenMirror, type ScreenState } from '../../../shared/secondScreen'
import type { SessionStats } from '../../../shared/types'
import { panelDef } from '../windows/panels'
import { useBudget } from '../store/budgetStore'
import { previewUrl } from '../store/screenMain'
import { setScreenRelay } from '../store/screenRelay'
import { onScreen, setScreenMover, useScreen } from '../store/screenStore'
import { useSessions } from '../store/sessionStore'
import { usePreview } from '../store/previewStore'
import { useSettings, wireSettingsSync } from '../store/settingsStore'
import { useStats, wireStats } from '../store/statsStore'
import { useStreamer } from '../store/streamerStore'
import { centeredRect, useUi } from '../store/uiStore'
import { useWorkflow, wireWorkflow } from '../store/workflowStore'
import type { WorkflowState } from '../store/workflowReducer'

const previewKey = (id: string): string => id.slice('preview:'.length)

/** gerade schließt das Zweitfenster selbst etwas (weil Main es so sagt) – nicht als „geschlossen“ zurückmelden */
let quiet = false

function openHere(it: ScreenItem): void {
  if (isPreviewItem(it.id)) {
    usePreview.setState((s) => ({ open: { ...s.open, [previewKey(it.id)]: it.url ?? '' } }))
    useUi.getState().openWin(it.id, centeredRect(Math.min(1100, window.innerWidth - 80), Math.min(760, window.innerHeight - 160)))
    return
  }
  const def = panelDef(it.id)
  if (def) useUi.getState().openWin(it.id, centeredRect(def.w, def.h))
}

function closeHere(id: string): void {
  quiet = true
  try {
    if (isPreviewItem(id)) usePreview.getState().closePreview(previewKey(id))
    else useUi.getState().closeWin(id)
  } finally {
    quiet = false
  }
}

function apply(s: ScreenState): void {
  const prev = useScreen.getState().items
  useScreen.setState({ available: s.available, open: s.open, items: s.items })
  const d = screenDiff(prev, s.items)
  d.removed.forEach(closeHere)
  d.added.forEach(openHere)
  // Platz gibt es genug: neu Angekommenes ordnet sich mit den anderen nebeneinander
  if (d.added.length || d.removed.length) useUi.getState().arrangeAll(() => 'panel')
}

const isWorkflow = (x: unknown): x is WorkflowState =>
  !!x && typeof x === 'object' && typeof (x as WorkflowState).nextFeedId === 'number' && !!(x as WorkflowState).sessions && typeof (x as WorkflowState).sessions === 'object'

let flowing = false
/** Hook-Ereignisse selbst verarbeiten – erst ab dem Stand aus dem Hauptfenster, sonst fehlte der Verlauf */
function startFlow(): void {
  if (flowing) return
  flowing = true
  wireWorkflow()
}

let known = new Set<string>()
function mirror(m: ScreenMirror): void {
  if (isWorkflow(m.workflow)) {
    useWorkflow.setState({ sessions: m.workflow.sessions, nextFeedId: m.workflow.nextFeedId })
    startFlow()
  }
  if (m.stats && typeof m.stats === 'object') useStats.setState({ sessions: m.stats as Record<string, SessionStats> })
  const sessions = Array.isArray(m.sessions) ? m.sessions : []
  const external = Array.isArray(m.external) ? m.external : []
  // wie im Hauptfenster: neue Session → leerer Ablauf, beendete → weg
  const ids = new Set([...sessions, ...external].map((x) => x.id))
  const wf = useWorkflow.getState()
  for (const id of ids) if (!wf.sessions[id]) wf.dispatch({ type: 'start', sessionId: id })
  for (const id of known) if (!ids.has(id)) wf.dispatch({ type: 'remove', sessionId: id })
  known = ids
  useSessions.setState({ sessions, external })
  useStreamer.setState({ curtain: m.curtain === true })
  useScreen.setState({ terms: Array.isArray(m.terms) ? m.terms.filter((x): x is string => typeof x === 'string') : [] })
}

/** was hier nicht hingehört, macht das Hauptfenster; eigene Fenster bleiben hier */
function relay(a: ScreenAction): boolean {
  if ((a.kind === 'open' || a.kind === 'focus') && (onScreen(a.id) || useUi.getState().open.includes(a.id))) return false
  api.screen.relay(a)
  return true
}

let wired = false
export async function wireSecond(): Promise<void> {
  if (wired) return
  wired = true
  setScreenRelay(relay)
  setScreenMover((id, to) => api.screen.move(id, to, previewUrl(id)))
  wireSettingsSync()
  await useSettings.getState().load()
  // Schwärzen im Streamer-Modus braucht den Benutzernamen
  void api.streamer.user().then((user) => useStreamer.setState({ user }))
  wireStats()
  void api.budget.all().then((list) => useBudget.setState({ list }))
  api.on.budgetUsage((list) => useBudget.setState({ list }))
  api.on.screenState(apply)
  api.on.screenMirror(mirror)
  api.on.screenFocus((id) => useUi.getState().focus(id))
  apply(await api.screen.state())
  // Fenster mit dem X geschlossen → drüben gibt es sie nicht mehr
  useUi.subscribe((s, p) => {
    if (quiet || s.open === p.open) return
    for (const it of useScreen.getState().items) if (p.open.includes(it.id) && !s.open.includes(it.id)) api.screen.move(it.id, 'closed')
  })
  api.screen.ready()
  // kommt der Stand aus dem Hauptfenster nicht, trotzdem live mitlaufen
  setTimeout(startFlow, 4000)
}
