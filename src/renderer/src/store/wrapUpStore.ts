// Session-Abschluss: merkt sich pro Session die laufende Runde (geänderte Dateien, Zusammenfassung)
// und welche Session gerade im Abschluss-Dialog offen ist.
import { create } from 'zustand'
import { ME_ID } from '../../../shared/brain'
import { applyWrapEvent, type WrapTurn } from '../../../shared/wrapUp'
import { api } from '../api'
import { useSessions } from './sessionStore'

interface WrapUpState {
  turns: Record<string, WrapTurn>
  /** Gehirn-Notizen, die seit dem letzten Prompt im Projekt geschrieben wurden (nach Projekt) */
  notes: Record<string, string[]>
  /** Session im Abschluss-Dialog */
  open: string | null
}

export const useWrapUp = create<WrapUpState>(() => ({ turns: {}, notes: {}, open: null }))

/** Runde mit Änderungen ist fertig – dann lohnt sich ein Abschluss */
export const canWrapUp = (turn: WrapTurn | undefined): boolean => !!turn?.ended && turn.files.length > 0

export function openWrapUp(sessionId: string): void {
  useWrapUp.setState({ open: sessionId })
}

export function closeWrapUp(): void {
  useWrapUp.setState({ open: null })
}

/** Nach dem Commit: die Runde ist abgeschlossen, Knopf und Hinweis verschwinden */
export function finishWrapUp(sessionId: string): void {
  useWrapUp.setState((s) => {
    const turns = { ...s.turns }
    delete turns[sessionId]
    return { turns, open: s.open === sessionId ? null : s.open }
  })
}

const projectOf = (sessionId: string): string | undefined => useSessions.getState().sessions.find((s) => s.id === sessionId)?.projectId

let wired = false
export function wireWrapUp(): void {
  if (wired) return
  wired = true
  api.on.hookEvent((e) => {
    const before = useWrapUp.getState().turns[e.sessionId]
    const next = applyWrapEvent(before, e)
    if (next === before) return
    useWrapUp.setState((s) => {
      const turns = { ...s.turns }
      if (next) turns[e.sessionId] = next
      else delete turns[e.sessionId]
      // neuer Prompt: die Gehirn-Notizen des Projekts gehören ab jetzt zur neuen Runde
      const pid = e.name === 'UserPromptSubmit' ? projectOf(e.sessionId) : undefined
      return pid ? { turns, notes: { ...s.notes, [pid]: [] } } : { turns }
    })
    // Zusammenfassung beim ersten Ende der Runde holen – nach der Gehirn-Pflege wäre sie nur „Gehirn ist aktuell.“
    if (next?.ended && !next.summary && next.transcript && next.files.length && !before?.ended) {
      const transcript = next.transcript
      void api.wrapUp.summary(transcript).then((summary) => {
        if (!summary) return
        useWrapUp.setState((s) => {
          const cur = s.turns[e.sessionId]
          return cur && cur.transcript === transcript && !cur.summary ? { turns: { ...s.turns, [e.sessionId]: { ...cur, summary } } } : s
        })
      })
    }
  })
  api.on.brainPulse((p) => {
    if (p.kind !== 'write' || !p.title || p.projectId === ME_ID) return
    useWrapUp.setState((s) => {
      const list = s.notes[p.projectId] ?? []
      return list.includes(p.title!) ? s : { notes: { ...s.notes, [p.projectId]: [...list, p.title!] } }
    })
  })
  api.on.sessionExit((id) => finishWrapUp(id))
}
