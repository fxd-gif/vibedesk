import { create } from 'zustand'
import { FlowMaker } from './flow/FlowMaker'
import { ManagerView } from './ManagerView'
import './addons.css'

type Tab = 'manager' | 'maker'

interface AddonUi {
  tab: Tab
  /** Addon, das im Maker bearbeitet wird (null = neues Addon) */
  editId: string | null
  /** erhöht sich bei jedem „Neu“/„Bearbeiten“, damit der Maker frisch lädt */
  session: number
  showManager(): void
  edit(id: string | null): void
}

export const useAddonUi = create<AddonUi>((set) => ({
  tab: 'manager',
  editId: null,
  session: 0,
  showManager: () => set({ tab: 'manager' }),
  edit: (editId) => set((s) => ({ tab: 'maker', editId, session: s.session + 1 }))
}))

export function AddonWindow(): React.JSX.Element {
  const { tab, editId, session } = useAddonUi()
  return (
    <div className="panel addons-win">
      {tab === 'manager' ? <ManagerView /> : <FlowMaker key={session} editId={editId} onBack={() => useAddonUi.getState().showManager()} />}
    </div>
  )
}
