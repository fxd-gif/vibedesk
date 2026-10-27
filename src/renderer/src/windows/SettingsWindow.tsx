// Einstellungen an einem Ort: Allgemein, Ansicht (Erfahrung, Aufbau, Module, Inspector-Tabs), Mitteilungen, Terminal und Updates.
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
import { api } from '../api'
import { experiencePreset } from '../desktop/experience'
import { startTour } from '../desktop/Tour'
import { useUpdate } from '../store/updateStore'
import { updateLabel } from '../store/updateLabel'
import { INSPECTOR_TABS } from './InspectorWindow'

/** 'toolbox' = Ansicht (die ID bleibt, Tipps und Mehr-Menü öffnen sie so) */
export type SettingsTab = 'general' | 'toolbox' | 'notify' | 'terminal' | 'updates'

const TABS = (): { id: SettingsTab; label: string }[] => [
  { id: 'general', label: t('Allgemein') },
  { id: 'toolbox', label: t('Ansicht') },
  { id: 'notify', label: t('Mitteilungen') },
  { id: 'terminal', label: t('Terminal') },
  { id: 'updates', label: t('Updates') }
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
      <Row label={t('Abschluss nach jeder Runde')} hint={t('Hat Claude Dateien geändert, bietet die Fertig-Karte Zusammenfassung und Commit an')}>
        <Toggle on={s.wrapUp ?? true} onChange={(v) => set({ wrapUp: v })} label={t('Abschluss nach jeder Runde')} />
      </Row>
      <Row label={t('Symbol im Infobereich')} hint={t('Ein farbiger Punkt zeigt, ob eine Session auf dich wartet – auch wenn VibeDesk im Hintergrund ist')}>
        <Toggle on={s.trayOn ?? true} onChange={(v) => set({ trayOn: v })} label={t('Symbol im Infobereich')} />
      </Row>
      {(s.trayOn ?? true) && (
        <Row label={t('Beim Schließen im Infobereich weiterlaufen')} hint={t('Alt+F4 versteckt VibeDesk nur, die Sessions arbeiten weiter')}>
          <Toggle on={!!s.trayOnClose} onChange={(v) => set({ trayOnClose: v })} label={t('Beim Schließen im Infobereich weiterlaufen')} />
        </Row>
      )}
      <Row label={t('Tipps zeigen')} hint={t('Ab und zu ein leiser Hinweis auf etwas, das gerade passt')}>
        <Toggle on={s.hintsOn ?? true} onChange={(v) => set({ hintsOn: v })} label={t('Tipps zeigen')} />
      </Row>
      <Row label={t('Zen-Modus')} hint={t('Nur Claude und der Regen')}>
        <kbd className="mono">{t('Strg+.')}</kbd>
      </Row>
      <Row label={t('Rundgang')} hint={t('Kurze Klick-Tour: wo was ist und wie VibeDesk funktioniert')}>
        <button className="btn small" onClick={startTour} data-testid="settings-tour">
          {t('Starten')}
        </button>
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
  const exp = s.experience ?? ''
  const tabsOff = s.inspectorTabsOff ?? []
  return (
    <div className="toolbox">
      <h4 className="toolbox-h">{t('Erfahrung')}</h4>
      <p className="dim small">{t('Setzt eine passende Grundeinstellung. Danach kannst du unten alles einzeln ändern.')}</p>
      <div className="row" style={{ gap: 8 }}>
        <button className={`btn small ghost${exp === 'beginner' ? ' on' : ''}`} onClick={() => set(experiencePreset('beginner'))} data-testid="exp-beginner">
          {t('Anfänger · einfach')}
        </button>
        <button className={`btn small ghost${exp === 'pro' ? ' on' : ''}`} onClick={() => set(experiencePreset('pro'))} data-testid="exp-pro">
          {t('Profi · Studio')}
        </button>
      </div>
      <h4 className="toolbox-h">{t('Aufbau')}</h4>
      <div className="nset-row">
        <span>
          {t('Aufbau')}
          <small>{t('Freie Fenster mit Dock oder Seitenleiste mit Seiten')}</small>
        </span>
        <select className="field small" value={s.layout ?? 'desktop'} onChange={(e) => set({ layout: e.target.value as LayoutTheme })} data-testid="settings-layout">
          <option value="desktop">{t('Desktop · freie Fenster')}</option>
          <option value="studio">{t('Studio · Seitenleiste')}</option>
        </select>
      </div>
      <div className="nset-row">
        <span>
          {t('Fenster pro Projekt merken')}
          <small>{t('Wechselst du das Projekt, kommen die Werkzeug-Fenster zurück, die du dort zuletzt offen hattest – Terminals bleiben, wo sie sind')}</small>
        </span>
        <Toggle on={s.workspacesOn !== false} onChange={(v) => set({ workspacesOn: v })} label={t('Fenster pro Projekt merken')} />
      </div>
      <h4 className="toolbox-h">{t('Werkzeugkasten')}</h4>
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
      <h4 className="toolbox-h">{t('Tabs im Session-Inspector')}</h4>
      <div className="toolbox-tabs">
        {INSPECTOR_TABS.map((x) => {
          const on = !tabsOff.includes(x.id)
          // der letzte sichtbare Tab bleibt
          const lastOn = on && INSPECTOR_TABS.filter((y) => !tabsOff.includes(y.id)).length === 1
          return (
            <label key={x.id} className={`toolbox-tab${on ? ' on' : ''}`} data-testid={`insp-tab-${x.id}`}>
              <span>{x.label}</span>
              <Toggle on={on} onChange={(v) => !lastOn && set({ inspectorTabsOff: v ? tabsOff.filter((y) => y !== x.id) : [...tabsOff, x.id] })} label={x.label} />
            </label>
          )
        })}
      </div>
    </div>
  )
}

