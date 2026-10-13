import { create } from 'zustand'
import { MakerView } from './MakerView'
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
      <div className="row tabs">
        <button className={`tab${tab === 'manager' ? ' on' : ''}`} onClick={() => useAddonUi.getState().showManager()} data-testid="addons-tab-manager">
          Meine Addons
        </button>
        <button className={`tab${tab === 'maker' ? ' on' : ''}`} onClick={() => useAddonUi.setState({ tab: 'maker' })} data-testid="addons-tab-maker">
          Maker
        </button>
      </div>
      <div className="addons-body">{tab === 'manager' ? <ManagerView /> : <MakerView key={session} editId={editId} />}</div>
    </div>
  )
}
