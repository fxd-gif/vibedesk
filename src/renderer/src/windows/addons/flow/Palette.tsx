import { useState } from 'react'
import { CATEGORY_LABELS, KINDS, type Category } from '../../../addons/flowModel'
import { CATEGORY_ICONS, FlowIcon } from './FlowIcon'
import { t } from '../../../../../shared/i18n'

export const DRAG_TYPE = 'application/x-vibedesk-node'
const STANDARD: Category[] = ['trigger', 'claude', 'action', 'logic', 'tool']

function Item({ type, onAdd }: { type: string; onAdd(type: string): void }): React.JSX.Element {
  const k = KINDS[type]
  return (
    <button
      className={`fpal-item cat-${k.category}`}
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
  )
}

/** Bausteinliste: Tabs Standard/Erweitert, Suche, einklappbare Kategorien; Ziehen auf die Fläche oder anklicken. */
export function Palette({ onAdd }: { onAdd(type: string): void }): React.JSX.Element {
  const [tab, setTab] = useState<'std' | 'adv'>('std')
  const [q, setQ] = useState('')
  const [closed, setClosed] = useState<Set<Category>>(new Set())
  const needle = q.trim().toLowerCase()
  const match = (type: string): boolean => {
    const k = KINDS[type]
    return !needle || k.label.toLowerCase().includes(needle) || k.desc.toLowerCase().includes(needle)
  }
  const toggle = (c: Category): void =>
    setClosed((s) => {
      const n = new Set(s)
      if (n.has(c)) n.delete(c)
      else n.add(c)
      return n
    })
  // Bei einer Suche beide Tabs durchsuchen
  const cats: Category[] = needle ? [...STANDARD, 'advanced'] : tab === 'std' ? STANDARD : ['advanced']

  return (
    <aside className="fpal">
      <div className="fpal-tabs">
        <button className={tab === 'std' ? 'on' : ''} onClick={() => setTab('std')} data-testid="fpal-tab-std">
          {t('Bausteine')}
        </button>
        <button className={`adv${tab === 'adv' ? ' on' : ''}`} onClick={() => setTab('adv')} data-testid="fpal-tab-adv">
          <FlowIcon name="sparkles" size={13} /> {t('Erweitert')}
        </button>
      </div>
      <label className="fpal-search">
        <FlowIcon name="search" size={15} />
        <input placeholder={t('Bausteine suchen…')} value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="fpal-list">
        {tab === 'adv' && !needle && (
          <p className="fpal-adv-intro">
            {t('Für Profis: Signale als eigene Ereignisse und Unterprogramme, parallele Zweige, Listen, Drossel und „Warten bis“. Berechnungen findest du im fx-Menü jedes Werts.')}
          </p>
        )}
        {cats.map((cat) => {
          const items = Object.keys(KINDS).filter((type) => KINDS[type].category === cat && match(type))
          if (!items.length) return null
          const open = needle !== '' || !closed.has(cat)
          return (
            <section key={cat} className={`fpal-cat cat-${cat}`}>
              <button className="fpal-head" onClick={() => toggle(cat)}>
                <FlowIcon name={CATEGORY_ICONS[cat]} size={16} />
                <span>{CATEGORY_LABELS()[cat]}</span>
                <span className={`fpal-chev${open ? ' open' : ''}`}>
                  <FlowIcon name="chevron" size={14} />
                </span>
              </button>
              {open && items.map((type) => <Item key={type} type={type} onAdd={onAdd} />)}
            </section>
          )
        })}
      </div>
      <div className="fpal-hint">
        <FlowIcon name="info" size={13} /> {t('Auf die Fläche ziehen oder anklicken')}
      </div>
    </aside>
  )
}
