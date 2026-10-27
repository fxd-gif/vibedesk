// Fenster pro Projekt merken: Werkzeug-Fenster je Projekt ablegen und beim Projektwechsel sanft zurückholen – Terminals bleiben, wo sie sind.
import { api } from '../api'
import type { Settings, Workspace } from '../../../shared/types'
import { forgetWorkspace, planRestore, saveWorkspace, switchStep, workspaceOf, workspaceSnapshot } from '../../../shared/workspaces'
import { t } from '../../../shared/i18n'
import { restoreRects } from '../desktop/layout'
import { PANEL_IDS, panelDef } from '../windows/panels'
import { activeProjectId } from './activeProject'
import { inform } from './notifyStore'
import { useSessions } from './sessionStore'
import { useSettings } from './settingsStore'
import { centeredRect, DOCK_H, useUi } from './uiStore'

/** so lange muss ein Projekt vorne bleiben, bevor umgeräumt wird – Durchklicken flackert nicht */
const SETTLE_MS = 700
/** Maus gedrückt (Fenster wird gezogen): so lange warten und nochmal schauen */
const RETRY_MS = 400
/** gerade erst geöffnete Fenster bleiben offen */
const FRESH_MS = 2500
/** so lange gleiten die Fenster an ihren Platz */
const GLIDE_MS = 320

let cache: Record<string, Workspace> = {}
/** Projekt, dessen Anordnung gerade zu sehen ist */
let shown: string | null = null
/** Projekt, für das die Beruhigung gerade läuft */
let pending: string | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let lastKey: string | null = null
let pointerDown = false
let wired = false

const tools = (): string[] => {
  const off: string[] = useSettings.getState().s?.modulesOff ?? []
  return PANEL_IDS.filter((id) => !off.includes(id))
}

const snapshot = (): ReturnType<typeof workspaceSnapshot> => {
  const ui = useUi.getState()
  return workspaceSnapshot(ui.open, ui.rects, tools())
}

const currentProject = (): string | null => activeProjectId([])

function persist(): void {
  api.settings.set({ workspaces: cache })
}

/** kurz weiche Übergänge an den Fenstern, damit nichts springt */
function glide(): void {
  const el = document.documentElement
  el.dataset.wsGlide = '1'
  setTimeout(() => delete el.dataset.wsGlide, GLIDE_MS + 80)
}

function restore(projectId: string): void {
  const ws = workspaceOf(cache, projectId)
  if (!ws) return
  const ui = useUi.getState()
  const screen = { w: window.innerWidth, h: window.innerHeight }
  const plan = planRestore(
    { ...ws, rects: restoreRects(ws.rects, screen, DOCK_H) },
    { open: ui.open, rects: ui.rects, tools: tools(), used: ui.used, now: Date.now(), freshMs: FRESH_MS }
  )
  if (!plan) return
  const top = ui.open[ui.open.length - 1]
  glide()
  // erst die Plätze, dann schließen, dann öffnen – das Fenster, das vorne war (meist das Terminal), bleibt vorne
  useUi.setState((s) => ({ rects: { ...s.rects, ...plan.rects } }))
  for (const id of plan.close) useUi.getState().closeWin(id)
  for (const id of plan.open) {
    const def = panelDef(id)
    if (def) useUi.getState().openWin(id, centeredRect(def.w, def.h))
  }
  if (top && plan.open.length && useUi.getState().open.includes(top)) useUi.getState().focus(top)
}

function settle(): void {
  const s = useSettings.getState().s
  const current = currentProject()
  const step = switchStep({ shown, current, on: s?.workspacesOn !== false, desktop: s?.layout !== 'studio', zen: !!useUi.getState().zen, dragging: pointerDown })
  if (step === 'wait') {
    timer = setTimeout(settle, RETRY_MS)
    return
  }
  pending = null
  if (step === 'nothing' || step === 'later') return
  shown = current
  if (step === 'restore' && current) restore(current)
  lastKey = JSON.stringify(snapshot())
}

/** bei jeder Änderung an Fenstern, Sessions oder Einstellungen: hat sich das Projekt geändert? */
function check(): void {
  const pid = currentProject()
  if (pid === pending) return
  pending = pid
  clearTimeout(timer)
  if (!pid || pid === shown) return
  timer = setTimeout(settle, SETTLE_MS)
}

/** Aus der (entprellten) Fenster-Speicherung: Anordnung unter dem Projekt ablegen, das gerade zu sehen ist */
export function rememberLayout(): void {
  const s = useSettings.getState().s
  if (!s || s.workspacesOn === false || s.layout === 'studio' || useUi.getState().zen || !shown) return
  const snap = snapshot()
  const key = JSON.stringify(snap)
  // nur echte Änderungen (Fenster bewegt, geöffnet, geschlossen) – bloßes Fokussieren eines Terminals nicht
  if (key === lastKey) return
  lastKey = key
  cache = saveWorkspace(cache, shown, snap, Date.now())
  persist()
}

/** Befehlspalette: gemerkte Anordnung des aktuellen Projekts vergessen */
export function forgetCurrentWorkspace(): void {
  const pid = shown ?? currentProject()
  if (!pid || !workspaceOf(cache, pid)) {
    inform(t('Für dieses Projekt ist nichts gemerkt'))
    return
  }
  cache = forgetWorkspace(cache, pid)
  // erst wieder merken, wenn du etwas an den Fenstern änderst
  lastKey = JSON.stringify(snapshot())
  persist()
  inform(t('Anordnung vergessen'), t('Beim nächsten Wechsel in dieses Projekt bleiben die Fenster, wie sie sind.'))
}

export function wireWorkspaces(s: Settings): void {
  if (wired) return
  wired = true
  cache = s.workspaces && typeof s.workspaces === 'object' ? s.workspaces : {}
  // läuft gerade eine Ziehaktion? Dann nichts umräumen
  window.addEventListener('pointerdown', () => (pointerDown = true), { capture: true, passive: true })
  for (const ev of ['pointerup', 'pointercancel'] as const) window.addEventListener(ev, () => (pointerDown = false), { capture: true, passive: true })
  window.addEventListener('blur', () => (pointerDown = false))
  useUi.subscribe(check)
  useSessions.subscribe(check)
  useSettings.subscribe(check)
  check()
}
