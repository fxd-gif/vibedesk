// Lade- und Wartezustände aus Zeichen: Spinner · : ¦ | (in Stufen, steps()) und Fortschritt als [####----].
import { t } from '../../../shared/i18n'
import { asciiBar, asciiPercent } from './progress'

/** Spinner aus Zeichen – dieselbe Optik wie `.spin`, aber mit eigenem, lesbarem Namen für Screenreader */
export function AsciiSpinner({ label }: { label?: string }): React.JSX.Element {
  return <span className="spin" role="status" aria-label={label ?? t('Lädt …')} />
}

/** Fortschritt 0…1 als [####----] mit Prozent daneben */
export function AsciiProgress({ value, width = 10, percent = true }: { value: number; width?: number; percent?: boolean }): React.JSX.Element {
  return (
    <span className="a-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, Math.max(0, value)) * 100)}>
      <b>{asciiBar(value, width)}</b>
      {percent && <span>{asciiPercent(value)}</span>}
    </span>
  )
}
