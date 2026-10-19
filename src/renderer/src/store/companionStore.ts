// Handy-Begleiter: Server an/aus, Live-Stand fürs Handy und Prompts vom Handy in die richtige Session.
import { t } from '../../../shared/i18n'
import { create } from 'zustand'
import { api } from '../api'
import { FEED_SHOWN, internetOn, type CompanionDevice, type CompanionPairing, type CompanionSettings, type CompanionSnapshot, type CompanionStatus, type PromptTarget } from '../../../shared/companion'
import type { Project } from '../../../shared/types'
import { inform, useNotify } from './notifyStore'
import { promptProject, sendToSession } from './sessionPrompt'
import { useSessions } from './sessionStore'
import { useSettings } from './settingsStore'
import { useWorkflow } from './workflowStore'
import { readTerminal } from './companionTerm'
import { getTerminal } from './terminals'

interface CompanionUi {
  status: CompanionStatus
  busy: boolean
  devices: CompanionDevice[]
  /** sichtbarer Einmal-Code zum Koppeln */
  pairing: CompanionPairing | null
}

export const useCompanion = create<CompanionUi>(() => ({ status: { running: false }, busy: false, devices: [], pairing: null }))

const cfg = (): CompanionSettings | undefined => useSettings.getState().s?.companion
const on = (): boolean => !!cfg()?.enabled

let projects: Project[] = []

export function buildSnapshot(): CompanionSnapshot {
  const wf = useWorkflow.getState().sessions
  return {
    sessions: useSessions.getState().sessions.map((s) => {
      const w = wf[s.id]
      const pending = [...(w?.feed ?? [])].reverse().find((f) => f.result === 'pending')
      const todos = w?.todos ?? []
      return {
        id: s.id,
        projectId: s.projectId,
        name: s.name,
        status: w?.status ?? 'idle',
        current: pending ? `${pending.tool}${pending.target ? ' · ' + pending.target : ''}`.slice(0, 160) : '',
        todos: {
          done: todos.filter((t) => t.status === 'completed').length,
          total: todos.length,
          active: (todos.find((t) => t.status === 'in_progress')?.content ?? '').slice(0, 160)
        },
        lastActivity: w?.lastActivity ?? 0,
        feed: (w?.feed ?? []).slice(-FEED_SHOWN).map((f) => ({ tool: f.tool, target: f.target.slice(0, 240), result: f.result, ts: f.ts }))
      }
    }),
    terminal: cfg()?.terminal === true,
    projects: projects.filter((p) => !p.missing).map((p) => ({ id: p.id, name: p.name })),
    notices: useNotify
      .getState()
      .log.filter((n) => n.kind !== 'info')
      .slice(0, 12)
      .map((n) => ({ title: n.title, body: n.body ?? '', kind: n.kind, time: n.time }))
  }
}

let pushTimer: ReturnType<typeof setTimeout> | undefined
function schedulePush(): void {
  if (!on() || pushTimer) return
  pushTimer = setTimeout(() => {
    pushTimer = undefined
    if (on()) api.companion.push(buildSnapshot())
  }, 250)
}

async function loadProjects(): Promise<void> {
  projects = await api.projects.list()
  schedulePush()
}

async function runPrompt(reqId: string, target: PromptTarget, text: string): Promise<void> {
  let ok = false
  try {
    if ('sessionId' in target) {
      ok = useSessions.getState().sessions.some((s) => s.id === target.sessionId)
      if (ok) sendToSession(target.sessionId, text, false)
    } else {
      ok = await promptProject(target.projectId, text)
    }
  } catch {
    ok = false
  }
  api.companion.promptDone(reqId, ok)
  if (ok) inform(t('Vom Handy an Claude'), text.length > 140 ? text.slice(0, 139) + '…' : text)
}

let pairTimer: ReturnType<typeof setTimeout> | undefined
export async function startPairing(): Promise<void> {
  const p = await api.companion.startPairing()
  useCompanion.setState({ pairing: p })
  clearTimeout(pairTimer)
  pairTimer = setTimeout(() => useCompanion.setState({ pairing: null }), Math.max(0, p.expiresAt - Date.now()))
}

export function cancelPairing(): void {
  clearTimeout(pairTimer)
  useCompanion.setState({ pairing: null })
  api.companion.cancelPairing()
}

export const revokeDevice = (id: string): Promise<void> => api.companion.revoke(id)
export const revokeAllDevices = (): Promise<void> => api.companion.revokeAll()

let wired = false
let lastKey = ''
export function wireCompanion(): void {
  if (wired) return
  wired = true

  const sync = async (): Promise<void> => {
    const c = cfg()
    if (!c) return
    const key = `${c.enabled}|${c.port}|${internetOn(c)}`
    if (key === lastKey) return
    lastKey = key
    useCompanion.setState({ busy: true })
    try {
      useCompanion.setState({ status: await api.companion.configure(c.enabled, c.port, internetOn(c)) })
    } finally {
      useCompanion.setState({ busy: false })
    }
    if (c.enabled) void loadProjects()
  }
  useSettings.subscribe((st, prev) => {
    void sync()
    // Terminal am Handy an/aus → Handys sofort Bescheid geben
    if (st.s?.companion?.terminal !== prev.s?.companion?.terminal || st.s?.companion?.terminalKeys !== prev.s?.companion?.terminalKeys) schedulePush()
  })
  void sync()

  useWorkflow.subscribe(schedulePush)
  useSessions.subscribe(() => {
    schedulePush()
    if (on()) void loadProjects()
  })
  useNotify.subscribe((s, p) => s.log !== p.log && schedulePush())
  // Projekte können auch woanders angelegt werden
  setInterval(() => on() && void loadProjects(), 60_000)

  api.on.companionPrompt((reqId, target, text) => void runPrompt(reqId, target, text))
  // Terminal-Zeilen fürs Handy – nur, solange es am PC erlaubt ist (Main prüft das zusätzlich)
  api.on.companionTerm((reqId, q) => {
    if (cfg()?.terminal !== true) return api.companion.termDone(reqId, null)
    void readTerminal(getTerminal(q.sessionId)?.term, q.sessionId, q).then(
      (c) => api.companion.termDone(reqId, c),
      () => api.companion.termDone(reqId, null)
    )
  })

  void api.companion.devices().then((devices) => useCompanion.setState({ devices }))
  api.on.companionDevices((devices, paired) => {
    useCompanion.setState({ devices })
    if (paired) {
      clearTimeout(pairTimer)
      useCompanion.setState({ pairing: null })
      inform(t('Handy gekoppelt'), t('„{name}“ kann jetzt Freigaben geben und Claude Aufträge schicken.', { name: paired.name }))
    }
  })
  api.on.companionStatus((status) => on() && useCompanion.setState({ status }))
  api.on.companionPower((action, at) => {
    if (action === 'shutdown' && at) {
      const s = Math.max(1, Math.round((at - Date.now()) / 1000))
      inform(t('PC fährt herunter'), t('Vom Handy ausgelöst – in {s} Sekunden. Laufende Sessions werden beendet.', { s }), [
        { label: t('Abbrechen'), primary: true, run: () => void api.companion.cancelShutdown() }
      ])
    } else if (action === 'cancel') inform(t('Ausschalten abgebrochen'))
    else if (action === 'sleep') inform(t('PC geht in den Standby'), t('Vom Handy ausgelöst.'))
  })
}
