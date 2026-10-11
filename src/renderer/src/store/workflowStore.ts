import { create } from 'zustand'
import { api } from '../api'
import { emptyWorkflow, workflowReducer, type WorkflowAction, type WorkflowState } from './workflowReducer'

interface WorkflowStore extends WorkflowState {
  dispatch(a: WorkflowAction): void
}

export const useWorkflow = create<WorkflowStore>((set) => ({
  ...emptyWorkflow(),
  dispatch: (a) => set((s) => workflowReducer(s, a))
}))

let wired = false
/** Verbindet Hook- und Exit-Events aus dem Main-Prozess mit dem Store (einmalig). */
export function wireWorkflow(): void {
  if (wired) return
  wired = true
  const { dispatch } = useWorkflow.getState()
  api.on.hookEvent((event) => dispatch({ type: 'hook', event }))
  api.on.sessionExit((sessionId, code) => dispatch({ type: 'exit', sessionId, code }))
}
