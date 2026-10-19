// „Mehr“ im Dock: alles, was gerade nicht im Dock steht – mit einem Satz, wofür es da ist.
import { useEffect, useRef } from 'react'
import type { PanelId } from '../../../shared/types'
import { useSettings } from '../store/settingsStore'
import { Toggle } from './Toggle'
import { panelDef } from '../windows/panels'
import { openPanel } from '../windows/palette/CommandPalette'
import { Icon } from './icons'
import { openAbout } from './About'
import { t, type LangSetting } from '../../../shared/i18n'

export function MoreMenu({ items, onClose }: { items: PanelId[]; onClose(): void }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const dockAll = useSettings((s) => !!s.s?.dockAll)
  const quick = useSettings((s) => s.s?.quickPrompt !== false)
  const lang = useSettings((s) => s.s?.language ?? 'auto')

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
        <span>{t('Alle Symbole im Dock zeigen')}</span>
        <Toggle on={dockAll} onChange={(v) => useSettings.getState().set({ dockAll: v })} label={t('Alle Symbole im Dock zeigen')} />
      </div>
      <div className="more-foot">
        <span title={t('Öffnet über jeder App ein Eingabefeld – der Text geht an Claude')}>
          {t('Schnell-Prompt')} <kbd className="mono">{t('Strg+Alt+Leertaste')}</kbd>
        </span>
        <Toggle on={quick} onChange={(v) => useSettings.getState().set({ quickPrompt: v })} label={t('Schnell-Prompt von überall')} />
      </div>
      <div className="more-foot">
        {/* bewusst zweisprachig – man muss den Umschalter auch finden, wenn man die andere Sprache nicht liest */}
        <span>Sprache · Language</span>
        <select
          className="field small"
          value={lang}
          onChange={(e) => useSettings.getState().set({ language: e.target.value as LangSetting })}
          data-testid="more-language"
        >
          <option value="auto">{t('Automatisch')}</option>
          <option value="de">Deutsch</option>
          <option value="en">English</option>
        </select>
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
