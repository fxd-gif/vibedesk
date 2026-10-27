// Zweiter Bildschirm (Beta): welche Fenster hinüber dürfen, welcher Monitor es wird und was beim nächsten Start zurückkommt.
import type { PanelId, SessionInfo, SessionStats } from './types'

/** Werkzeug-Fenster, die im Zweitfenster laufen dürfen – sie starten keine Sessions, spielen nichts ab und brauchen keine Addon-Laufzeit */
export const SECOND_PANELS: readonly PanelId[] = ['inspector', 'git', 'brain', 'prompts', 'skills']

const PREVIEW_RE = /^preview:[\w-]{1,40}$/

/** Browser-Vorschau (Fenster-ID „preview:…“) */
export const isPreviewItem = (id: string): boolean => PREVIEW_RE.test(id)

/** darf dieses Fenster auf den anderen Bildschirm? Terminals bewusst nicht – ihr Datenstrom gehört dem Hauptfenster */
export function isMovable(id: unknown): id is string {
  return typeof id === 'string' && ((SECOND_PANELS as readonly string[]).includes(id) || PREVIEW_RE.test(id))
}

/** diese Ereignisse schickt Main zusätzlich ans Zweitfenster – Terminal-Daten, Befehle an den Desktop usw. nicht */
export const SECOND_CHANNELS: ReadonlySet<string> = new Set(['hook:event', 'session:exit', 'stats:update', 'brain:changed', 'brain:pulse', 'budget:usage'])

export interface ScreenItem {
  id: string
  /** nur bei Vorschauen: die Adresse */
  url?: string
}

export type MoveTarget = 'second' | 'main' | 'closed'

export interface ScreenState {
  /** gibt es einen Monitor für das Zweitfenster (oder ist es schon offen)? */
  available: boolean
  open: boolean
  items: ScreenItem[]
  /** nur ans Hauptfenster: diese Fenster kommen gerade zurück */
  returned?: ScreenItem[]
}

/** gemerkt in den Einstellungen */
export interface SecondScreenSettings {
  panels: PanelId[]
}

/** Stand aus dem Hauptfenster, den das Zweitfenster anzeigt (Sessions, Vorhang, oberstes Terminal) */
export interface ScreenMirror {
  sessions: SessionInfo[]
  external: SessionInfo[]
  curtain: boolean
  /** offene Terminal-Fenster im Hauptfenster, oberstes zuletzt */
  terms: string[]
  /** einmalig beim Öffnen: Ablauf aller Sessions (Feed, Todos, Agents) */
  workflow?: unknown
  stats?: Record<string, SessionStats>
}

/** was das Zweitfenster nicht selbst tun darf – das Hauptfenster erledigt es */
export type ScreenAction =
  | { kind: 'open'; id: string }
  | { kind: 'focus'; id: string }
  | { kind: 'prompt'; projectId: string; text: string }
  | { kind: 'editor'; path: string; find?: string; line?: number }
  | { kind: 'askPreview'; url: string; text: string }
  | { kind: 'addon'; event: { type: 'commit'; message: string; project?: string } | { type: 'preview_error'; text: string } }
  | { kind: 'curtain'; on: boolean }
  | { kind: 'wrapped' }

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface DisplayLike {
  id: number
  bounds: Rect
  workArea: Rect
}

/** Monitor fürs Zweitfenster: der zuletzt benutzte, sonst der erste (von links) neben dem des Hauptfensters */
export function pickDisplay<D extends DisplayLike>(displays: D[], mainId: number, preferred?: number | null): D | null {
  const others = displays.filter((d) => d.id !== mainId && d.workArea.width > 0 && d.workArea.height > 0)
  if (!others.length) return null
  return others.find((d) => d.id === preferred) ?? [...others].sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)[0]
}

const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {})
const str = (x: unknown, max: number): string | null => (typeof x === 'string' && x.length <= max ? x : null)

const MAX_URL = 2000
const MAX_TEXT = 50_000

