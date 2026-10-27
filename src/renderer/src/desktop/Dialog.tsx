import { useRef, useState } from 'react'
import { useDialog, type DialogSpec } from '../store/dialogStore'
import { t } from '../../../shared/i18n'

export function DialogHost(): React.JSX.Element | null {
  const d = useDialog((s) => s.current)
  // Eigene Instanz pro Dialog → Eingabe startet immer frisch
  return d ? <DialogBox key={d.seq} d={d} /> : null
}

function DialogBox({ d }: { d: DialogSpec }): React.JSX.Element {
  const close = useDialog((s) => s.close)
  const [value, setValue] = useState(d.defaultValue ?? '')
  const [checked, setChecked] = useState(false)
  const [choice, setChoice] = useState(d.choices?.[0]?.id)
  const [detail, setDetail] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const okRef = useRef<HTMLButtonElement>(null)
  const ok = (pick = choice): void => close({ ok: true, value: value.trim(), checked, choice: pick, detail: detail.trim() })
  const cancel = (): void => close({ ok: false, value: '', checked: false })
  const picked = d.choices?.find((c) => c.id === choice)
  const showDetail = !!d.detailPlaceholder && !!d.choices && choice !== d.choices[0]?.id

  return (
    <div className="dlg-backdrop" onPointerDown={(e) => e.target === e.currentTarget && cancel()}>
      <div
        className={`dlg${d.choices ? ' has-choices' : ''}`}
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
        {d.choices && (
          <>
            {d.choicesLabel && <div className="dlg-label">{d.choicesLabel}</div>}
            <div className="dlg-tiles" role="radiogroup">
              {d.choices.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={c.id === choice}
                  className={`dlg-tile${c.id === choice ? ' on' : ''}`}
                  title={c.hint}
                  onClick={() => setChoice(c.id)}
                  onKeyDown={(e) => {
                    // Enter auf einer Kachel: wählen und – wenn ein Name da ist – gleich anlegen
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    e.stopPropagation()
                    setChoice(c.id)
                    if (d.kind !== 'prompt' || value.trim()) ok(c.id)
                  }}
                  data-testid={`dialog-choice-${c.id}`}
                >
                  <span className="dlg-tile-icon">{c.icon}</span>
                  <span className="dlg-tile-name">{c.label}</span>
                </button>
              ))}
            </div>
            {picked && <p className="dlg-hint">{picked.hint}</p>}
            {showDetail && (
              <input className="field" value={detail} placeholder={d.detailPlaceholder} maxLength={200} onChange={(e) => setDetail(e.target.value)} data-testid="dialog-detail" />
            )}
          </>
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
              {t('Abbrechen')}
            </button>
          )}
          {d.altLabel && (
            <button className="btn" onClick={() => close({ ok: false, alt: true, value: '', checked: false })} data-testid="dialog-alt">
              {d.altLabel}
            </button>
          )}
          <button
            ref={okRef}
            autoFocus={d.kind !== 'prompt'}
            className={`btn ${d.danger ? 'danger' : 'primary'}`}
            disabled={d.kind === 'prompt' && !value.trim()}
            onClick={() => ok()}
            data-testid="dialog-ok"
          >
            {d.confirmLabel ?? (d.kind === 'alert' ? t('OK') : t('Bestätigen'))}
          </button>
        </div>
      </div>
    </div>
  )
}