function Updates(): React.JSX.Element | null {
  const s = useSettings((x) => x.s)
  const set = useSettings((x) => x.set)
  const status = useUpdate((x) => x.status)
  const version = useUpdate((x) => x.version)
  if (!s) return null
  const label =
    status.state === 'checking'
      ? t('Suche …')
      : status.state === 'none'
        ? t('VibeDesk ist aktuell.')
        : status.state === 'error'
          ? t('Suche fehlgeschlagen: {message}', { message: status.message })
          : updateLabel(status)
  return (
    <div className="nset">
      <h4>{t('Updates')}</h4>
      <Row label={t('Automatische Updates')} hint={t('Neue Versionen im Hintergrund laden und beim nächsten Start installieren. Aus: VibeDesk sagt nur Bescheid, geladen wird erst auf Knopfdruck.')}>
        <Toggle on={s.autoUpdate !== false} onChange={(v) => set({ autoUpdate: v })} label={t('Automatische Updates')} />
      </Row>
      <Row label={t('Installiert: v{version}', { version: version || '…' })} hint={label ?? undefined}>
        <span className="row" style={{ gap: 6 }}>
          {status.state === 'available' && status.manual && (
            <button className="btn small primary" onClick={() => api.update.download()} data-testid="settings-update-download">
              {t('Laden')}
            </button>
          )}
          {status.state === 'ready' && (
            <button className="btn small primary" onClick={() => api.update.install()}>
              {t('Jetzt neu starten')}
            </button>
          )}
          <button className="btn small" onClick={() => void api.update.check()} disabled={status.state === 'checking' || status.state === 'downloading'} data-testid="settings-update-check">
            {t('Jetzt suchen')}
          </button>
        </span>
      </Row>
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
        {tab === 'updates' && <Updates />}
        {tab === 'terminal' && (
          <div className="settings-term">
            <TermSettingsFields />
          </div>
        )}
      </div>
    </div>
  )
}
