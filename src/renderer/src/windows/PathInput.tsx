import { useEffect, useState } from 'react'
import { api } from '../api'

interface Props {
  value: string
  onChange(v: string): void
  onSubmit(v: string): void
  placeholder?: string
  autoFocus?: boolean
}

/** Pfad-Eingabe mit Ordner-Vorschlägen und Drag & Drop eines Ordners – ersetzt den Windows-Ordnerdialog. */
export function PathInput({ value, onChange, onSubmit, placeholder, autoFocus }: Props): React.JSX.Element {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [sel, setSel] = useState(-1)
  const [over, setOver] = useState(false)

  useEffect(() => {
    let alive = true
    api.fs.suggestDirs(value).then((s) => alive && (setSuggestions(s.filter((x) => x !== value)), setSel(-1)))
    return () => {
      alive = false
    }
  }, [value])

  return (
    <div
      className={`path-input${over ? ' over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const f = e.dataTransfer.files[0]
        if (f) onChange(api.fs.pathForFile(f))
      }}
    >
      <input
        className="field mono"
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder ?? 'C:\\Users\\…  (oder Ordner hierher ziehen)'}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setSel((i) => Math.min(suggestions.length - 1, i + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setSel((i) => Math.max(-1, i - 1))
          } else if (e.key === 'Tab' && suggestions.length) {
            e.preventDefault()
            onChange(suggestions[Math.max(0, sel)] + '\\')
          } else if (e.key === 'Enter') {
            if (sel >= 0) onChange(suggestions[sel] + '\\')
            else onSubmit(value)
          }
        }}
      />
      {suggestions.length > 0 && (
        <ul className="path-suggest">
          {suggestions.map((s, i) => (
            <li key={s} className={i === sel ? 'sel' : ''} onPointerDown={(e) => (e.preventDefault(), onChange(s + '\\'))}>
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
