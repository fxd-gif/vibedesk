export function Toggle({ on, onChange, label }: { on: boolean; onChange(v: boolean): void; label: string }): React.JSX.Element {
  return (
    <button className={`toggle${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
      <i />
    </button>
  )
}
