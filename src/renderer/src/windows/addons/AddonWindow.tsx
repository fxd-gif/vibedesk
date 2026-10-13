import { create } from 'zustand'
import { FlowMaker } from './flow/FlowMaker'
import { TemplateGallery } from './flow/TemplateGallery'
import { ManagerView } from './ManagerView'
import './addons.css'

type Tab = 'manager' | 'gallery' | 'maker'

interface AddonUi {
  tab: Tab
  /** Addon, das im Maker bearbeitet wird (null = neues Addon) */
  editId: string | null
  /** Vorlage für ein neues Addon (null = leer) */
  templateId: string | null
  /** erhöht sich bei jedem „Neu“/„Bearbeiten“, damit der Maker frisch lädt */
  session: number
  showManager(): void
  /** „Neues Addon“: erst die Vorlagen-Galerie */
  newAddon(): void
  edit(id: string | null, templateId?: string | null): void
}

export const useAddonUi = create<AddonUi>((set) => ({
  tab: 'manager',
  editId: null,
  templateId: null,
  session: 0,
  showManager: () => set({ tab: 'manager' }),
  newAddon: () => set({ tab: 'gallery' }),
  edit: (editId, templateId = null) => set((s) => ({ tab: 'maker', editId, templateId, session: s.session + 1 }))
}))

export function AddonWindow(): React.JSX.Element {
  const { tab, editId, templateId, session } = useAddonUi()
  const back = (): void => useAddonUi.getState().showManager()
  return (
    <div className="panel addons-win">
      {tab === 'manager' && <ManagerView />}
      {tab === 'gallery' && <TemplateGallery onPick={(t) => useAddonUi.getState().edit(null, t)} onBack={back} />}
      {tab === 'maker' && <FlowMaker key={session} editId={editId} templateId={templateId} onBack={back} />}
    </div>
  )
}
