// Werkzeug-Fenster: kleine Anwendungen, die Claude für den User baut (Dashboard, Rechner, Übersicht …).
// Sie laufen wie lebende Szenen abgeschottet im Sandbox-iframe – ohne Netz, ohne Dateien, ohne VibeDesk-API.
// Daten bekommen sie nur lesend über eine schmale Brücke (Sessions, Gehirn, Verbrauch) und einen eigenen kleinen Speicher.
import { livingSlug, validLivingId } from './living'

export interface DeskApp {
  id: string
  name: string
  /** ein Satz: wofür das Fenster da ist (Mehr-Menü, Palette) */
  hint: string
  /** Fenstergröße beim ersten Öffnen */
  w: number
  h: number
  createdAt: number
  /** ändert sich bei jedem Speichern – lädt das Fenster neu */
  rev: number
}

/** Rückmeldung eines laufenden Werkzeug-Fensters */
export interface AppStatus {
  id: string
  rev: number
  ok: boolean
  error?: string
}

/** Fenster-ID im Desktop: app:<id> */
export const APP_WIN = 'app:'
export const appWin = (id: string): string => APP_WIN + id
export const isAppWin = (win: string): boolean => win.startsWith(APP_WIN)

export const APP_MAX = 40
export const APP_NAME_MAX = 40
export const APP_HINT_MAX = 120
/** Markup + Skript + CSS zusammen – ein Werkzeug, keine ganze Web-App */
export const APP_CODE_MAX = 150_000
/** eigener Speicher (vd.store) pro Fenster */
export const APP_STORE_MAX = 200_000

/** Was ein Werkzeug-Fenster lesen darf – mehr nicht */
export const APP_DATA = ['sessions', 'brain', 'usage', 'project'] as const
export type AppDataKind = (typeof APP_DATA)[number]
export const isAppDataKind = (x: unknown): x is AppDataKind => typeof x === 'string' && (APP_DATA as readonly string[]).includes(x)

export const validAppId = validLivingId
export const appSlug = (name: string): string => livingSlug(name).replace(/^szene$/, 'werkzeug')

const clampSize = (v: unknown, min: number, max: number, def: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v))) : def)
export const appSize = (w: unknown, h: unknown): { w: number; h: number } => ({ w: clampSize(w, 280, 1400, 560), h: clampSize(h, 200, 1000, 440) })

export function cleanAppText(raw: unknown, max: number): string {
  return typeof raw === 'string' ? raw.replace(/[\r\n\t]+/g, ' ').trim().slice(0, max) : ''
}

/** Prüft, was Claude schickt. Meldung für Claude oder null. */
export function checkAppInput(a: { html?: unknown; code?: unknown; css?: unknown }): string | null {
  for (const k of ['html', 'code', 'css'] as const) if (a[k] !== undefined && typeof a[k] !== 'string') return `${k} muss Text sein.`
  const html = (a.html as string | undefined) ?? ''
  const code = (a.code as string | undefined) ?? ''
  const css = (a.css as string | undefined) ?? ''
  if (!html.trim() && !code.trim()) return 'html oder code fehlt: das Markup und/oder das Skript des Fensters.'
  if (html.length + code.length + css.length > APP_CODE_MAX) return `Zusammen zu lang (höchstens ${APP_CODE_MAX} Zeichen) – ein Werkzeug-Fenster soll klein bleiben.`
  if (/<script[\s>]/i.test(html)) return 'Kein <script> im html – Skript gehört in code (Inline-Skripte blockiert die Sicherheitsrichtlinie).'
  if (/\son[a-z]+\s*=/i.test(html)) return 'Keine Inline-Handler wie onclick="…" im html – nutze in code addEventListener (Inline-Handler blockiert die Sicherheitsrichtlinie).'
  return null
}

/** Adressen, unter denen abgeschottete Rahmen laufen (lebende Szenen, ihre Vorschau, Werkzeug-Fenster) – sie dürfen nirgendwo anders hin */
export const isSandboxFrameUrl = (url: string): boolean => /^vibedesk-scene:\/\/(living|living-preview|app)\//i.test(url)

/** Name, den es noch nicht gibt */
export function uniqueAppName(name: string, taken: string[]): string {
  const have = new Set(taken.map((x) => x.trim().toLowerCase()))
  if (!have.has(name.trim().toLowerCase())) return name
  for (let n = 2; ; n++) if (!have.has(`${name} (${n})`.toLowerCase())) return `${name} (${n})`
}
