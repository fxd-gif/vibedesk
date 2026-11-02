// „Mehr“ im Dock: die Übersicht über alles, was VibeDesk kann – ruhige Kacheln in festen Gruppen
// (Arbeiten, Eigene, Ruhe, Gemeinsam & Streaming). Was ein Werkzeug tut, steht erst beim Überfahren unten in einer Zeile.
// Einstellungen haben ein eigenes Fenster.
import { useEffect, useRef, useState } from 'react'
import type { PanelId } from '../../../shared/types'
import { panelDef } from '../windows/panels'
import { openPanel } from '../windows/palette/CommandPalette'
import { Icon } from './icons'
import { openAbout } from './About'
import { t } from '../../../shared/i18n'
import { openSettings } from '../windows/SettingsWindow'
import { launcherGroups } from './dockPlan'
import { designApp, openApp, useApps } from '../store/appsStore'
import { confirm } from '../store/dialogStore'
import { api } from '../api'

interface Info {
  title: string
  hint: string
}

export function MoreMenu({ items, onClose }: { items: PanelId[]; onClose(): void }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const apps = useApps((s) => s.list)
  const [info, setInfo] = useState<Info | null>(null)

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

  const go = (fn: () => void) => (): void => {
    onClose()
    fn()
  }
  const explain = (i: Info) => ({
    onMouseEnter: () => setInfo(i),
    onFocus: () => setInfo(i)
  })
  const groups = launcherGroups(items)
  // „Eigene“ und „Ruhe“ teilen sich eine Zeile, solange beide klein sind
  const ownCount = (groups.find((g) => g.id === 'own')?.items.length ?? 0) + apps.length + 1
  const half = (id: string): boolean => (id === 'own' || id === 'calm') && ownCount <= 2

  return (
    <div className="more-menu launcher" ref={ref} data-testid="more-menu" onMouseLeave={() => setInfo(null)}>
      <div className="lx-body">
        {groups.map((g) => (
          <section key={g.id} className={`lx-group lx-${g.id}${half(g.id) ? ' half' : ''}`} aria-label={g.label} data-testid={g.id === 'own' ? 'more-apps' : undefined}>
            <h4 className="more-head">{g.label}</h4>
            <div className="lx-grid">
              {g.items.map((id) => {
                const def = panelDef(id)!
                return (
                  <button key={id} className="lx-tile" onClick={go(() => openPanel(id))} {...explain({ title: def.title, hint: def.hint })} data-testid={`more-${id}`}>
                    <span className="lx-icon">
                      <Icon name={def.icon} size={19} />
                    </span>
                    <span className="lx-name">{def.title}</span>
                  </button>
                )
              })}
              {g.id === 'own' && (
                <>
                  {apps.map((a) => (
                    <div key={a.id} className="lx-tile-wrap">
                      <button
                        className="lx-tile"
                        onClick={go(() => openApp(a.id))}
                        {...explain({
                          title: a.name,
                          hint: a.hint || t('Werkzeug-Fenster, das Claude für dich gebaut hat')
                        })}
                        data-testid={`more-app-${a.id}`}
                      >
                        <span className="lx-icon own">
                          <Icon name="spark" size={19} />
                        </span>
                        <span className="lx-name">{a.name}</span>
                      </button>
                      <button
                        className="gbtn lx-del"
                        title={t('Löschen')}
                        aria-label={t('„{name}“ löschen', { name: a.name })}
                        onClick={async () => {
                          if (
                            await confirm({
                              title: t('„{name}“ löschen?', { name: a.name }),
                              message: t('Das Werkzeug-Fenster und alles, was es gespeichert hat, sind dann weg.'),
                              confirmLabel: t('Löschen'),
                              danger: true
                            })
                          )
                            void api.apps.delete(a.id)
                        }}
                      >
                        <Icon name="trash" size={11} />
                      </button>
                    </div>
                  ))}
                  <button
                    className="lx-tile lx-new"
                    onClick={go(() => void designApp())}
                    {...explain({
                      title: t('Mit Claude bauen …'),
                      hint: t('Claude baut dir kleine Fenster für das, was du gerade brauchst – z. B. alle offenen Todos auf einen Blick.')
                    })}
                    data-testid="more-app-design"
                  >
                    <span className="lx-icon">
                      <Icon name="plus" size={19} />
                    </span>
                    <span className="lx-name">{t('Mit Claude bauen')}</span>
                  </button>
                </>
              )}
            </div>
          </section>
        ))}
      </div>
      <p className="lx-info" aria-live="polite">
        {info ? (
          <>
            <b>{info.title}</b> {info.hint}
          </>
        ) : (
          t('Alles, was VibeDesk kann. Fahre über ein Symbol, um zu sehen, wofür es da ist.')
        )}
      </p>
      <div className="more-foot">
        <button className="link-btn" onClick={go(() => openSettings())} data-testid="more-settings">
          <Icon name="gear" size={14} /> {t('Einstellungen')}
        </button>
        <button className="link-btn" onClick={go(() => openSettings('toolbox'))} data-testid="more-toolbox">
          {t('Werkzeugkasten')}
        </button>
        <button className="link-btn" onClick={go(() => openAbout())} data-testid="more-about">
          {t('Über VibeDesk · Fehler melden')}
        </button>
      </div>
    </div>
  )
}
