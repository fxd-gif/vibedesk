// Daten für das OBS-Overlay (Streamer-Modus). Der Renderer schwärzt alles, bevor es hier landet.
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

export const OVERLAY_WIDGETS = [
  { id: 'status', label: 'Status' },
  { id: 'todos', label: 'Todos' },
  { id: 'feed', label: 'Live-Feed' },
  { id: 'focus', label: 'Fokus-Timer' },
  { id: 'stats', label: 'Zeit & Tokens' },
  { id: 'chat', label: 'Chat-Shoutout' }
] as const

export type OverlayWidget = (typeof OVERLAY_WIDGETS)[number]['id']

export function overlayUrl(port: number, token: string, widgets: string[]): string {
  const w = widgets.length && widgets.length < OVERLAY_WIDGETS.length ? `&w=${widgets.join(',')}` : ''
  return `http://127.0.0.1:${port}/overlay?token=${token}${w}`
}
