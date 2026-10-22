// Tray-Symbol: meldet Main den Stand aller Sessions; ein Klick im Tray-Menü holt die Session nach vorn.
import type { TraySession } from '../../../shared/tray'
import { api } from '../api'
import { termWin, useSessions } from './sessionStore'
import { useSettings } from './settingsStore'
import { useUi } from './uiStore'
import { useWorkflow } from './workflowStore'

function build(): TraySession[] {
  const wf = useWorkflow.getState().sessions
  return useSessions.getState().sessions.map((s) => ({ id: s.id, name: s.name, status: wf[s.id]?.status ?? 'idle' }))
}

let last = ''
let timer: ReturnType<typeof setTimeout> | undefined
function schedule(): void {
  if (timer) return
  timer = setTimeout(() => {
    timer = undefined
    const list = build()
    const s = useSettings.getState().s
    // nur bei echten Änderungen – der Workflow-Store ändert sich bei jedem Hook
    const key = JSON.stringify([list, s?.trayOn])
    if (key === last) return
    last = key
    api.tray.sessions(list)
  }, 200)
}

let wired = false
export function wireTray(): void {
  if (wired) return
  wired = true
  useWorkflow.subscribe(schedule)
  useSessions.subscribe(schedule)
  useSettings.subscribe((st, prev) => st.s?.trayOn !== prev.s?.trayOn && schedule())
  api.on.trayFocus((id) => {
    if (useSessions.getState().sessions.some((s) => s.id === id)) useUi.getState().focus(termWin(id))
  })
  schedule()
}
