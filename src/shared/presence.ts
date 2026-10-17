// Discord Rich Presence: Konfiguration + Vorlagen-Rendering (rein, in Main und Renderer nutzbar).

export interface PresenceButton {
  label: string
  url: string
}

export interface PresenceConfig {
  enabled: boolean
  clientId: string
  details: string
  state: string
  idleDetails: string
  idleState: string
  largeImage: string
  largeText: string
  smallImage: string
  smallText: string
  buttons: PresenceButton[]
  timestamp: 'app' | 'session' | 'focus' | 'none'
  /** Projektnamen verbergen */
  privacy: boolean
  /** was Discord in der Mitgliederliste neben dem Namen zeigt */
  statusDisplay: 'name' | 'state' | 'details'
  /** kleines Bild zeigt den Status (arbeitet, wartet, Fokus …), solange kein eigenes gesetzt ist */
  statusIcons: boolean
  /** Lounge-Größe als Party anzeigen („3 von 16“) */
  showParty: boolean
  /** Knopf „VibeDesk holen“ – belegt nur einen freien Platz; fehlt das Feld (alte Settings), gilt an */
  promoButton?: boolean
}

/** Was das Status-Icon zeigt – Fokus-Phasen haben Vorrang vor dem Session-Status. */
export type StatusIconKey = 'working' | 'waiting' | 'done' | 'error' | 'idle' | 'focus' | 'break'

export interface PresenceVars {
  project: string
  sessions: number
  status: string
  model: string
  tokens: string
  cost: string
  context: string
  focus: string
  focusLeft: string
  scene: string
  music: string
  appStart: number
  sessionStart: number | null
  focusEnd: number | null
  statusKey: StatusIconKey | ''
  /** Vibe-Lounge, falls beigetreten – id ist ein Hash, nie der Raumcode selbst */
  lounge: { id: string; size: number; max: number } | null
}

export interface Activity {
  details?: string
  state?: string
  timestamps?: { start?: number; end?: number }
  assets?: { large_image?: string; large_text?: string; small_image?: string; small_text?: string }
  buttons?: PresenceButton[]
  party?: { id: string; size: [number, number] }
  status_display_type?: 0 | 1 | 2
}

/** Wer VibeDesk in deinem Discord-Profil sieht, kommt hierüber zur Seite */
export const PROMO_BUTTON: PresenceButton = { label: 'VibeDesk holen (kostenlos)', url: 'https://fxd-gif.github.io/vibedesk/' }

export const DEFAULT_CLIENT_ID = '1322704722276257822'
/** Öffentlich gehostetes App-Icon – Fallback, wenn kein eigenes großes Bild gesetzt ist */
export const DEFAULT_LARGE_IMAGE = 'https://raw.githubusercontent.com/fxd-gif/vibedesk/main/resources/icon.png'
export const statusIconUrl = (key: StatusIconKey): string => `https://raw.githubusercontent.com/fxd-gif/vibedesk/main/resources/presence/${key}.png`
export const STATUS_ICON_TEXT: Record<StatusIconKey, string> = {
  working: 'arbeitet',
  waiting: 'wartet auf Eingabe',
  done: 'fertig',
  error: 'Fehler',
  idle: 'bereit',
  focus: 'Fokus-Runde',
  break: 'Pause'
}

export const DEFAULT_PRESENCE: PresenceConfig = {
  enabled: false,
  clientId: DEFAULT_CLIENT_ID,
  details: 'Vibecodet an {project}',
  state: '{sessions} · {status}',
  idleDetails: 'Hört Regen & Lofi',
  idleState: 'Bereitet sich vor …',
  largeImage: '',
  largeText: 'VibeDesk · {scene}',
  smallImage: '',
  smallText: '{model}',
  buttons: [],
  timestamp: 'app',
  privacy: false,
  statusDisplay: 'name',
  statusIcons: true,
  showParty: true,
  promoButton: true
}

export const PRESENCE_PRESETS: { id: string; label: string; patch: Partial<PresenceConfig> }[] = [
  { id: 'detailed', label: 'Detailliert', patch: { details: 'Vibecodet an {project} · {model}', state: '{status} · Context {context}', idleDetails: 'Hört Regen & Lofi', idleState: 'Bereitet sich vor …', timestamp: 'session', privacy: false } },
  { id: 'minimal', label: 'Minimal', patch: { details: 'Vibecoding', state: '{status}', idleDetails: 'Vibecoding', idleState: 'Pause', timestamp: 'app' } },
  { id: 'focus', label: 'Fokus', patch: { details: '{focus} · {project}', state: 'Runde läuft – bitte nicht stören', timestamp: 'focus' } },
  { id: 'stats', label: 'Zahlen', patch: { details: '{tokens} Tokens heute', state: '{sessions} · {cost}', timestamp: 'app' } },
  { id: 'private', label: 'Privat', patch: { details: 'Vibecodet an einem Projekt', state: '{status}', privacy: true, timestamp: 'app' } }
]

