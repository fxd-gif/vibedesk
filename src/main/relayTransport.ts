// Weg, über den das Handy den PC aus dem Internet erreicht. Heute ein Cloudflare-Quick-Tunnel (kostenlos,
// Link wechselt bei jedem Start). Vorgesehen ist ein zweiter Weg: ein eigener VibeDesk-Relay mit fester
// Adresse und Push – der muss nur diese Schnittstelle erfüllen, der Handy-Begleiter bleibt unverändert.
import type { TunnelState } from '../shared/companion'
import { QuickTunnel } from './cloudflareTunnel'

export interface RelayTransport {
  readonly state: TunnelState
  /** öffentliche Adresse ohne abschließenden Schrägstrich, sobald erreichbar */
  readonly url: string | null
  readonly error: string | null
  /** lokaler Port, zu dem gerade verbunden werden soll (null = aus) */
  readonly wanted: number | null
  start(port: number): Promise<void>
  stop(): void
}

/** onChange: bei jedem Zustandswechsel (Fenster und QR-Code aktualisieren) */
export function createRelay(onChange: () => void): RelayTransport {
  return new QuickTunnel(onChange)
}
