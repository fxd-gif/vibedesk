// VibeDesk als MCP-Werkzeug: Claude kann den Desktop steuern (Fenster anordnen, Zen, Szene, Musik …).
// Hier wird geprüft, was erlaubt ist – ausgeführt wird im Renderer.
import type { LayoutTheme, PanelId } from './types'

export const DESK_SCENES = ['city', 'forest', 'tokyo'] as const
export const DESK_THEMES = ['scene', 'vibedesk', 'wald', 'neon', 'kontrast', 'mono'] as const
export const DESK_WINDOWS: PanelId[] = ['projects', 'inspector', 'git', 'brain', 'merge', 'ambience', 'focus', 'prompts', 'skills', 'addons', 'companion', 'discord', 'lounge', 'streamer', 'settings']

export type DeskCommand =
  | { cmd: 'arrange' }
  | { cmd: 'tidy' }
  | { cmd: 'zen'; on?: boolean }
  | { cmd: 'scene'; scene?: string; rain?: number; blur?: number }
  | { cmd: 'music'; music?: 'lofi' | 'off'; volume?: number; rainSound?: boolean }
  | { cmd: 'open'; window: PanelId }
  | { cmd: 'layout'; layout: LayoutTheme }
  | { cmd: 'theme'; theme: string }
  | { cmd: 'focus'; action: 'start' | 'pause' | 'resume' | 'stop' }
  | { cmd: 'notify'; title: string; body: string }

const num = (x: unknown, min: number, max: number): number | undefined => (typeof x === 'number' && Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : undefined)
const oneOf = <T extends string>(x: unknown, list: readonly T[]): T | undefined => (typeof x === 'string' && (list as readonly string[]).includes(x) ? (x as T) : undefined)
const text = (x: unknown, max: number): string => (typeof x === 'string' ? x.replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max) : '')

/** MCP-Aufruf desk_* → geprüfter Befehl oder Fehlertext für Claude */
export function parseDeskCommand(tool: string, raw: unknown): DeskCommand | { error: string } {
  const a = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  switch (tool) {
    case 'desk_arrange':
      return { cmd: 'arrange' }
    case 'desk_tidy':
      return { cmd: 'tidy' }
    case 'desk_zen':
      return { cmd: 'zen', ...(typeof a.on === 'boolean' ? { on: a.on } : {}) }
    case 'desk_scene': {
      const scene = oneOf(a.scene, DESK_SCENES)
      if (a.scene !== undefined && !scene) return { error: `Unbekannte Szene. Erlaubt: ${DESK_SCENES.join(', ')}` }
      const rain = num(a.rain, 0, 1)
      const blur = num(a.blur, 0, 1)
      if (!scene && rain === undefined && blur === undefined) return { error: 'Gib scene, rain oder blur an.' }
      return { cmd: 'scene', ...(scene ? { scene } : {}), ...(rain !== undefined ? { rain } : {}), ...(blur !== undefined ? { blur } : {}) }
    }
    case 'desk_music': {
      const music = oneOf(a.music, ['lofi', 'off'] as const)
      const volume = num(a.volume, 0, 100)
      const rainSound = typeof a.rainSound === 'boolean' ? a.rainSound : undefined
      if (!music && volume === undefined && rainSound === undefined) return { error: 'Gib music, volume oder rainSound an.' }
      return { cmd: 'music', ...(music ? { music } : {}), ...(volume !== undefined ? { volume } : {}), ...(rainSound !== undefined ? { rainSound } : {}) }
    }
    case 'desk_open': {
      const window = oneOf(a.window, DESK_WINDOWS)
      return window ? { cmd: 'open', window } : { error: `Unbekanntes Fenster. Erlaubt: ${DESK_WINDOWS.join(', ')}` }
    }
    case 'desk_layout': {
      const layout = oneOf(a.layout, ['desktop', 'studio'] as const)
      return layout ? { cmd: 'layout', layout } : { error: 'layout muss desktop oder studio sein.' }
    }
    case 'desk_terminal_theme': {
      const theme = oneOf(a.theme, DESK_THEMES)
      return theme ? { cmd: 'theme', theme } : { error: `Unbekanntes Farbschema. Erlaubt: ${DESK_THEMES.join(', ')}` }
    }
    case 'desk_focus': {
      const action = oneOf(a.action, ['start', 'pause', 'resume', 'stop'] as const)
      return action ? { cmd: 'focus', action } : { error: 'action muss start, pause, resume oder stop sein.' }
    }
    case 'desk_notify': {
      const title = text(a.title, 80)
      return title ? { cmd: 'notify', title, body: text(a.body, 240) } : { error: 'title fehlt.' }
    }
    default:
      return { error: `Unbekanntes Werkzeug: ${tool}` }
  }
}

/** Antwort an Claude: was ausgelöst wurde */
export function deskDone(c: DeskCommand): string {
  switch (c.cmd) {
    case 'arrange':
      return 'Fenster werden neu angeordnet.'
    case 'tidy':
      return 'Übrige Fenster wandern ins Dock, der Rest wird angeordnet.'
    case 'zen':
      return c.on === false ? 'Zen-Modus aus.' : c.on ? 'Zen-Modus an.' : 'Zen-Modus umgeschaltet.'
    case 'scene':
      return 'Atmosphäre angepasst.'
    case 'music':
      return 'Musik angepasst.'
    case 'open':
      return `Fenster „${c.window}“ geöffnet.`
    case 'layout':
      return `Aufbau: ${c.layout}.`
    case 'theme':
      return `Terminal-Farbschema: ${c.theme}.`
    case 'focus':
      return `Fokus-Timer: ${c.action}.`
    case 'notify':
      return 'Karte angezeigt.'
  }
}
