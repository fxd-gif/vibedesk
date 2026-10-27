// Eigene Musik aus einem Ordner: Dateiliste, Reihenfolge und nächster Titel – reine Helfer für Main und Renderer.

export const MUSIC_SCHEME = 'vibedesk-music'
export const AUDIO_EXTS = ['mp3', 'm4a', 'aac', 'ogg', 'opus', 'wav', 'flac']
/** mehr Titel liest VibeDesk nicht ein – große Ordner bleiben so schnell */
export const MAX_TRACKS = 2000

export type RepeatMode = 'off' | 'all' | 'one'

export interface LocalMusicSettings {
  /** gewählter Ordner ('' = noch keiner) */
  dir: string
  shuffle: boolean
  repeat: RepeatMode
  /** zuletzt gespielter Titel (Pfad relativ zum Ordner, mit /) */
  track: string
  /** grobe Position im Titel in Sekunden */
  position: number
}

export const DEFAULT_LOCAL_MUSIC: LocalMusicSettings = { dir: '', shuffle: false, repeat: 'all', track: '', position: 0 }

export type ScanResult = { ok: true; tracks: string[]; truncated: boolean } | { ok: false; reason: 'missing' | 'empty' | 'denied' }

const MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
  flac: 'audio/flac'
}

const ext = (name: string): string => {
  const i = name.lastIndexOf('.')
  return i < 0 ? '' : name.slice(i + 1).toLowerCase()
}

export const isAudioFile = (name: string): boolean => AUDIO_EXTS.includes(ext(name))
export const audioMime = (name: string): string => MIME[ext(name)] ?? 'application/octet-stream'

/** Ordner-Teil eines Titels ('' = direkt im gewählten Ordner) */
export function trackGroup(rel: string): string {
  const i = rel.lastIndexOf('/')
  return i < 0 ? '' : rel.slice(0, i)
}

/** Anzeigename: Dateiname ohne Endung */
export function trackTitle(rel: string): string {
  const base = rel.slice(rel.lastIndexOf('/') + 1)
  const i = base.lastIndexOf('.')
  return i > 0 ? base.slice(0, i) : base
}

const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' })

/** Nur Audiodateien, ohne Doppelte, Ordner zuerst nach Name, darin „Track 2“ vor „Track 10“ – höchstens limit Titel */
export function filterTracks(paths: string[], limit = MAX_TRACKS): { tracks: string[]; truncated: boolean } {
  const seen = new Set<string>()
  const list: string[] = []
  for (const raw of paths) {
    const p = raw.replace(/\\/g, '/').replace(/^\/+/, '')
    if (!p || !isAudioFile(p) || p.split('/').some((seg) => seg === '..' || seg === '.' || seg === '') || seen.has(p)) continue
    seen.add(p)
    list.push(p)
  }
  list.sort((a, b) => collator.compare(trackGroup(a), trackGroup(b)) || collator.compare(a.slice(a.lastIndexOf('/') + 1), b.slice(b.lastIndexOf('/') + 1)))
  return { tracks: list.slice(0, limit), truncated: list.length > limit }
}

/** Titel nach Unterordnern gruppiert – Reihenfolge wie in der Liste */
export function groupTracks(tracks: string[]): { group: string; items: number[] }[] {
  const out: { group: string; items: number[] }[] = []
  tracks.forEach((rel, i) => {
    const g = trackGroup(rel)
    const last = out[out.length - 1]
    if (last && last.group === g) last.items.push(i)
    else out.push({ group: g, items: [i] })
  })
  return out
}

/** Abspielreihenfolge: geordnet oder gemischt (Fisher-Yates); first steht auf Wunsch vorne */
export function playOrder(n: number, shuffle: boolean, first = -1, rand: () => number = Math.random): number[] {
  const order = Array.from({ length: n }, (_, i) => i)
  if (!shuffle) return order
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = order[i]
    order[i] = order[j]
    order[j] = tmp
  }
  if (first >= 0 && first < n) {
    const at = order.indexOf(first)
    order.splice(at, 1)
    order.unshift(first)
  }
  return order
}

/** nächster Platz in der Reihenfolge – null = Ende (Wiederholen aus); auto = Titel ist von selbst zu Ende */
export function nextPos(pos: number, len: number, repeat: RepeatMode, auto: boolean): number | null {
  if (len <= 0) return null
  if (auto && repeat === 'one') return pos
  if (pos + 1 < len) return pos + 1
  return repeat === 'off' && auto ? null : 0
}

/** vorheriger Platz – nach ein paar Sekunden fängt „Zurück“ erst den Titel neu an */
export function prevPos(pos: number, len: number, elapsed: number): number {
  if (len <= 0) return 0
  if (elapsed > 3) return pos
  return pos > 0 ? pos - 1 : len - 1
}

export const nextRepeat = (r: RepeatMode): RepeatMode => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off')

/** Abspiel-URL für einen Titel – der ganze relative Pfad steckt in einem Segment, damit nichts „normalisiert“ wird */
export const trackUrl = (rel: string): string => `${MUSIC_SCHEME}://track/${encodeURIComponent(rel)}`

/** Gegenstück zu trackUrl: relativer Pfad oder null bei allem Verdächtigen */
export function trackFromUrl(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== MUSIC_SCHEME + ':' || u.host !== 'track') return null
  let rel: string
  try {
    rel = decodeURIComponent(u.pathname.replace(/^\/+/, ''))
  } catch {
    return null
  }
  if (!rel || rel.includes('\\') || rel.includes('\0') || /^[a-zA-Z]:/.test(rel) || rel.startsWith('/')) return null
  if (rel.split('/').some((seg) => seg === '..' || seg === '.' || seg === '')) return null
  return isAudioFile(rel) ? rel : null
}

/** Settings-Feld robust machen (alte oder kaputte Werte) */
export function normalizeLocalMusic(v: unknown): LocalMusicSettings {
  const o = v && typeof v === 'object' ? (v as Partial<LocalMusicSettings>) : {}
  return {
    dir: typeof o.dir === 'string' ? o.dir : '',
    shuffle: o.shuffle === true,
    repeat: o.repeat === 'off' || o.repeat === 'one' ? o.repeat : 'all',
    track: typeof o.track === 'string' ? o.track : '',
    position: typeof o.position === 'number' && Number.isFinite(o.position) && o.position > 0 ? Math.round(o.position) : 0
  }
}

/** 3:07 */
export function fmtSec(s: number): string {
  const v = Math.max(0, Math.floor(Number.isFinite(s) ? s : 0))
  const h = Math.floor(v / 3600)
  const m = Math.floor((v % 3600) / 60)
  const sec = String(v % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}
