import type { VibedeskApi } from '../shared/types'

declare global {
  interface Window {
    vibedesk: VibedeskApi
  }
}
