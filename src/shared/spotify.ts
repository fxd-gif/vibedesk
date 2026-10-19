// Spotify-Anbindung: Typen und reine Helfer, die Main und Renderer teilen.
// VibeDesk spielt nicht selbst ab, sondern steuert per Web API die Spotify-App (Spotify Connect).

/** Fester Port – Spotify verlangt die Redirect-URI exakt so, wie sie im Developer-Dashboard steht */
export const SPOTIFY_PORT = 43827
export const SPOTIFY_REDIRECT = `http://127.0.0.1:${SPOTIFY_PORT}/callback`
export const SPOTIFY_DASHBOARD = 'https://developer.spotify.com/dashboard'

export const SPOTIFY_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-library-modify'
]

export interface SpotifyStatus {
  connected: boolean
  /** gerade läuft der Login im Browser */
  connecting: boolean
  user?: { name: string; image: string }
}

export interface SpotifyTrack {
  id: string
  uri: string
  name: string
  artists: string
  album: string
  image: string
  durationMs: number
}

export interface SpotifyDevice {
  id: string
  name: string
  type: string
  active: boolean
  /** 0–100, null wenn das Gerät keine Lautstärke kennt */
  volume: number | null
}

export type SpotifyRepeat = 'off' | 'context' | 'track'

export interface SpotifyPlayer {
  device: SpotifyDevice | null
  playing: boolean
  progressMs: number
  track: SpotifyTrack | null
  shuffle: boolean
  repeat: SpotifyRepeat
  /** URI der laufenden Playlist/des Albums */
  context: string | null
  /** Zeitpunkt der Abfrage – für die Fortschrittsanzeige zwischen zwei Abfragen */
  at: number
}

export interface SpotifyPlaylist {
  id: string
  uri: string
  name: string
  image: string
  /** Anzahl Titel, -1 wenn unbekannt */
  total: number
  owner: string
}

export interface SpotifyQueue {
  current: SpotifyTrack | null
  next: SpotifyTrack[]
}

export type SpotifyCommand =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'seek'; ms: number }
  | { type: 'volume'; pct: number }
  | { type: 'shuffle'; on: boolean }
  | { type: 'repeat'; mode: SpotifyRepeat }
  | { type: 'playContext'; uri: string; offsetUri?: string }
  | { type: 'playTracks'; uris: string[]; offsetUri?: string }
  | { type: 'transfer'; deviceId: string; play: boolean }

/** Client-IDs sind 32 Hex-Zeichen */
export const validClientId = (s: string): boolean => /^[0-9a-f]{32}$/i.test(s.trim())

const URI = /^spotify:(track|album|playlist|artist|show|episode|user:[\w.-]+:playlist|collection):?[\w:]*$/
const validUri = (v: unknown): v is string => typeof v === 'string' && v.length < 200 && URI.test(v)
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(n)))

