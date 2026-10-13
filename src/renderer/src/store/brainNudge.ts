// Sanfter Anstoß: Hat eine Session viel geändert, aber nichts ins Gehirn geschrieben, gibt's eine Karte „Gehirn pflegen“.
import { api } from '../api'
import type { SessionStatus } from '../../../shared/types'
import { inform } from './notifyStore'
import { shouldNudge } from './notifyRules'
import { promptProject } from './sessionPrompt'
import { useSessions } from './sessionStore'
import { useSettings } from './settingsStore'
import { useWorkflow } from './workflowStore'

let wired = false
export function wireBrainNudge(tend: string): void {
  if (wired) return
  wired = true
  const edited = new Map<string, Set<string>>()
  const learned = new Map<string, number>()
  const last = new Map<string, number>()
  const prev: Record<string, SessionStatus> = {}

  api.on.brainPulse((p) => {
    if (p.kind === 'write') learned.set(p.projectId, (learned.get(p.projectId) ?? 0) + 1)
    else if (p.kind === 'edit') {
      if (!edited.has(p.projectId)) edited.set(p.projectId, new Set())
      edited.get(p.projectId)!.add(p.id)
    }
  })

  useWorkflow.subscribe((st) => {
    for (const [id, w] of Object.entries(st.sessions)) {
      const before = prev[id]
      prev[id] = w.status
      if (before === w.status || w.status !== 'done') continue
      const s = useSessions.getState().sessions.find((x) => x.id === id)
      if (!s || !useSettings.getState().s?.brainOn) continue
      const pid = s.projectId
      const n = edited.get(pid)?.size ?? 0
      const now = Date.now()
      if (shouldNudge(n, learned.get(pid) ?? 0, last.get(pid), now)) {
        last.set(pid, now)
        inform(`${s.name}: ${n} Dateien geändert`, 'Soll Claude festhalten, was es dabei gelernt hat?', [
          { label: 'Gehirn pflegen', primary: true, run: () => void promptProject(pid, tend) }
        ])
      }
      // neue Runde zählen
      edited.delete(pid)
      learned.delete(pid)
    }
  })
}
