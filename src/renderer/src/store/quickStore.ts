// Schnell-Prompt (Strg+Alt+Leertaste): Sessions zur Auswahl melden und eingehende Aufträge zustellen.
import { t } from '../../../shared/i18n'
import { api } from '../api'
import { activeProjectId } from './activeProject'
import { inform } from './notifyStore'
import { enqueue } from './queueStore'
import { promptProject, sendToSession } from './sessionPrompt'
import { termWin, useSessions } from './sessionStore'
import { useSettings } from './settingsStore'
import { useUi } from './uiStore'
import { useWorkflow } from './workflowStore'
import { orderedTargets } from './quickTargets'

const statusOf = (id: string): string => useWorkflow.getState().sessions[id]?.status ?? 'idle'

async function deliver(text: string, sessionId: string | null): Promise<void> {
  const s = sessionId ? useSessions.getState().sessions.find((x) => x.id === sessionId) : undefined
  if (s) {
    const st = statusOf(s.id)
    if (st === 'working' || st === 'waiting') {
      enqueue(s.id, text)
      inform(t('{name}: vorgemerkt', { name: s.name }), t('Claude arbeitet noch – der Auftrag geht danach los.'))
    } else {
      sendToSession(s.id, text, false)
      inform(t('An {name} geschickt', { name: s.name }), text.length > 90 ? text.slice(0, 90) + ' …' : text)
    }
    return
  }
  // keine Session offen → im zuletzt genutzten Projekt starten
  const pid = activeProjectId(await api.projects.list())
  if (!pid || !(await promptProject(pid, text))) inform(t('Schnell-Prompt: kein Projekt gefunden'), t('Leg zuerst ein Projekt an.'))
}

let wired = false
let lastKey = ''
export function wireQuick(): void {
  if (wired) return
  wired = true
  const push = (): void => {
    const list = orderedTargets(useSessions.getState().sessions, useUi.getState().open, termWin, statusOf)
    const key = JSON.stringify(list)
    if (key === lastKey) return
    lastKey = key
    api.quick.targets(list)
  }
  useSessions.subscribe(push)
  useUi.subscribe(push)
  useWorkflow.subscribe(push)
  push()

  let enabled: boolean | undefined
  const sync = (): void => {
    const on = useSettings.getState().s?.quickPrompt
    if (on === undefined || on === enabled) return
    enabled = on
    void api.quick.configure(on).then((ok) => {
      if (on && !ok) inform(t('Strg+Alt+Leertaste ist schon belegt'), t('Eine andere App nutzt das Kürzel – der Schnell-Prompt ist darum aus.'))
    })
  }
  useSettings.subscribe(sync)
  sync()

  api.on.quickPrompt((text, id) => void deliver(text, id))
}