/** Eintrag aus dem Renderer prüfen: nur erlaubte Fenster, Vorschau nur mit http(s)-Adresse (oder leer) */
export function cleanItem(raw: unknown): ScreenItem | null {
  const o = obj(raw)
  if (!isMovable(o.id)) return null
  if (!isPreviewItem(o.id)) return { id: o.id }
  const url = str(o.url, MAX_URL)
  return { id: o.id, url: url && /^https?:\/\//i.test(url) ? url : '' }
}

/** Fenster hinüber (ersetzt einen gleichen Eintrag) oder zurück bzw. geschlossen (fällt raus) */
export function moveItem(items: ScreenItem[], item: ScreenItem, to: MoveTarget): ScreenItem[] {
  const rest = items.filter((x) => x.id !== item.id)
  return to === 'second' ? [...rest, item] : rest
}

/** gemerkt werden nur Werkzeug-Fenster – Vorschauen hängen an Dev-Servern, die nach dem Neustart nicht mehr laufen */
export function persisted(items: ScreenItem[]): PanelId[] {
  return items.filter((x) => !isPreviewItem(x.id)).map((x) => x.id as PanelId)
}

/** Einstellungen aus der Datei: nur erlaubte Fenster, jedes einmal */
export function normalizeSecondScreen(raw: unknown): SecondScreenSettings {
  const list = obj(raw).panels
  const ok = (x: unknown): x is PanelId => typeof x === 'string' && (SECOND_PANELS as readonly string[]).includes(x)
  return { panels: [...new Set(Array.isArray(list) ? list.filter(ok) : [])] }
}

/** Start: gemerkte Fenster kommen nur auf den zweiten Bildschirm, wenn es ihn gibt – sonst bleiben sie im Hauptfenster */
export function restoreItems(saved: unknown, available: boolean): ScreenItem[] {
  return available ? normalizeSecondScreen(saved).panels.map((id) => ({ id })) : []
}

/** Hauptfenster: was muss hier zugehen? Werkzeug-Fenster immer, Vorschauen nur, wenn sie gerade hinübergewandert sind */
export function hideInMain(prev: ScreenItem[], next: ScreenItem[]): string[] {
  return next.filter((x) => !isPreviewItem(x.id) || !prev.some((p) => p.id === x.id)).map((x) => x.id)
}

/** Zweitfenster: neu angekommene und verschwundene Einträge */
export function screenDiff(prev: ScreenItem[], next: ScreenItem[]): { added: ScreenItem[]; removed: string[] } {
  return {
    added: next.filter((x) => !prev.some((p) => p.id === x.id && p.url === x.url)),
    removed: prev.filter((p) => !next.some((x) => x.id === p.id)).map((p) => p.id)
  }
}

/** Auftrag aus dem Zweitfenster prüfen, bevor Main ihn ans Hauptfenster weitergibt */
export function cleanAction(raw: unknown): ScreenAction | null {
  const o = obj(raw)
  switch (o.kind) {
    case 'open':
    case 'focus': {
      const id = str(o.id, 200)
      return id ? { kind: o.kind, id } : null
    }
    case 'prompt': {
      const projectId = str(o.projectId, 200)
      const text = str(o.text, MAX_TEXT)
      return projectId && text?.trim() ? { kind: 'prompt', projectId, text } : null
    }
    case 'editor': {
      const path = str(o.path, 2000)
      if (!path) return null
      const find = str(o.find, MAX_TEXT) ?? undefined
      const line = typeof o.line === 'number' && Number.isInteger(o.line) && o.line > 0 ? o.line : undefined
      return { kind: 'editor', path, ...(find !== undefined ? { find } : {}), ...(line !== undefined ? { line } : {}) }
    }
    case 'askPreview': {
      const url = str(o.url, MAX_URL)
      const text = str(o.text, MAX_TEXT)
      return url !== null && text?.trim() ? { kind: 'askPreview', url, text } : null
    }
    case 'addon': {
      const e = obj(o.event)
      if (e.type === 'commit') {
        const message = str(e.message, 2000)
        const project = str(e.project, 200) ?? undefined
        return message !== null ? { kind: 'addon', event: { type: 'commit', message, ...(project ? { project } : {}) } } : null
      }
      if (e.type === 'preview_error') {
        const text = str(e.text, 2000)
        return text !== null ? { kind: 'addon', event: { type: 'preview_error', text } } : null
      }
      return null
    }
    case 'curtain':
      return typeof o.on === 'boolean' ? { kind: 'curtain', on: o.on } : null
    case 'wrapped':
      return { kind: 'wrapped' }
    default:
      return null
  }
}
