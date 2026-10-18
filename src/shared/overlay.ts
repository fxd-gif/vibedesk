// Daten für das OBS-Overlay (Streamer-Modus). Der Renderer schwärzt alles, bevor es hier landet.
import { t } from './i18n'
import type { SessionStatus } from './types'

export interface OverlayState {
  status: SessionStatus | 'none'
  statusText: string
  project: string
  /** aktuell laufendes Tool, z. B. „Edit · src/app.ts“ */
  current: string
  feed: { tool: string; target: string; result: 'pending' | 'ok' | 'fail' | 'stopped' }[]
  todos: { content: string; status: 'pending' | 'in_progress' | 'completed' }[]
  focus: { phase: 'work' | 'short' | 'long'; leftMs: number } | null
  sessionStart: number | null
  model: string
  tokens: string
  cost: string
  shoutout: { by: string; text: string; ts: number } | null
  suggestions: number
  lounge: number
}

// label als Getter: übersetzt beim Lesen, nicht beim Import
export const OVERLAY_WIDGETS = [
  {
    id: 'status',
    get label() {
      return t('Status')
    }
  },
  {
    id: 'todos',
    get label() {
      return t('Todos')
    }
  },
  {
    id: 'feed',
    get label() {
      return t('Live-Feed')
    }
  },
  {
    id: 'focus',
    get label() {
      return t('Fokus-Timer')
    }
  },
  {
    id: 'stats',
    get label() {
      return t('Zeit & Tokens')
    }
  },
  {
    id: 'chat',
    get label() {
      return t('Chat-Shoutout')
    }
  }
] as const

export type OverlayWidget = (typeof OVERLAY_WIDGETS)[number]['id']

export function overlayUrl(port: number, token: string, widgets: string[], credit = true): string {
  const w = widgets.length && widgets.length < OVERLAY_WIDGETS.length ? `&w=${widgets.join(',')}` : ''
  return `http://127.0.0.1:${port}/overlay?token=${token}${w}${credit ? '' : '&credit=0'}`
}
