import type { VibedeskApi } from '../../shared/types'

export const api: VibedeskApi = window.vibedesk

/** Entfernt Electrons "Error invoking remote method '…': Error: "-Präfix. */
export function errorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '')
}
