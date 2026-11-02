// „Mehr“ im Dock: alles, was gerade nicht im Dock steht – mit einem Satz, wofür es da ist, nach Arbeiten und Gemeinsam getrennt.
// Einstellungen haben ein eigenes Fenster.
import { useEffect, useRef } from 'react'
import type { PanelId } from '../../../shared/types'
import { panelDef } from '../windows/panels'
import { openPanel } from '../windows/palette/CommandPalette'
import { Icon } from './icons'
import { openAbout } from './About'
import { t } from '../../../shared/i18n'
import { openSettings } from '../windows/SettingsWindow'
import { moreGroups } from './dockPlan'
import { designApp, openApp, useApps } from '../store/appsStore'
import { confirm } from '../store/dialogStore'
import { api } from '../api'

export function MoreMenu({ items, onClose }: { items: PanelId[]; onClose(): void }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const apps = useApps((s) => s.list)

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
      {moreGroups(items).map((g) => (
        <section key={g.id} className="more-group" aria-label={g.label || undefined}>
          {g.label && <h4 className="more-head">{g.label}</h4>}
          {g.items.map((id) => {
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
        </section>
      ))}
      <section className="more-group" aria-label={t('Eigene Werkzeuge')} data-testid="more-apps">
        <div className="more-head-row">
          <h4 className="more-head">{t('Eigene Werkzeuge')}</h4>
          <button
            className="link-btn small"
            onClick={() => {
              onClose()
              void designApp()
            }}
            data-testid="more-app-design"
          >
            ✨ {t('Mit Claude bauen …')}
          </button>
        </div>
        {apps.map((a) => (
          <div key={a.id} className="more-item more-app">
            <button
              className="more-app-open"
              onClick={() => {
                onClose()
                openApp(a.id)
              }}
              data-testid={`more-app-${a.id}`}
            >
              <Icon name="spark" size={18} />
              <span>
                <b>{a.name}</b>
                {a.hint && <small>{a.hint}</small>}
              </span>
            </button>
            <button
              className="gbtn more-app-del"
              title={t('Löschen')}
              aria-label={t('„{name}“ löschen', { name: a.name })}
              onClick={async () => {
                if (await confirm({ title: t('„{name}“ löschen?', { name: a.name }), message: t('Das Werkzeug-Fenster und alles, was es gespeichert hat, sind dann weg.'), confirmLabel: t('Löschen'), danger: true })) void api.apps.delete(a.id)
              }}
            >
              <Icon name="trash" size={13} />
            </button>
          </div>
        ))}
        {!apps.length && <p className="more-apps-hint">{t('Claude baut dir kleine Fenster für das, was du gerade brauchst – z. B. alle offenen Todos auf einen Blick.')}</p>}
      </section>
      <div className="more-foot">
        <button
          className="link-btn"
          onClick={() => {
            onClose()
            openSettings()
          }}
          data-testid="more-settings"
        >
          <Icon name="gear" size={14} /> {t('Einstellungen')}
        </button>
        <button
          className="link-btn"
          onClick={() => {
            onClose()
            openSettings('toolbox')
          }}
          data-testid="more-toolbox"
        >
          {t('Werkzeugkasten')}
        </button>
      </div>
      <div className="more-foot">
        <button
          className="link-btn"
          onClick={() => {
            onClose()
            openAbout()
          }}
          data-testid="more-about"
        >
          {t('Über VibeDesk · Fehler melden')}
        </button>
      </div>
    </div>
  )
}
