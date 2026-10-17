// Wächter verdrahten: prüft regelmäßig alle Sessions und meldet Hänger, Fehlerschleifen und vollen Kontext.
import { api } from '../api'
import { notify, retract, type NoticeAction } from './notifyStore'
import { sendToSession } from './sessionPrompt'
import { termWin, useSessions } from './sessionStore'
import { useStats } from './statsStore'
import { useUi } from './uiStore'
import { contextRatio, watchAlerts, WatchMemory, type WatchAlert } from './watchRules'
import { useWorkflow } from './workflowStore'

const TICK_MS = 30_000

const TITLE: Record<WatchAlert['kind'], string> = {
  stuck: 'hängt vermutlich',
  loop: 'steckt in einer Fehlerschleife',
  context: 'hat den Kontext fast voll'
}

const RETHINK =
  'Stopp – du versuchst seit mehreren Anläufen dasselbe und es scheitert jedes Mal. Halte kurz an, erkläre in zwei Sätzen, warum es fehlschlägt, und versuche dann einen anderen Ansatz.'

function actions(id: string, a: WatchAlert): NoticeAction[] {
  const open: NoticeAction = { label: 'Öffnen', run: () => useUi.getState().focus(termWin(id)) }
  // Esc unterbricht Claude Code, ohne die Session zu beenden
  const interrupt = (): void => api.sessions.write(id, '\x1b')
  if (a.kind === 'stuck') return [{ label: 'Unterbrechen', primary: true, run: interrupt }, open]
  if (a.kind === 'loop')
    return [
      {
        label: 'Anders versuchen',
        primary: true,
        run: () => {
          interrupt()
          setTimeout(() => sendToSession(id, RETHINK), 900)
        }
      },
      open
    ]
  return [{ label: 'Zusammenfassen (/compact)', primary: true, run: () => sendToSession(id, '/compact') }, open]
}

const memory = new WatchMemory()

export function checkSessions(now = Date.now()): void {
  const { sessions } = useSessions.getState()
  const flows = useWorkflow.getState().sessions
  const stats = useStats.getState().sessions
  for (const s of sessions) {
    const w = flows[s.id]
    if (!w) continue
    const st = stats[s.id]
    const input = { status: w.status, lastActivity: w.lastActivity, feed: w.feed, now, contextUsed: st?.contextUsed, contextWindow: st?.contextWindow }
    for (const a of memory.fresh(s.id, watchAlerts(input), contextRatio(input))) {
      notify({
        kind: 'watch',
        key: `watch:${a.kind}:${s.id}`,
        title: `${s.name} ${TITLE[a.kind]}`,
        body: a.detail,
        actions: actions(s.id, a),
        onOpen: () => useUi.getState().focus(termWin(s.id))
      })
    }
  }
}

let wired = false
export function wireWatcher(): void {
  if (wired) return
  wired = true
  setInterval(() => checkSessions(), TICK_MS)
  // Fehlerschleife sofort erkennen, nicht erst beim nächsten Takt
  useWorkflow.subscribe((st) => {
    checkSessions()
    // Lebenszeichen → Hänger-Karte ist erledigt
    for (const [id, w] of Object.entries(st.sessions)) if (w.status !== 'working') retract(`watch:stuck:${id}`)
  })
  useSessions.subscribe((st, prev) => {
    for (const s of prev.sessions) if (!st.sessions.some((x) => x.id === s.id)) memory.forget(s.id)
  })
  useStats.subscribe(() => checkSessions())
}
