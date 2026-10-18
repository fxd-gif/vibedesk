// Einstellungen fürs Terminal – als kleines Menü direkt am Fenster, gelten für alle Terminals.
import { useEffect, useRef } from 'react'
import type { ShellKind, TerminalCursor, TerminalSettings } from '../../../shared/types'
import { FONT_MAX, FONT_MIN } from '../../../shared/terminalInput'
import { useSettings } from '../store/settingsStore'
import { Toggle } from '../windows/AmbienceMenu'
import { TERMINAL_THEMES } from './themes'
import { t } from '../../../shared/i18n'

const CURSORS = (): { id: TerminalCursor; label: string }[] => [
  { id: 'block', label: t('Block') },
  { id: 'bar', label: t('Strich') },
  { id: 'underline', label: t('Unterstrich') }
]
const SHELLS = (): { id: ShellKind; label: string }[] => [
  { id: 'powershell', label: 'Windows PowerShell' },
  { id: 'pwsh', label: 'PowerShell 7' },
  { id: 'cmd', label: t('Eingabeaufforderung') }
]

export function TermSettings({ onClose }: { onClose(): void }): React.JSX.Element | null {
  const s = useSettings((x) => x.s)
  const set = useSettings((x) => x.set)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const away = (e: PointerEvent): void => {
      if (box.current && !box.current.contains(e.target as Node)) onClose()
    }
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', away, true)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointerdown', away, true)
      window.removeEventListener('keydown', esc)
    }
  }, [onClose])

  if (!s) return null
  const term = s.terminal
  const patch = (p: Partial<TerminalSettings>): void => set({ terminal: { ...term, ...p } })

  return (
    <div className="term-settings" ref={box} onMouseDown={(e) => e.stopPropagation()} data-testid="term-settings">
      <label className="ts-row">
        <span>{t('Schriftgröße')}</span>
        <span className="row">
          <button className="btn small ghost" disabled={term.fontSize <= FONT_MIN} onClick={() => patch({ fontSize: term.fontSize - 1 })} aria-label={t('Kleiner')}>
            −
          </button>
          <b className="mono" data-testid="term-font-size">
            {term.fontSize}
          </b>
          <button className="btn small ghost" disabled={term.fontSize >= FONT_MAX} onClick={() => patch({ fontSize: term.fontSize + 1 })} aria-label={t('Größer')}>
            +
          </button>
        </span>
      </label>
      <label className="ts-row">
        <span>{t('Zeilenhöhe')}</span>
        <select className="field small" value={term.lineHeight} onChange={(e) => patch({ lineHeight: Number(e.target.value) })}>
          <option value={1}>{t('eng')}</option>
          <option value={1.2}>{t('normal')}</option>
          <option value={1.4}>{t('luftig')}</option>
        </select>
      </label>
      <label className="ts-row">
        <span>{t('Farben')}</span>
        <select className="field small" value={term.theme} onChange={(e) => patch({ theme: e.target.value })} data-testid="term-theme">
          <option value="scene">{t('Passend zur Szene')}</option>
          {TERMINAL_THEMES.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </label>
      <label className="ts-row">
        <span>{t('Cursor')}</span>
        <select className="field small" value={term.cursorStyle} onChange={(e) => patch({ cursorStyle: e.target.value as TerminalCursor })}>
          {CURSORS().map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <div className="ts-row">
        <span>{t('Cursor blinkt')}</span>
        <Toggle label={t('Cursor blinkt')} on={term.cursorBlink} onChange={(v) => patch({ cursorBlink: v })} />
      </div>
      <div className="ts-row">
        <span>{t('Statuszeile')}</span>
        <Toggle label={t('Statuszeile')} on={term.statusBar} onChange={(v) => patch({ statusBar: v })} />
      </div>
      <div className="ts-row">
        <span>{t('Vorschau öffnet sich, wenn ein Server startet')}</span>
        <Toggle label={t('Vorschau automatisch öffnen')} on={s.previewAutoOpen ?? true} onChange={(v) => set({ previewAutoOpen: v })} />
      </div>
      <div className="ts-row">
        <span>{t('Nach dem Nutzungslimit von selbst weitermachen')}</span>
        <Toggle label={t('Nach dem Limit weitermachen')} on={s.autoResume ?? true} onChange={(v) => set({ autoResume: v })} />
      </div>
      <label className="ts-row">
        <span>{t('Shell')}</span>
        <select className="field small" value={term.shell} onChange={(e) => patch({ shell: e.target.value as ShellKind })}>
          {SHELLS().map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </label>
      <div className="dim tiny">{t('Strg+F sucht, Strg+Plus/Minus zoomt, Strg+0 setzt zurück. Rechtsklick kopiert oder fügt ein.')}</div>
    </div>
  )
}
