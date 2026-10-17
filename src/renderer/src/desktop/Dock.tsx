import type { ReactNode } from 'react'
import { Icon } from './icons'

export interface DockItem {
  id: string
  /** Test-ID, falls sie von der (eindeutigen) id abweicht */
  testId?: string
  icon?: string
  label: string
  /** ein Satz, wofür das Symbol da ist */
  hint?: string
  active?: boolean
  onClick: () => void
  badge?: ReactNode
  className?: string
  content?: ReactNode
}

export function Dock({ groups }: { groups: DockItem[][] }): React.JSX.Element {
  return (
    <nav className="dock" data-testid="dock">
      {groups
        .filter((g) => g.length)
        .map((g, i) => (
          <div className="dock-group" key={i}>
            {g.map((it) => (
              <button
                key={it.id}
                className={`dock-btn${it.active ? ' active' : ''}${it.className ? ' ' + it.className : ''}`}
                onClick={it.onClick}
                data-tip={it.label}
                data-hint={it.hint}
                aria-label={it.label}
                data-testid={`dock-${it.testId ?? it.id}`}
              >
                {it.content ?? <Icon name={it.icon ?? ''} />}
                {it.badge}
              </button>
            ))}
          </div>
        ))}
    </nav>
  )
}
