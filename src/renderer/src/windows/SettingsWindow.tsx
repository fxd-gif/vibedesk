// Einstellungen an einem Ort: Allgemein, Werkzeugkasten (Module an/aus), Mitteilungen und Terminal.
import { create } from 'zustand'
import type { LayoutTheme, PanelId } from '../../../shared/types'
import { t, type LangSetting } from '../../../shared/i18n'
import { useSettings } from '../store/settingsStore'
import { Toggle } from '../desktop/Toggle'
import { Icon } from '../desktop/icons'
import { MODULES, SIMPLE_OFF } from '../desktop/modules'
import { NotifySettingsView } from '../desktop/NotifyCenter'
import { TermSettingsFields } from '../terminal/TermSettings'
import { panelDef } from './panels'
import { openPanel } from './palette/CommandPalette'
import './settings.css'

export type SettingsTab = 'general' | 'toolbox' | 'notify' | 'terminal'

const TABS = (): { id: SettingsTab; label: string }[] => [
  { id: 'general', label: t('Allgemein') },
  { id: 'toolbox', label: t('Werkzeugkasten') },
  { id: 'notify', label: t('Mitteilungen') },
  { id: 'terminal', label: t('Terminal') }
]

export const useSettingsUi = create<{ tab: SettingsTab }>(() => ({ tab: 'general' }))

export function openSettings(tab: SettingsTab = 'general'): void {
  useSettingsUi.setState({ tab })
  openPanel('settings')
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="nset-row">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      {children}
    </div>
  )
}

function General(): React.JSX.Element | null {
  const s = useSettings((x) => x.s)
  const set = useSettings((x) => x.set)
  if (!s) return null
  return (
    <div className="nset">
      <h4>{t('Aussehen')}</h4>
      <Row label="Sprache · Language">
        <select className="field small" value={s.language ?? 'auto'} onChange={(e) => set({ language: e.target.value as LangSetting })} data-testid="settings-language">
          <option value="auto">{t('Automatisch')}</option>
          <option value="de">Deutsch</option>
          <option value="en">English</option>
        </select>
      </Row>
      <Row label={t('Aufbau')} hint={t('Freie Fenster mit Dock oder Seitenleiste mit Seiten')}>
        <select className="field small" value={s.layout ?? 'desktop'} onChange={(e) => set({ layout: e.target.value as LayoutTheme })} data-testid="settings-layout">
          <option value="desktop">{t('Desktop · freie Fenster')}</option>
          <option value="studio">{t('Studio · Seitenleiste')}</option>
        </select>
      </Row>
      <h4>{t('Ruhe')}</h4>
      <Row label={t('Alle Symbole im Dock zeigen')} hint={t('Sonst erscheinen Werkzeuge erst, wenn sie etwas zu tun haben')}>
        <Toggle on={!!s.dockAll} onChange={(v) => set({ dockAll: v })} label={t('Alle Symbole im Dock zeigen')} />
      </Row>
      <Row label={t('Dock beim Tippen abblenden')} hint={t('Solange du im Terminal schreibst')}>
        <Toggle on={s.dockFade ?? true} onChange={(v) => set({ dockFade: v })} label={t('Dock beim Tippen abblenden')} />
      </Row>
      <Row label={t('Fenster automatisch aufräumen')} hint={t('Nach 15 Minuten ohne Benutzung wandern Fenster ins Dock')}>
        <Toggle on={!!s.autoTidy} onChange={(v) => set({ autoTidy: v })} label={t('Fenster automatisch aufräumen')} />
      </Row>
      <Row label={t('Tipps zeigen')} hint={t('Ab und zu ein leiser Hinweis auf etwas, das gerade passt')}>
        <Toggle on={s.hintsOn ?? true} onChange={(v) => set({ hintsOn: v })} label={t('Tipps zeigen')} />
      </Row>
      <Row label={t('Zen-Modus')} hint={t('Nur Claude und der Regen')}>
        <kbd className="mono">{t('Strg+.')}</kbd>
      </Row>
      <h4>{t('Eingabe')}</h4>
      <Row label={t('Schnell-Prompt von überall')} hint={t('Strg+Alt+Leertaste öffnet über jeder App ein Eingabefeld')}>
        <Toggle on={s.quickPrompt !== false} onChange={(v) => set({ quickPrompt: v })} label={t('Schnell-Prompt von überall')} />
      </Row>
    </div>
  )
}

function Toolbox(): React.JSX.Element | null {
  const s = useSettings((x) => x.s)
  const set = useSettings((x) => x.set)
  if (!s) return null
  const off = s.modulesOff ?? []
  const preset = !off.length ? 'all' : off.length === SIMPLE_OFF.length && SIMPLE_OFF.every((x) => off.includes(x)) ? 'simple' : null
  const toggle = (id: PanelId, on: boolean): void => set({ modulesOff: on ? off.filter((x) => x !== id) : [...off, id] })
  return (
    <div className="toolbox">
      <p className="dim small">{t('Schalte dazu, was du brauchst. Ausgeblendetes verschwindet aus Dock, Mehr-Menü und Befehls-Palette – Einstellungen bleiben erhalten.')}</p>
      <div className="row" style={{ gap: 8 }}>
        <button className={`btn small ghost${preset === 'simple' ? ' on' : ''}`} onClick={() => set({ modulesOff: SIMPLE_OFF })} data-testid="toolbox-simple">
          {t('Einfach')}
        </button>
        <button className={`btn small ghost${preset === 'all' ? ' on' : ''}`} onClick={() => set({ modulesOff: [] })} data-testid="toolbox-all">
          {t('Alles')}
        </button>
      </div>
      <div className="toolbox-grid">
        {MODULES.map((id) => {
          const def = panelDef(id)!
          const on = !off.includes(id)
          return (
            <div key={id} className={`toolbox-card${on ? ' on' : ''}`} data-testid={`toolbox-${id}`}>
              <Icon name={def.icon} size={18} />
              <span>
                <b>{def.title}</b>
                <small>{def.hint}</small>
              </span>
              <Toggle on={on} onChange={(v) => toggle(id, v)} label={def.title} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function SettingsWindow(): React.JSX.Element {
  const tab = useSettingsUi((s) => s.tab)
  return (
    <div className="inspector settings-win">
      <div className="row tabs inspector-tabs">
        {TABS().map((x) => (
          <button key={x.id} className={`tab${tab === x.id ? ' on' : ''}`} onClick={() => useSettingsUi.setState({ tab: x.id })} data-testid={`settings-${x.id}`}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="inspector-body">
        {tab === 'general' && <General />}
        {tab === 'toolbox' && <Toolbox />}
        {tab === 'notify' && <NotifySettingsView />}
        {tab === 'terminal' && (
          <div className="settings-term">
            <TermSettingsFields />
          </div>
        )}
      </div>
    </div>
  )
}
