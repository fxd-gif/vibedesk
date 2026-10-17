// Benachrichtigungszentrale: Verlauf, Karten unten rechts und Windows-Benachrichtigungen an einem Ort.
import { create } from 'zustand'
import { api } from '../api'
import type { NoticeKind, SessionStatus } from '../../../shared/types'
import { heldSummary, pushLog, route } from './notifyRules'
import { useFocus } from './focusStore'
import { termWin, useSessions } from './sessionStore'
import { useSettings } from './settingsStore'
import { useUi } from './uiStore'
import { useWorkflow } from './workflowStore'

export interface NoticeAction {
  label: string
  primary?: boolean
  run(): void
}

export interface Notice {
  id: number
  /** 'info' = interne Hinweise (z. B. Fokus-Zusammenfassung), gehen nur als Karte raus */
  kind: NoticeKind | 'info'
  title: string
  body?: string
  time: number
  /** gleicher key ersetzt die ältere Mitteilung */
  key?: string
  actions?: NoticeAction[]
  /** Klick auf die Mitteilung selbst */
  onOpen?(): void
}

interface NotifyState {
  log: Notice[]
  /** sichtbare Karten, neueste vorn */
  toasts: Notice[]
  unread: number
  panel: boolean
  /** in der laufenden Fokus-Runde zurückgehaltene Mitteilungen */
  held: number
}

export const useNotify = create<NotifyState>(() => ({ log: [], toasts: [], unread: 0, panel: false, held: 0 }))

const MAX_TOASTS = 3
/** wichtige Karten bleiben, bis sie erledigt sind – der Rest verschwindet von selbst */
const TOAST_MS: Record<Notice['kind'], number> = { waiting: 0, error: 0, done: 8000, info: 10_000 }

let seq = 0

type NoticeInput = Omit<Notice, 'id' | 'time'>

function showToast(n: Notice): void {
  useNotify.setState((s) => ({ toasts: [n, ...s.toasts.filter((t) => !(n.key && t.key === n.key))].slice(0, MAX_TOASTS) }))
  const ms = TOAST_MS[n.kind]
  if (ms) setTimeout(() => dismiss(n.id), ms)
}

/** Meldet etwas. `visible`: das Betroffene ist gerade ohnehin im Blick. */
export function notify(input: NoticeInput & { kind: NoticeKind }, visible = false): void {
  const s = useSettings.getState().s
  if (!s) return
  const r = route(input.kind, s.notify, {
    appFocused: document.hasFocus(),
    inFocus: useFocus.getState().state.phase === 'work',
    visible
  })
  if (!r.log) return
  const n: Notice = { ...input, id: ++seq, time: Date.now() }
  useNotify.setState((st) => ({
    log: pushLog(st.log, n),
    unread: st.panel ? st.unread : st.unread + 1,
    held: st.held + (r.held ? 1 : 0)
  }))
  if (r.toast) showToast(n)
  // im Stream wäre eine Windows-Benachrichtigung mit Projektnamen sichtbar
  if (r.os) api.app.notify(n.id, s.streamer.enabled ? 'VibeDesk' : n.title, s.streamer.enabled ? 'Neue Mitteilung' : n.body ?? '')
}

/** Karte ohne Verlauf – für Hinweise von VibeDesk selbst */
export function inform(title: string, body?: string, actions?: NoticeAction[], key?: string): void {
  showToast({ id: ++seq, kind: 'info', title, body, actions, key, time: Date.now() })
}

export function dismiss(id: number): void {
  useNotify.setState((s) => (s.toasts.some((t) => t.id === id) ? { toasts: s.toasts.filter((t) => t.id !== id) } : s))
}

/** Erledigt (z. B. Session wartet nicht mehr): Karte weg, Verlauf bleibt */
export function retract(key: string): void {
  useNotify.setState((s) => (s.toasts.some((t) => t.key === key) ? { toasts: s.toasts.filter((t) => t.key !== key) } : s))
}

export function openNotice(n: Notice): void {
  dismiss(n.id)
  useNotify.setState({ panel: false })
  n.onOpen?.()
}

export function setPanel(open: boolean): void {
  useNotify.setState(open ? { panel: true, unread: 0 } : { panel: false })
}

export function clearLog(): void {
  useNotify.setState({ log: [], unread: 0 })
}

// ---------- Quellen ----------

const sessionName = (id: string): string | undefined => useSessions.getState().sessions.find((s) => s.id === id)?.name

function showSession(id: string): void {
  const ui = useUi.getState()
  ui.focus(termWin(id))
}

function sessionOnTop(id: string): boolean {
  const ui = useUi.getState()
  const win = termWin(id)
  return ui.open[ui.open.length - 1] === win && !ui.minimized.includes(win)
}

function onStatus(id: string, before: SessionStatus | undefined, now: SessionStatus): void {
  if (before === 'waiting') retract(`waiting:${id}`)
  const name = sessionName(id)
  if (!name) return
  const open: NoticeAction = { label: 'Öffnen', primary: true, run: () => showSession(id) }
  if (now === 'waiting') {
    notify(
      { kind: 'waiting', key: `waiting:${id}`, title: `${name} wartet auf dich`, body: 'Claude braucht eine Antwort oder Freigabe.', actions: [open], onOpen: () => showSession(id) },
      sessionOnTop(id)
    )
  } else if (now === 'done' && before === 'working') {
    notify({ kind: 'done', key: `done:${id}`, title: `${name} ist fertig`, body: 'Claude hat die Aufgabe abgeschlossen.', actions: [open], onOpen: () => showSession(id) }, sessionOnTop(id))
  } else if (now === 'error') {
    // beim bewussten Schließen verschwindet die Session gleich – dann nichts melden
    setTimeout(() => {
      if (!sessionName(id)) return
      notify({
        kind: 'error',
        key: `error:${id}`,
        title: `${name} wurde unerwartet beendet`,
        body: 'Der Claude-Prozess hat sich mit einem Fehler verabschiedet.',
        actions: [{ label: 'Neu starten', primary: true, run: () => void useSessions.getState().restart(id) }, open],
        onOpen: () => showSession(id)
      })
    }, 400)
  }
}

let wired = false
export function wireNotify(): void {
  if (wired) return
  wired = true
  const prev: Record<string, SessionStatus> = {}
  useWorkflow.subscribe((st) => {
    for (const [id, w] of Object.entries(st.sessions)) {
      const before = prev[id]
      prev[id] = w.status
      if (before !== w.status) onStatus(id, before, w.status)
    }
    for (const id of Object.keys(prev)) {
      if (st.sessions[id]) continue
      delete prev[id]
      retract(`waiting:${id}`)
    }
  })

  // nach der Fokus-Runde gesammelt nachreichen
  useFocus.subscribe((s, p) => {
    if (p.state.phase !== 'work' || s.state.phase === 'work') return
    const { held } = useNotify.getState()
    if (!held) return
    useNotify.setState({ held: 0 })
    inform(heldSummary(held), undefined, [{ label: 'Ansehen', primary: true, run: () => setPanel(true) }])
  })

  api.on.notifyClick((id) => {
    const n = useNotify.getState().log.find((x) => x.id === id)
    if (n) openNotice(n)
  })
}
