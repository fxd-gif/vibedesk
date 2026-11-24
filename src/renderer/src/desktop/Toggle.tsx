export function Toggle({ on, onChange, label, testId }: { on: boolean; onChange(v: boolean): void; label: string; testId?: string }): React.JSX.Element {
  return (
    <button className={`toggle${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} data-testid={testId}>
      <i />
    </button>
  )
}
