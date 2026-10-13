// „Mehr“ im Dock: alles, was gerade nicht im Dock steht – mit einem Satz, wofür es da ist.
import { useEffect, useRef } from 'react'
import type { PanelId } from '../../../shared/types'
import { useSettings } from '../store/settingsStore'
import { Toggle } from '../windows/AmbienceMenu'
import { panelDef } from '../windows/panels'
import { openPanel } from '../windows/palette/CommandPalette'
import { Icon } from './icons'

export function MoreMenu({ items, onClose }: { items: PanelId[]; onClose(): void }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const dockAll = useSettings((s) => !!s.s?.dockAll)

  useEffect(() => {
    const down = (e: PointerEvent): void => {
      const t = e.target as HTMLElement
      if (!ref.current?.contains(t) && !t.closest('[data-testid="dock-more"]')) onClose()
    }
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', down)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('keydown', key)
    }
  }, [onClose])

  return (
    <div className="more-menu" ref={ref} data-testid="more-menu">
      {items.map((id) => {
        const def = panelDef(id)!
        return (
          <button
            key={id}
            className="more-item"
            onClick={() => {
              onClose()
              openPanel(id)
            }}
            data-testid={`more-${id}`}
          >
            <Icon name={def.icon} size={18} />
            <span>
              <b>{def.title}</b>
              <small>{def.hint}</small>
            </span>
          </button>
        )
      })}
      <div className="more-foot">
        <span>Alle Symbole im Dock zeigen</span>
        <Toggle on={dockAll} onChange={(v) => useSettings.getState().set({ dockAll: v })} label="Alle Symbole im Dock zeigen" />
      </div>
    </div>
  )
}
