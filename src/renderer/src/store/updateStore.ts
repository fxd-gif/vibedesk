import { create } from 'zustand'
import { api } from '../api'
import type { UpdateStatus } from '../../../shared/types'

interface UpdateState {
  status: UpdateStatus
  version: string
  dismissed: boolean
  dismiss(): void
}

export const useUpdate = create<UpdateState>((set) => ({
  status: { state: 'idle' },
  version: '',
  dismissed: false,
  dismiss: () => set({ dismissed: true })
}))

let wired = false
export function wireUpdate(): void {
  if (wired) return
  wired = true
  api.update.version().then((version) => useUpdate.setState({ version }))
  api.update.status().then((status) => useUpdate.setState({ status }))
  api.on.update((status) => useUpdate.setState((s) => ({ status, dismissed: status.state === 'ready' && s.status.state !== 'ready' ? false : s.dismissed })))
}
