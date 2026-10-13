import { create } from 'zustand'
import { api } from '../api'
import type { UpdateStatus } from '../../../shared/types'
import { shouldAutoInstall } from './autoInstall'
import { useEditor } from './editorStore'
import { useSessions } from './sessionStore'

interface UpdateState {
  status: UpdateStatus
  version: string
  dismissed: boolean
  /** Update wird gerade ohne Nachfrage installiert (direkt nach dem Start) */
  autoInstalling: boolean
  dismiss(): void
}

export const useUpdate = create<UpdateState>((set) => ({
  status: { state: 'idle' },
  version: '',
  dismissed: false,
  autoInstalling: false,
  dismiss: () => set({ dismissed: true })
}))

let wired = false
export function wireUpdate(): void {
  if (wired) return
  wired = true
  api.update.version().then((version) => useUpdate.setState({ version }))
  const startedAt = Date.now()
  const onStatus = (status: UpdateStatus): void => {
    useUpdate.setState((s) => ({ status, dismissed: status.state === 'ready' && s.status.state !== 'ready' ? false : s.dismissed }))
    if (status.state !== 'ready' || useUpdate.getState().autoInstalling) return
    const auto = shouldAutoInstall({
      sinceStartMs: Date.now() - startedAt,
      sessions: useSessions.getState().sessions.length,
      dirtyFiles: useEditor.getState().tabs.filter((t) => t.dirty).length
    })
    if (!auto) return
    useUpdate.setState({ autoInstalling: true, dismissed: false })
    // kurz anzeigen, was passiert – dann neu starten
    setTimeout(() => {
      // in den 2,5 s doch eine Session gestartet? Dann lieber fragen
      if (useSessions.getState().sessions.length) useUpdate.setState({ autoInstalling: false })
      else api.update.install()
    }, 2500)
  }
  api.update.status().then(onStatus)
  api.on.update(onStatus)
}
