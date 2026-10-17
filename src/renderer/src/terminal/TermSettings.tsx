// Einstellungen fürs Terminal – als kleines Menü direkt am Fenster, gelten für alle Terminals.
import { useEffect, useRef } from 'react'
import type { ShellKind, TerminalCursor, TerminalSettings } from '../../../shared/types'
import { FONT_MAX, FONT_MIN } from '../../../shared/terminalInput'
import { useSettings } from '../store/settingsStore'
import { Toggle } from '../windows/AmbienceMenu'
import { TERMINAL_THEMES } from './themes'

const CURSORS: { id: TerminalCursor; label: string }[] = [
  { id: 'block', label: 'Block' },
  { id: 'bar', label: 'Strich' },
  { id: 'underline', label: 'Unterstrich' }
]
const SHELLS: { id: ShellKind; label: string }[] = [
  { id: 'powershell', label: 'Windows PowerShell' },
  { id: 'pwsh', label: 'PowerShell 7' },
  { id: 'cmd', label: 'Eingabeaufforderung' }
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
  const t = s.terminal
  const patch = (p: Partial<TerminalSettings>): void => set({ terminal: { ...t, ...p } })

  return (
    <div className="term-settings" ref={box} onMouseDown={(e) => e.stopPropagation()} data-testid="term-settings">
      <label className="ts-row">
        <span>Schriftgröße</span>
        <span className="row">
          <button className="btn small ghost" disabled={t.fontSize <= FONT_MIN} onClick={() => patch({ fontSize: t.fontSize - 1 })} aria-label="Kleiner">
            −
          </button>
          <b className="mono" data-testid="term-font-size">
            {t.fontSize}
          </b>
          <button className="btn small ghost" disabled={t.fontSize >= FONT_MAX} onClick={() => patch({ fontSize: t.fontSize + 1 })} aria-label="Größer">
            +
          </button>
        </span>
      </label>
      <label className="ts-row">
        <span>Zeilenhöhe</span>
        <select className="field small" value={t.lineHeight} onChange={(e) => patch({ lineHeight: Number(e.target.value) })}>
          <option value={1}>eng</option>
          <option value={1.2}>normal</option>
          <option value={1.4}>luftig</option>
        </select>
      </label>
      <label className="ts-row">
        <span>Farben</span>
        <select className="field small" value={t.theme} onChange={(e) => patch({ theme: e.target.value })} data-testid="term-theme">
          <option value="scene">Passend zur Szene</option>
          {TERMINAL_THEMES.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </label>
      <label className="ts-row">
        <span>Cursor</span>
        <select className="field small" value={t.cursorStyle} onChange={(e) => patch({ cursorStyle: e.target.value as TerminalCursor })}>
          {CURSORS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <div className="ts-row">
        <span>Cursor blinkt</span>
        <Toggle label="Cursor blinkt" on={t.cursorBlink} onChange={(v) => patch({ cursorBlink: v })} />
      </div>
      <div className="ts-row">
        <span>Statuszeile</span>
        <Toggle label="Statuszeile" on={t.statusBar} onChange={(v) => patch({ statusBar: v })} />
      </div>
      <div className="ts-row">
        <span>Vorschau öffnet sich, wenn ein Server startet</span>
        <Toggle label="Vorschau automatisch öffnen" on={s.previewAutoOpen ?? true} onChange={(v) => set({ previewAutoOpen: v })} />
      </div>
      <label className="ts-row">
        <span>Shell</span>
        <select className="field small" value={t.shell} onChange={(e) => patch({ shell: e.target.value as ShellKind })}>
          {SHELLS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </label>
      <div className="dim tiny">Strg+F sucht, Strg+Plus/Minus zoomt, Strg+0 setzt zurück. Rechtsklick kopiert oder fügt ein.</div>
    </div>
  )
}
