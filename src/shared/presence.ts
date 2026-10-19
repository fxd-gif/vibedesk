// Discord Rich Presence: Konfiguration + Vorlagen-Rendering (rein, in Main und Renderer nutzbar).
import { t, tn } from './i18n'

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
  /** Knopf „VibeDesk holen“ – steht vorn, eigene Knöpfe bekommen den zweiten Platz; fehlt das Feld (alte Settings), gilt an */
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
  /** was Claude gerade tut („schreibt Code“) – siehe doingText */
  doing: string
  /** laufende Aufgabe aus Claudes Todo-Liste; im Privat-Modus leer */
  task: string
  /** erledigt/gesamt der Todo-Liste, z. B. „3/7“ */
  progress: string
  /** Tage am Stück mit Tokens */
  streak: number
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
export const PROMO_BUTTON: PresenceButton = {
  get label() {
    return t('VibeDesk holen (kostenlos)')
  },
  url: 'https://fxd-gif.github.io/vibedesk/'
}

export const DEFAULT_CLIENT_ID = '1322704722276257822'
/** Öffentlich gehostetes App-Icon – Fallback, wenn kein eigenes großes Bild gesetzt ist */
export const DEFAULT_LARGE_IMAGE = 'https://raw.githubusercontent.com/fxd-gif/vibedesk/main/resources/icon.png'
export const statusIconUrl = (key: StatusIconKey): string => `https://raw.githubusercontent.com/fxd-gif/vibedesk/main/resources/presence/${key}.png`
/** Getter: übersetzt beim Lesen, nicht beim Import */
export const STATUS_ICON_TEXT: Record<StatusIconKey, string> = {
  get working() {
    return t('arbeitet')
  },
  get waiting() {
    return t('wartet auf Eingabe')
  },
  get done() {
    return t('fertig')
  },
  get error() {
    return t('Fehler')
  },
  get idle() {
    return t('bereit')
  },
  get focus() {
    return t('Fokus-Runde')
  },
  get break() {
    return t('Pause')
  }
}

