import { useState } from 'react'
import { CATEGORY_LABELS, KINDS, type Category } from '../../../addons/flowModel'
import { CATEGORY_ICONS, FlowIcon } from './FlowIcon'

export const DRAG_TYPE = 'application/x-vibedesk-node'
const ORDER: Category[] = ['trigger', 'action', 'logic', 'tool']

/** Bausteinliste: Suche, einklappbare Kategorien; Ziehen auf die Fläche oder anklicken. */
export function Palette({ onAdd }: { onAdd(type: string): void }): React.JSX.Element {
  const [q, setQ] = useState('')
  const [closed, setClosed] = useState<Set<Category>>(new Set())
  const needle = q.trim().toLowerCase()
  const toggle = (c: Category): void =>
    setClosed((s) => {
      const n = new Set(s)
      if (n.has(c)) n.delete(c)
      else n.add(c)
      return n
    })

  return (
    <aside className="fpal">
      <label className="fpal-search">
        <FlowIcon name="search" size={15} />
        <input placeholder="Bausteine suchen…" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="fpal-list">
        {ORDER.map((cat) => {
          const items = Object.entries(KINDS).filter(([, k]) => k.category === cat && (!needle || k.label.toLowerCase().includes(needle) || k.desc.toLowerCase().includes(needle)))
          if (!items.length) return null
          const open = needle !== '' || !closed.has(cat)
          return (
            <section key={cat} className={`fpal-cat cat-${cat}`}>
              <button className="fpal-head" onClick={() => toggle(cat)}>
                <FlowIcon name={CATEGORY_ICONS[cat]} size={16} />
                <span>{CATEGORY_LABELS[cat]}</span>
                <span className={`fpal-chev${open ? ' open' : ''}`}>
                  <FlowIcon name="chevron" size={14} />
                </span>
              </button>
              {open &&
                items.map(([type, k]) => (
                  <button
                    key={type}
                    className="fpal-item"
                    draggable
                    title={k.desc}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_TYPE, type)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onClick={() => onAdd(type)}
                    data-testid={`fpal-${type}`}
                  >
                    <span className="fpal-item-icon">
                      <FlowIcon name={k.icon} size={15} />
                    </span>
                    {k.label}
                  </button>
                ))}
            </section>
          )
        })}
      </div>
      <div className="fpal-hint">
        <FlowIcon name="info" size={13} /> Auf die Fläche ziehen oder anklicken
      </div>
    </aside>
  )
}
