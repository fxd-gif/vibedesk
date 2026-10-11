import { useRef, useState } from 'react'
import { useDialog, type DialogSpec } from '../store/dialogStore'

export function DialogHost(): React.JSX.Element | null {
  const d = useDialog((s) => s.current)
  // Eigene Instanz pro Dialog → Eingabe startet immer frisch
  return d ? <DialogBox key={d.seq} d={d} /> : null
}

function DialogBox({ d }: { d: DialogSpec }): React.JSX.Element {
  const close = useDialog((s) => s.close)
  const [value, setValue] = useState(d.defaultValue ?? '')
  const [checked, setChecked] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const okRef = useRef<HTMLButtonElement>(null)
  const ok = (): void => close({ ok: true, value: value.trim(), checked })
  const cancel = (): void => close({ ok: false, value: '', checked: false })

  return (
    <div className="dlg-backdrop" onPointerDown={(e) => e.target === e.currentTarget && cancel()}>
      <div
        className="dlg"
        role="dialog"
        onKeyDown={(e) => {
          if (e.key === 'Escape') cancel()
          if (e.key === 'Enter' && (d.kind !== 'prompt' || value.trim())) ok()
        }}
      >
        <h3>{d.title}</h3>
        {d.message && <p className="dlg-msg">{d.message}</p>}
        {d.kind === 'prompt' && (
          <input ref={inputRef} autoFocus className="field" value={value} placeholder={d.placeholder} onChange={(e) => setValue(e.target.value)} />
        )}
        {d.checkbox && (
          <label className="check">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <span className="check-box" />
            {d.checkbox}
          </label>
        )}
        <div className="dlg-actions">
          {d.kind !== 'alert' && (
            <button className="btn ghost" onClick={cancel}>
              Abbrechen
            </button>
          )}
          <button
            ref={okRef}
            autoFocus={d.kind !== 'prompt'}
            className={`btn ${d.danger ? 'danger' : 'primary'}`}
            disabled={d.kind === 'prompt' && !value.trim()}
            onClick={ok}
            data-testid="dialog-ok"
          >
            {d.confirmLabel ?? (d.kind === 'alert' ? 'OK' : 'Bestätigen')}
          </button>
        </div>
      </div>
    </div>
  )
}
