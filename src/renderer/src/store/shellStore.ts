// Eigene Shell-Terminals (PowerShell/cmd): als eigenes Fenster oder geteilt im Claude-Fenster einer Session.
import { t } from '../../../shared/i18n'
import { create } from 'zustand'
import { api, errorText } from '../api'
import type { ShellInfo } from '../../../shared/types'
import { alert } from './dialogStore'
import { kindOf, shellWin } from './sessionStore'
import { createTerminal, disposeTerminal } from './terminals'
import { useUi } from './uiStore'

interface ShellStore {
  shells: ShellInfo[]
  exited: Record<string, number>
  /** attachedTo = Session, in deren Fenster die Shell als zweite Hälfte erscheint */
  open(projectId: string, attachedTo?: string): Promise<ShellInfo | null>
  close(id: string): Promise<void>
  restart(id: string): Promise<void>
}

export const useShells = create<ShellStore>((set, get) => ({
  shells: [],
  exited: {},
  open: async (projectId, attachedTo) => {
    try {
      const info = await api.shells.start(projectId, attachedTo)
      createTerminal(info.id, { kind: 'shell', cwd: info.cwd })
      set((s) => ({ shells: [...s.shells, info] }))
      if (!attachedTo) {
        const ui = useUi.getState()
        ui.openWin(shellWin(info.id))
        ui.arrangeAll(kindOf)
      }
      return info
    } catch (err) {
      await alert(t('Shell konnte nicht gestartet werden'), errorText(err))
      return null
    }
  },
  close: async (id) => {
    await api.shells.stop(id)
    disposeTerminal(id)
    useUi.getState().closeWin(shellWin(id))
    set((s) => {
      const { [id]: _x, ...exited } = s.exited
      return { shells: s.shells.filter((x) => x.id !== id), exited }
    })
  },
  restart: async (id) => {
    const old = get().shells.find((s) => s.id === id)
    if (!old) return
    await get().close(id)
    await get().open(old.projectId, old.attachedTo)
  }
}))

/** Die geteilte Shell im Fenster einer Claude-Session (falls offen) */
export const attachedShell = (shells: ShellInfo[], sessionId: string): ShellInfo | undefined => shells.find((s) => s.attachedTo === sessionId)

let wired = false
export function wireShells(): void {
  if (wired) return
  wired = true
  api.on.shellExit((id, code) => useShells.setState((s) => ({ exited: { ...s.exited, [id]: code } })))
}

/** Nach einem Neuladen des Fensters laufen die Shells in Main weiter (erst nach initRects aufrufen) */
export async function restoreShells(): Promise<void> {
  await api.shells.list().then((list) => {
    if (!list.length) return
    for (const info of list) createTerminal(info.id, { kind: 'shell', cwd: info.cwd })
    useShells.setState({ shells: list })
    const ui = useUi.getState()
    list.filter((s) => !s.attachedTo).forEach((s) => ui.openWin(shellWin(s.id)))
    ui.arrangeAll(kindOf)
  })
}