export const DEFAULT_PRESENCE: PresenceConfig = {
  enabled: false,
  clientId: DEFAULT_CLIENT_ID,
  details: 'Vibecodet an {project}',
  state: '{doing} || {task} · {progress} || {streak}',
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

/** Vorlagen fürs Discord-Fenster – als Funktion, damit sie in der gewählten Sprache entstehen */
export const presencePresets = (): { id: string; label: string; patch: Partial<PresenceConfig> }[] => [
  {
    id: 'live',
    label: t('Live'),
    patch: { details: t('Vibecodet an {project}'), state: '{doing} || {task} · {progress} || {streak}', idleDetails: t('Hört Regen & Lofi'), idleState: t('Bereitet sich vor …') + ' || {streak}', timestamp: 'session', privacy: false }
  },
  {
    id: 'detailed',
    label: t('Detailliert'),
    patch: { details: t('Vibecodet an {project} · {model}'), state: t('{status} · Context {context}'), idleDetails: t('Hört Regen & Lofi'), idleState: t('Bereitet sich vor …'), timestamp: 'session', privacy: false }
  },
  { id: 'minimal', label: t('Minimal'), patch: { details: 'Vibecoding', state: '{status}', idleDetails: 'Vibecoding', idleState: t('Pause'), timestamp: 'app' } },
  { id: 'focus', label: t('Fokus'), patch: { details: '{focus} · {project}', state: t('Runde läuft – bitte nicht stören'), timestamp: 'focus' } },
  { id: 'stats', label: t('Zahlen'), patch: { details: t('{tokens} Tokens heute'), state: '{sessions} · {cost} || {streak}', timestamp: 'app' } },
  { id: 'private', label: t('Privat'), patch: { details: t('Vibecodet an einem Projekt'), state: '{status}', privacy: true, timestamp: 'app' } }
]

// label als Getter: übersetzt beim Lesen, nicht beim Import
export const PLACEHOLDERS: { key: keyof PresenceVars; readonly label: string }[] = [
  {
    key: 'project',
    get label() {
      return t('Projekt')
    }
  },
  {
    key: 'sessions',
    get label() {
      return t('Anzahl Sessions')
    }
  },
  {
    key: 'status',
    get label() {
      return t('Status')
    }
  },
  {
    key: 'doing',
    get label() {
      return t('Was Claude gerade tut')
    }
  },
  {
    key: 'task',
    get label() {
      return t('Aktuelle Aufgabe')
    }
  },
  {
    key: 'progress',
    get label() {
      return t('Aufgaben erledigt (3/7)')
    }
  },
  {
    key: 'streak',
    get label() {
      return t('Tage am Stück')
    }
  },
  {
    key: 'model',
    get label() {
      return t('Modell')
    }
  },
  {
    key: 'tokens',
    get label() {
      return t('Tokens heute')
    }
  },
  {
    key: 'cost',
    get label() {
      return t('≈ Kosten heute')
    }
  },
  {
    key: 'context',
    get label() {
      return t('Context %')
    }
  },
  {
    key: 'focus',
    get label() {
      return t('Fokus-Phase')
    }
  },
  {
    key: 'focusLeft',
    get label() {
      return t('Fokus-Restzeit')
    }
  },
  {
    key: 'scene',
    get label() {
      return t('Ausblick')
    }
  },
  {
    key: 'music',
    get label() {
      return t('Musik')
    }
  }
]

const SEP = '·|•–—,:-'
const LEAD = new RegExp(`^[\\s${SEP}]+`)
const TRAIL = new RegExp(`[\\s${SEP}]+$`)
const DOUBLE = /([·|•–—])(\s*[·|•–—])+/g

export function fillTemplate(tpl: string, vars: Partial<PresenceVars>): string {
  const out = tpl.replace(/\{(\w+)\}/g, (m, k: string) => {
    const v = (vars as Record<string, unknown>)[k]
    if (k === 'sessions' && typeof v === 'number') return tn(v, '{n} Session', '{n} Sessions')
    if (k === 'streak' && typeof v === 'number') return v > 1 ? tn(v, '🔥 {n} Tag am Stück', '🔥 {n} Tage am Stück') : ''
    return v === undefined || v === null ? (k in vars ? '' : m) : String(v)
  })
  return out.replace(/\s+/g, ' ').replace(DOUBLE, '$1').replace(LEAD, '').replace(TRAIL, '').trim()
}

/** So lange steht eine Variante, bevor die nächste kommt (Discord erlaubt 5 Updates pro 20 s) */
export const ROTATE_MS = 20_000

/** Varianten mit „||“ trennen – leere fallen weg, die übrigen wechseln sich ab */
export function pickVariant(tpl: string, vars: Partial<PresenceVars>, now: number): string {
  const all = tpl.split('||').map((x) => fillTemplate(x, vars)).filter(Boolean)
  return all.length ? all[Math.floor(now / ROTATE_MS) % all.length] : ''
}

const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead'])
const RUN_TOOLS = new Set(['Bash', 'PowerShell', 'BashOutput', 'KillShell'])
const WEB_TOOLS = new Set(['WebSearch', 'WebFetch'])
const PLAN_TOOLS = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate', 'EnterPlanMode', 'ExitPlanMode'])

/** Klartext für {doing}: was Claude in der aktiven Session gerade macht – nie Dateinamen oder Befehle. */
export function doingText(o: { status: string; tool?: string; agents: number; tending?: boolean }): string {
  if (o.status === 'waiting') return t('wartet auf dich')
  if (o.status === 'done') return t('ist fertig')
  if (o.status === 'error') return t('hängt an einem Fehler')
  if (o.status !== 'working') return t('bereit')
  if (o.tending) return t('pflegt das Gehirn')
  if (o.agents > 0) return tn(o.agents, 'schickt {n} Agent los', 'schickt {n} Agents los')
  const tool = o.tool ?? ''
  if (WRITE_TOOLS.has(tool)) return t('schreibt Code')
  if (READ_TOOLS.has(tool)) return t('liest Code')
  if (RUN_TOOLS.has(tool)) return t('führt Befehle aus')
  if (WEB_TOOLS.has(tool)) return t('recherchiert im Web')
  if (PLAN_TOOLS.has(tool)) return t('plant die nächsten Schritte')
  if (tool.startsWith('mcp__')) return t('nutzt Werkzeuge')
  return t('denkt nach')
}

/** Tage am Stück mit Tokens; ein noch leeres Heute bricht die Serie nicht. Tage aufsteigend, das letzte ist heute. */
export function streakDays(days: { tokens: number }[]): number {
  let i = days.length - 1
  if (i >= 0 && !days[i].tokens) i--
  let n = 0
  while (i >= 0 && days[i].tokens > 0) {
    n++
    i--
  }
  return n
}

/** Discord verlangt 2–128 Zeichen */
function fit(s: string): string | undefined {
  if (!s) return undefined
  if (s.length > 128) return s.slice(0, 127) + '…'
  return s.length < 2 ? s.padEnd(2, '⠀') : s
}

export function renderPresence(cfg: PresenceConfig, vars: PresenceVars, now = Date.now()): Activity {
  // Aufgaben-Texte verraten oft das Projekt – im Privat-Modus fallen sie weg
  const v: PresenceVars = cfg.privacy ? { ...vars, project: vars.project ? t('einem geheimen Projekt') : '', task: '' } : vars
  const idle = vars.sessions === 0
  const a: Activity = {}
  const details = fit(pickVariant(idle ? cfg.idleDetails : cfg.details, v, now))
  const state = fit(pickVariant(idle ? cfg.idleState : cfg.state, v, now))
  if (details) a.details = details
  if (state) a.state = state

  const assets: NonNullable<Activity['assets']> = {}
  const large = cfg.largeImage.trim()
  if (large.toLowerCase() !== 'none') assets.large_image = large || DEFAULT_LARGE_IMAGE
  const lt = fit(pickVariant(cfg.largeText, v, now))
  if (lt) assets.large_text = lt
  const iconKey = cfg.statusIcons && !cfg.smallImage.trim() ? vars.statusKey : ''
  if (cfg.smallImage.trim()) assets.small_image = cfg.smallImage.trim()
  else if (iconKey) assets.small_image = statusIconUrl(iconKey)
  const st = fit(pickVariant(cfg.smallText, v, now)) ?? (iconKey ? fit(STATUS_ICON_TEXT[iconKey]) : undefined)
  if (st) assets.small_text = st
  if (Object.keys(assets).length) a.assets = assets

  const own = cfg.buttons
    .filter((b) => b.label.trim() && /^https?:\/\/\S+$/.test(b.url.trim()))
    .map((b) => ({ label: b.label.trim().slice(0, 32), url: b.url.trim() }))
  // Werbeknopf steht vorn, eigene Knöpfe füllen den zweiten Platz (ein eigener mit derselben Adresse fällt weg)
  const buttons = (cfg.promoButton !== false ? [{ ...PROMO_BUTTON }, ...own.filter((b) => b.url !== PROMO_BUTTON.url)] : own).slice(0, 2)
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