export const PLACEHOLDERS: { key: keyof PresenceVars; label: string }[] = [
  { key: 'project', label: 'Projekt' },
  { key: 'sessions', label: 'Anzahl Sessions' },
  { key: 'status', label: 'Status' },
  { key: 'model', label: 'Modell' },
  { key: 'tokens', label: 'Tokens heute' },
  { key: 'cost', label: '≈ Kosten heute' },
  { key: 'context', label: 'Context %' },
  { key: 'focus', label: 'Fokus-Phase' },
  { key: 'focusLeft', label: 'Fokus-Restzeit' },
  { key: 'scene', label: 'Ausblick' },
  { key: 'music', label: 'Musik' }
]

const SEP = '·|•–—,:-'
const LEAD = new RegExp(`^[\\s${SEP}]+`)
const TRAIL = new RegExp(`[\\s${SEP}]+$`)
const DOUBLE = /([·|•–—])(\s*[·|•–—])+/g

export function fillTemplate(tpl: string, vars: Partial<PresenceVars>): string {
  const out = tpl.replace(/\{(\w+)\}/g, (m, k: string) => {
    const v = (vars as Record<string, unknown>)[k]
    if (k === 'sessions' && typeof v === 'number') return `${v} ${v === 1 ? 'Session' : 'Sessions'}`
    return v === undefined || v === null ? (k in vars ? '' : m) : String(v)
  })
  return out.replace(/\s+/g, ' ').replace(DOUBLE, '$1').replace(LEAD, '').replace(TRAIL, '').trim()
}

/** Discord verlangt 2–128 Zeichen */
function fit(s: string): string | undefined {
  if (!s) return undefined
  if (s.length > 128) return s.slice(0, 127) + '…'
  return s.length < 2 ? s.padEnd(2, '⠀') : s
}

export function renderPresence(cfg: PresenceConfig, vars: PresenceVars): Activity {
  const v: PresenceVars = cfg.privacy ? { ...vars, project: vars.project ? 'einem geheimen Projekt' : '' } : vars
  const idle = vars.sessions === 0
  const a: Activity = {}
  const details = fit(fillTemplate(idle ? cfg.idleDetails : cfg.details, v))
  const state = fit(fillTemplate(idle ? cfg.idleState : cfg.state, v))
  if (details) a.details = details
  if (state) a.state = state

  const assets: NonNullable<Activity['assets']> = {}
  const large = cfg.largeImage.trim()
  if (large.toLowerCase() !== 'none') assets.large_image = large || DEFAULT_LARGE_IMAGE
  const lt = fit(fillTemplate(cfg.largeText, v))
  if (lt) assets.large_text = lt
  const iconKey = cfg.statusIcons && !cfg.smallImage.trim() ? vars.statusKey : ''
  if (cfg.smallImage.trim()) assets.small_image = cfg.smallImage.trim()
  else if (iconKey) assets.small_image = statusIconUrl(iconKey)
  const st = fit(fillTemplate(cfg.smallText, v)) ?? (iconKey ? fit(STATUS_ICON_TEXT[iconKey]) : undefined)
  if (st) assets.small_text = st
  if (Object.keys(assets).length) a.assets = assets

  const buttons = cfg.buttons
    .filter((b) => b.label.trim() && /^https?:\/\/\S+$/.test(b.url.trim()))
    .slice(0, 2)
    .map((b) => ({ label: b.label.trim().slice(0, 32), url: b.url.trim() }))
  if (cfg.promoButton !== false && buttons.length < 2 && !buttons.some((b) => b.url === PROMO_BUTTON.url)) buttons.push(PROMO_BUTTON)
  if (buttons.length) a.buttons = buttons

  // Party-Größe hängt Discord hinter Zeile 2 an – ohne Zeile 2 zeigt es nichts
  const l = vars.lounge
  if (cfg.showParty && l && l.size > 0 && a.state) a.party = { id: l.id, size: [l.size, Math.max(l.size, l.max)] }

  if (cfg.timestamp === 'app') a.timestamps = { start: vars.appStart }
  else if (cfg.timestamp === 'session') a.timestamps = { start: vars.sessionStart ?? vars.appStart }
  else if (cfg.timestamp === 'focus') a.timestamps = vars.focusEnd ? { end: vars.focusEnd } : { start: vars.appStart }

  a.status_display_type = cfg.statusDisplay === 'state' ? 1 : cfg.statusDisplay === 'details' ? 2 : 0
  return a
}
