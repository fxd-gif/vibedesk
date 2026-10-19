// Studio-Aufbau: Seitenleiste statt Dock. Bekommt dieselben Gruppen wie das Dock und ordnet sie als Navigation.
import { useState } from 'react'
import { Icon } from './icons'
import type { DockItem } from './Dock'
import { useUi } from '../store/uiStore'
import { openPanel } from '../windows/palette/CommandPalette'
import { t } from '../../../shared/i18n'
import './studio.css'

function Item({ it, beta }: { it: DockItem; beta?: boolean }): React.JSX.Element {
  return (
    <button
      className={`sb-item${it.active ? ' active' : ''}${it.className ? ' ' + it.className : ''}`}
      onClick={it.onClick}
      title={it.hint ?? it.label}
      aria-label={it.label}
      data-testid={`dock-${it.testId ?? it.id}`}
    >
      <span className="sb-icon">{it.content ?? <Icon name={it.icon ?? ''} size={17} />}</span>
      <span className="sb-label">{it.label}</span>
      {beta && <span className="sb-beta">Beta</span>}
      {it.badge && <span className="sb-badge">{it.badge}</span>}
    </button>
  )
}

/**
 * Gruppen wie im Dock: [Befehle, Projekte] [Atmosphäre, Fokus] [Sessions …] [Werkzeuge …] [Mitteilungen, Mehr].
 * Merge Studio steht im Studio-Aufbau immer in der Leiste.
 */
export function Sidebar({ groups }: { groups: DockItem[][] }): React.JSX.Element {
  const [start = [], mood = [], sessions = [], tools = [], end = []] = groups
  const [open, setOpen] = useState(true)
  const mergeOn = useUi((s) => s.open[s.open.length - 1] === 'merge' && !s.minimized.includes('merge'))
  const merge: DockItem = { id: 'merge', icon: 'merge', label: t('Merge Studio'), hint: t('Parallele Sessions vergleichen und sicher zusammenführen'), active: mergeOn, onClick: () => openPanel('merge') }

  return (
    <nav className="sidebar" data-testid="sidebar">
      <div className="sb-brand">
        <span className="sb-logo">
          <Icon name="terminal" size={16} />
        </span>
        <b>VibeDesk</b>
      </div>
      <div className="sb-scroll">
        {start.map((it) => (
          <Item key={it.id} it={it} />
        ))}
        <button className="sb-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span>{t('Sessions')}</span>
          {sessions.length > 0 && <span className="sb-count">{sessions.length}</span>}
          <span className={`sb-caret${open ? ' open' : ''}`} />
        </button>
        {open && (sessions.length ? sessions.map((it) => <Item key={it.id} it={{ ...it, className: 'sb-session' }} />) : <p className="sb-empty">{t('Keine laufende Session')}</p>)}
        <div className="sb-sep" />
        <Item it={merge} beta />
        {tools
          .filter((it) => it.id !== 'merge')
          .map((it) => (
            <Item key={it.id} it={it} />
          ))}
      </div>
      <div className="sb-foot">
        {[...mood, ...end].map((it) => (
          <Item key={it.id} it={it} />
        ))}
      </div>
    </nav>
  )
}