/** Befehl aus dem Renderer prüfen – alles Unbekannte wird verworfen */
export function parseCommand(x: unknown): SpotifyCommand | null {
  if (!x || typeof x !== 'object') return null
  const c = x as Record<string, unknown>
  switch (c.type) {
    case 'play':
    case 'pause':
    case 'next':
    case 'prev':
      return { type: c.type }
    case 'seek':
      return typeof c.ms === 'number' && Number.isFinite(c.ms) ? { type: 'seek', ms: clamp(c.ms, 0, 24 * 3600_000) } : null
    case 'volume':
      return typeof c.pct === 'number' && Number.isFinite(c.pct) ? { type: 'volume', pct: clamp(c.pct, 0, 100) } : null
    case 'shuffle':
      return { type: 'shuffle', on: !!c.on }
    case 'repeat':
      return c.mode === 'off' || c.mode === 'context' || c.mode === 'track' ? { type: 'repeat', mode: c.mode } : null
    case 'playContext':
      if (!validUri(c.uri)) return null
      return {
        type: 'playContext',
        uri: c.uri,
        ...(validUri(c.offsetUri) ? { offsetUri: c.offsetUri } : {})
      }
    case 'playTracks': {
      const uris = Array.isArray(c.uris) ? c.uris.filter(validUri).slice(0, 100) : []
      if (!uris.length) return null
      return {
        type: 'playTracks',
        uris,
        ...(validUri(c.offsetUri) ? { offsetUri: c.offsetUri } : {})
      }
    }
    case 'transfer':
      return typeof c.deviceId === 'string' && /^[\w-]{1,100}$/.test(c.deviceId) ? { type: 'transfer', deviceId: c.deviceId, play: !!c.play } : null
    default:
      return null
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any -- Rohdaten der Spotify-API */
const smallestImage = (imgs: any, min = 120): string => {
  if (!Array.isArray(imgs) || !imgs.length) return ''
  // Bilder kommen absteigend nach Größe – das kleinste, das noch scharf genug ist
  const ok = imgs.filter((i: any) => typeof i?.url === 'string' && (i.width ?? min) >= min)
  return (ok[ok.length - 1] ?? imgs[0])?.url ?? ''
}

export function toTrack(raw: any): SpotifyTrack | null {
  if (!raw || typeof raw !== 'object' || typeof raw.uri !== 'string') return null
  const isEpisode = raw.type === 'episode'
  return {
    id: String(raw.id ?? ''),
    uri: raw.uri,
    name: String(raw.name ?? ''),
    artists: isEpisode
      ? String(raw.show?.name ?? '')
      : Array.isArray(raw.artists)
        ? raw.artists
            .map((a: any) => a?.name)
            .filter(Boolean)
            .join(', ')
        : '',
    album: String((isEpisode ? raw.show?.name : raw.album?.name) ?? ''),
    image: smallestImage(isEpisode ? (raw.images ?? raw.show?.images) : raw.album?.images, 200),
    durationMs: Number(raw.duration_ms) || 0
  }
}

export function toDevice(raw: any): SpotifyDevice | null {
  if (!raw || typeof raw.id !== 'string') return null
  return {
    id: raw.id,
    name: String(raw.name ?? ''),
    type: String(raw.type ?? ''),
    active: !!raw.is_active,
    volume: raw.supports_volume === false || typeof raw.volume_percent !== 'number' ? null : raw.volume_percent
  }
}

export function toPlayer(raw: any, now = Date.now()): SpotifyPlayer | null {
  if (!raw || typeof raw !== 'object') return null
  return {
    device: toDevice(raw.device),
    playing: !!raw.is_playing,
    progressMs: Number(raw.progress_ms) || 0,
    track: toTrack(raw.item),
    shuffle: !!raw.shuffle_state,
    repeat: raw.repeat_state === 'context' || raw.repeat_state === 'track' ? raw.repeat_state : 'off',
    context: typeof raw.context?.uri === 'string' ? raw.context.uri : null,
    at: now
  }
}

export function toPlaylist(raw: any): SpotifyPlaylist | null {
  if (!raw || typeof raw.id !== 'string') return null
  // seit Februar 2026 heißt das Feld „items“, früher „tracks“
  const count = raw.items?.total ?? raw.tracks?.total
  return {
    id: raw.id,
    uri: String(raw.uri ?? `spotify:playlist:${raw.id}`),
    name: String(raw.name ?? ''),
    image: smallestImage(raw.images, 120),
    total: typeof count === 'number' ? count : -1,
    owner: String(raw.owner?.display_name ?? '')
  }
}

/** Ein Eintrag aus /playlists/{id}/items – neu „item“, früher „track“ */
export const toPlaylistItem = (raw: any): SpotifyTrack | null => toTrack(raw?.item ?? raw?.track)
/* eslint-enable @typescript-eslint/no-explicit-any */

export function fmtMs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Fortschritt zwischen zwei Abfragen weiterzählen */
export function liveProgress(p: SpotifyPlayer, now = Date.now()): number {
  const dur = p.track?.durationMs ?? 0
  const ms = p.playing ? p.progressMs + (now - p.at) : p.progressMs
  return dur ? Math.min(dur, ms) : ms
}
