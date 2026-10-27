// Zweiter Bildschirm (Beta), Seite des Hauptfensters: Fenster ausblenden, die drüben sind, zurückgekommene öffnen, Aufträge von drüben ausführen.
import { api } from '../api'
import { hideInMain, isPreviewItem, type MoveTarget, type ScreenAction, type ScreenItem, type ScreenMirror, type ScreenState } from '../../../shared/secondScreen'
import { addonEvent } from '../addons/appEvents'
import { panelDef } from '../windows/panels'
import { showWrapped } from '../wrapped/VibeWrapped'
import { EDITOR_ID, openEditor, openInEditor } from './editorStore'
import { askClaudeFromPreview, usePreview } from './previewStore'
import { setScreenRelay } from './screenRelay'
import { onScreen, setScreenMover, useScreen } from './screenStore'
import { promptProject } from './sessionPrompt'
import { useSessions } from './sessionStore'
import { wireSettingsSync } from './settingsStore'
import { useStats } from './statsStore'
import { toggleCurtain, useStreamer } from './streamerStore'
import { centeredRect, useUi } from './uiStore'
import { useWorkflow } from './workflowStore'

const previewKey = (id: string): string => id.slice('preview:'.length)
export const previewUrl = (id: string): string | undefined => (isPreviewItem(id) ? usePreview.getState().open[previewKey(id)] : undefined)

let moved = 0
/** Vorschau wandert mit eigener ID hinüber – so kann eine neue Vorschau hier nie mit einer drüben verwechselt werden */
function move(id: string, to: MoveTarget): void {
  if (to !== 'second' || !isPreviewItem(id)) return api.screen.move(id, to, previewUrl(id))
  api.screen.move(`preview:m${(++moved).toString(36)}${Date.now().toString(36)}`, 'second', previewUrl(id) ?? '')
  usePreview.getState().closePreview(previewKey(id))
}

/** hier zumachen, ohne Rückfrage – das Fenster lebt drüben weiter */
function hideHere(id: string): void {
  if (isPreviewItem(id)) {
    if (usePreview.getState().open[previewKey(id)] !== undefined) usePreview.getState().closePreview(previewKey(id))
  } else if (useUi.getState().open.includes(id)) useUi.getState().closeWin(id)
}

function bringBack(it: ScreenItem): void {
  if (isPreviewItem(it.id)) return usePreview.getState().openPreview(it.url ?? '')
  const def = panelDef(it.id)
  if (def) useUi.getState().openWin(it.id, centeredRect(def.w, def.h))
}

function apply(s: ScreenState): void {
  const prev = useScreen.getState()
  const same = prev.available === s.available && prev.open === s.open && JSON.stringify(prev.items) === JSON.stringify(s.items)
  if (same && !s.returned?.length) return
  useScreen.setState({ available: s.available, open: s.open, items: s.items })
  for (const id of hideInMain(prev.items, s.items)) hideHere(id)
  for (const it of s.returned ?? []) bringBack(it)
  if (s.open && !prev.open) push(true)
}

/** Stand fürs Zweitfenster; voll = mit Ablauf und Stats (einmalig, wenn es aufgeht) */
function push(full: boolean): void {
  if (!useScreen.getState().open) return
  const s = useSessions.getState()
  const m: ScreenMirror = {
    sessions: s.sessions,
    external: s.external,
    curtain: useStreamer.getState().curtain,
    terms: useUi.getState().open.filter((id) => id.startsWith('term:'))
  }
  if (full) {
    const w = useWorkflow.getState()
    m.workflow = { sessions: w.sessions, nextFeedId: w.nextFeedId }
    m.stats = useStats.getState().sessions
  }
  api.screen.mirror(m)
}

let timer: ReturnType<typeof setTimeout> | undefined
function schedule(): void {
  if (!useScreen.getState().open) return
  clearTimeout(timer)
  timer = setTimeout(() => push(false), 120)
}

function run(a: ScreenAction): void {
  switch (a.kind) {
    case 'prompt':
      void promptProject(a.projectId, a.text)
      break
    case 'addon':
      addonEvent(a.event)
      break
    case 'editor':
      void openInEditor(a.path, a.find, a.line)
      break
    case 'askPreview':
      askClaudeFromPreview(a.url, a.text)
      break
    case 'curtain':
      toggleCurtain(a.on)
      break
    case 'wrapped':
      void showWrapped()
      break
    case 'open': {
      if (a.id === EDITOR_ID) return void openEditor()
      const def = panelDef(a.id)
      if (def) useUi.getState().openWin(a.id, centeredRect(def.w, def.h))
      else useUi.getState().focus(a.id)
      break
    }
    case 'focus':
      useUi.getState().focus(a.id)
      break
  }
}

let ready: Promise<void> | null = null
/** einmalig beim Start; fertig, sobald der erste Stand da ist (dann weiß App, welche Fenster drüben bleiben) */
export function wireScreenMain(): Promise<void> {
  if (ready) return ready
  setScreenMover(move)
  // Fenster, die drüben liegen, werden dort nach vorn geholt statt hier ein zweites Mal geöffnet
  setScreenRelay((a) => {
    if ((a.kind === 'open' || a.kind === 'focus') && onScreen(a.id)) {
      api.screen.focus(a.id)
      return true
    }
    return false
  })
  wireSettingsSync()
  api.on.screenState(apply)
  api.on.screenAction(run)
  api.on.screenHello(() => push(true))
  useSessions.subscribe(schedule)
  useStreamer.subscribe((s, p) => s.curtain !== p.curtain && schedule())
  useUi.subscribe((s, p) => s.open !== p.open && schedule())
  ready = api.screen.state().then(apply, () => undefined)
  return ready
}
