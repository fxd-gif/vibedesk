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
  /** Zeitpunkt, an dem jemand im Chat !vibedesk geschrieben hat (Info-Karte), sonst null */
  info: number | null
}

export type OverlayPos = 'bl' | 'br' | 'tl' | 'tr'
export type OverlayTheme = 'glass' | 'light' | 'clear'
/** badge = kleine Plakette in der Statuskarte, line = Zeile unter dem Overlay */
export type OverlayCredit = 'badge' | 'line' | 'off'

/** Aussehen des OBS-Overlays – landet als Parameter in der URL, die Seite liest sie selbst */
export interface OverlayLook {
  pos: OverlayPos
  scale: number
  theme: OverlayTheme
  /** Akzentfarbe als #rrggbb */
  accent: string
  /** Breite in px */
  width: number
  /** Deckkraft des Hintergrunds in Prozent (nicht bei 'clear') */
  bg: number
  credit: OverlayCredit
}

export const DEFAULT_LOOK: OverlayLook = { pos: 'bl', scale: 1, theme: 'glass', accent: '#9fb8ff', width: 380, bg: 78, credit: 'badge' }

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

/** Gespeichertes Aussehen bereinigen; alte Settings mit overlayCredit: false behalten „aus“ */
export function lookOf(saved: Partial<OverlayLook> | undefined, legacyCredit?: boolean): OverlayLook {
  const l = { ...DEFAULT_LOOK, ...(saved ?? {}) }
  if (!saved?.credit && legacyCredit === false) l.credit = 'off'
  return {
    pos: (['bl', 'br', 'tl', 'tr'] as const).includes(l.pos) ? l.pos : 'bl',
    scale: clamp(Number(l.scale) || 1, 0.5, 3),
    theme: (['glass', 'light', 'clear'] as const).includes(l.theme) ? l.theme : 'glass',
    accent: /^#[0-9a-f]{6}$/i.test(l.accent) ? l.accent.toLowerCase() : DEFAULT_LOOK.accent,
    width: clamp(Math.round(Number(l.width) || 380), 260, 560),
    bg: clamp(Math.round(Number.isFinite(Number(l.bg)) ? Number(l.bg) : DEFAULT_LOOK.bg), 0, 100),
    credit: (['badge', 'line', 'off'] as const).includes(l.credit) ? l.credit : 'badge'
  }
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

/** URL für die OBS-Browserquelle; nur Abweichungen vom Standard landen als Parameter darin */
export function overlayUrl(port: number, token: string, widgets: string[], look: OverlayLook = DEFAULT_LOOK): string {
  const p: string[] = []
  if (widgets.length && widgets.length < OVERLAY_WIDGETS.length) p.push(`w=${widgets.join(',')}`)
  const l = lookOf(look)
  if (l.pos !== DEFAULT_LOOK.pos) p.push(`pos=${l.pos}`)
  if (l.scale !== DEFAULT_LOOK.scale) p.push(`scale=${l.scale}`)
  if (l.theme !== DEFAULT_LOOK.theme) p.push(`theme=${l.theme}`)
  if (l.accent !== DEFAULT_LOOK.accent) p.push(`accent=${l.accent.slice(1)}`)
  if (l.width !== DEFAULT_LOOK.width) p.push(`width=${l.width}`)
  if (l.bg !== DEFAULT_LOOK.bg) p.push(`bg=${l.bg}`)
  if (l.credit !== DEFAULT_LOOK.credit) p.push(`credit=${l.credit}`)
  return `http://127.0.0.1:${port}/overlay?token=${token}${p.map((x) => '&' + x).join('')}`
}

/** Schreibt jemand genau diesen Befehl in den Chat, zeigt das Overlay kurz, womit gestreamt wird */
export const INFO_COMMAND = '!vibedesk'
export const INFO_SHOW_MS = 20_000
export const INFO_COOLDOWN_MS = 90_000
