import { renderScene } from '../../ambience/scenes'

/** kleine Vorschaubilder der eingebauten Szenen – einmal gezeichnet, dann gemerkt */
const thumbs = new Map<string, string>()
export function sceneThumb(id: string): string {
  let url = thumbs.get(id)
  if (!url) {
    url = renderScene(id, 192, 108).sharp.toDataURL('image/jpeg', 0.8)
    thumbs.set(id, url)
  }
  return url
}

export function Slider({
  value,
  onChange,
  label,
  max = 1,
  step = 0.01,
  suffix
}: {
  value: number
  onChange(v: number): void
  label: string
  max?: number
  step?: number
  suffix?: string
}): React.JSX.Element {
  return (
    <label className="slider amb-slider" style={{ '--p': `${(value / max) * 100}%` } as React.CSSProperties}>
      <span>{label}</span>
      <input type="range" min={0} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {suffix !== undefined && <em>{suffix}</em>}
    </label>
  )
}
