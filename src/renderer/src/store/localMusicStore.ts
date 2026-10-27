// Eigene Musik: Ordner einlesen und Titel abspielen – hört wie das Lofi-Radio auf musicOn, Musik-Lautstärke und Fokus-Pausen.
import { create } from 'zustand'
import { api } from '../api'
import { ambienceAudio } from '../ambience/audio'
import { toggleMusic } from '../ambience/toggles'
import { useSettings } from './settingsStore'
import { useSpotify } from './spotifyStore'
import { nextPos, nextRepeat, playOrder, prevPos, trackUrl, type ScanResult } from '../../../shared/localMusic'
import type { Settings } from '../../../shared/types'

export type LocalStatus = 'idle' | 'loading' | 'ready' | 'missing' | 'empty'

interface LocalMusicState {
  /** eingelesener Ordner */
  dir: string
  status: LocalStatus
  tracks: string[]
  truncated: boolean
  /** Abspielreihenfolge (Indizes in tracks) und Platz darin */
  order: number[]
  pos: number
  time: number
  duration: number
  playing: boolean
  /** zuletzt übersprungener Titel, der sich nicht abspielen ließ */
  failed: string
}

const FADE_MS = 800
const SAVE_MS = 30_000
const MAX_ERRORS = 5

let audio: HTMLAudioElement | null = null
/** Titel, der gerade im Audio-Element steckt ('' = keiner) */
let loadedRel = ''
let resumeAt = 0
let fadeRaf = 0
let errors = 0
let lastSave = 0
let wantOn = false
let volume = 0.5

export const useLocalMusic = create<LocalMusicState>(() => ({
  dir: '',
  status: 'idle',
  tracks: [],
  truncated: false,
  order: [],
  pos: 0,
  time: 0,
  duration: 0,
  playing: false,
  failed: ''
}))

const get = useLocalMusic.getState
const set = useLocalMusic.setState

/** aktueller Titel (relativer Pfad) oder '' */
export function currentTrack(st: LocalMusicState = get()): string {
  const i = st.order[st.pos]
  return i === undefined ? '' : (st.tracks[i] ?? '')
}

const settings = (): Settings | null => useSettings.getState().s

function remember(position: number): void {
  const s = settings()
  const track = currentTrack()
  if (!s || !track) return
  lastSave = Date.now()
  const pos = Math.max(0, Math.round(position))
  if (s.localMusic.track === track && Math.abs(s.localMusic.position - pos) < 2) return
  useSettings.getState().set({ localMusic: { ...s.localMusic, track, position: pos } })
}

function el(): HTMLAudioElement {
  if (audio) return audio
  const a = new Audio()
  a.preload = 'auto'
  a.volume = 0
  a.addEventListener('timeupdate', () => {
    set({ time: a.currentTime })
    if (!a.paused && Date.now() - lastSave > SAVE_MS) remember(a.currentTime)
  })
  a.addEventListener('durationchange', () => set({ duration: Number.isFinite(a.duration) ? a.duration : 0 }))
  a.addEventListener('playing', () => {
    errors = 0
    set({ playing: true, failed: '' })
  })
  a.addEventListener('pause', () => set({ playing: false }))
  a.addEventListener('ended', () => advance(true))
  a.addEventListener('error', () => {
    if (loadedRel) onError()
  })
  audio = a
  return a
}

const target = (): number => volume * ambienceAudio.duck

function fadeTo(to: number, done?: () => void): void {
  cancelAnimationFrame(fadeRaf)
  const a = audio
  if (!a) return done?.()
  const from = a.volume
  const start = performance.now()
  const step = (now: number): void => {
    const k = Math.min(1, (now - start) / FADE_MS)
    a.volume = Math.max(0, Math.min(1, from + (to - from) * (k * k * (3 - 2 * k))))
    if (k < 1) fadeRaf = requestAnimationFrame(step)
    else done?.()
  }
  fadeRaf = requestAnimationFrame(step)
}

function stopAudio(): void {
  cancelAnimationFrame(fadeRaf)
  loadedRel = ''
  if (!audio) return
  audio.pause()
  audio.removeAttribute('src')
  audio.load()
  set({ playing: false })
}

/** Abspielen oder anhalten, je nachdem ob Musik an ist und eigene Musik der Player ist */
function apply(): void {
  const st = get()
  const rel = currentTrack(st)
  if (wantOn && st.status === 'ready' && rel) {
    const a = el()
    if (loadedRel !== rel) {
      loadedRel = rel
      const at = resumeAt
      resumeAt = 0
      a.src = trackUrl(rel)
      if (at > 0) a.addEventListener('loadedmetadata', () => (a.currentTime = Math.min(at, Math.max(0, (a.duration || at) - 1))), { once: true })
      set({ time: at, duration: 0 })
    }
    if (a.paused) a.play().catch(() => undefined)
    fadeTo(target())
  } else if (audio && !audio.paused) {
    fadeTo(0, () => {
      audio?.pause()
      remember(audio?.currentTime ?? 0)
    })
  }
}

ambienceAudio.onDuck(() => {
  if (wantOn && audio && !audio.paused) fadeTo(target())
})

/** Musik einschalten und eigene Musik zum Player machen – Spotify hält dafür an */
function turnOn(): void {
  const s = settings()
  if (!s) return
  if (!(s.musicOn && s.musicPlayer === 'local')) {
    const sp = useSpotify.getState()
    if (sp.player?.playing) void sp.cmd({ type: 'pause' })
    const patch = s.musicOn ? {} : toggleMusic(s)
    useSettings.getState().set({ ...patch, musicPlayer: 'local' })
    volume = patch.musicVolume ?? s.musicVolume
  }
  wantOn = true
}

function goTo(pos: number): void {
  set({ pos, time: 0, duration: 0 })
  loadedRel = ''
  resumeAt = 0
  if (audio && !wantOn) stopAudio()
  apply()
  remember(0)
}

function advance(auto: boolean): void {
  const st = get()
  const repeat = settings()?.localMusic.repeat ?? 'all'
  const p = nextPos(st.pos, st.order.length, repeat, auto)
  if (p === null) {
    // Ende der Liste ohne Wiederholen: ruhig aufhören, beim nächsten Abspielen geht es vorne los
    set({ pos: 0, time: 0 })
    stopAudio()
    remember(0)
    useSettings.getState().set({ musicOn: false })
    return
  }
  if (p === st.pos && audio && loadedRel) {
    audio.currentTime = 0
    void audio.play().catch(() => undefined)
    return
  }
  goTo(p)
}

function onError(): void {
  const st = get()
  errors++
  set({ failed: currentTrack(st), playing: false })
  if (errors >= Math.min(MAX_ERRORS, st.order.length)) {
    // mehrere Titel hintereinander kaputt – vielleicht ist der Ordner weg: anhalten und neu nachsehen
    errors = 0
    stopAudio()
    useSettings.getState().set({ musicOn: false })
    void load(st.dir)
    return
  }
  const p = nextPos(st.pos, st.order.length, 'all', false)
  if (p !== null) goTo(p)
}

/** Ordner einlesen – bleibt der Ordner gleich, läuft der aktuelle Titel weiter, wenn es ihn noch gibt */
export async function load(dir: string): Promise<void> {
  const same = dir === get().dir
  const keep = same ? currentTrack() : ''
  if (!keep) stopAudio()
  set({ dir, status: dir ? 'loading' : 'idle', ...(keep ? {} : { tracks: [], order: [], pos: 0, time: 0, duration: 0 }) })
  if (!dir) return
  const r: ScanResult = await api.music.scan(dir).catch((): ScanResult => ({ ok: false, reason: 'missing' }))
  if (get().dir !== dir) return
  if (!r.ok) {
    stopAudio()
    set({ status: r.reason === 'empty' ? 'empty' : 'missing', tracks: [], order: [], pos: 0 })
    return
  }
  const lm = settings()?.localMusic
  let idx = r.tracks.indexOf(keep || (lm?.track ?? ''))
  if (keep && idx < 0) stopAudio()
  if (!keep) resumeAt = idx >= 0 ? (lm?.position ?? 0) : 0
  if (idx < 0) idx = 0
  const order = playOrder(r.tracks.length, !!lm?.shuffle, idx)
  set({ status: 'ready', tracks: r.tracks, truncated: r.truncated, order, pos: order.indexOf(idx) })
  apply()
}

/** aus App: Einstellungen haben sich geändert */
export function syncLocalMusic(s: Settings): void {
  volume = s.musicVolume
  wantOn = s.musicOn && s.musicPlayer === 'local'
  const dir = s.localMusic.dir
  // eingelesen wird erst, wenn eigene Musik spielen soll oder das Fenster sie zeigt
  if (dir !== get().dir && (wantOn || get().dir)) void load(dir)
  else apply()
}

export const localMusic = {
  /** Fenster zeigt den Reiter: Ordner bei Bedarf einlesen */
  ensure(dir: string): void {
    if (dir !== get().dir || get().status === 'idle') void load(dir)
  },
  async pickDir(): Promise<void> {
    const dir = await api.music.pickDir()
    const s = settings()
    if (!dir || !s) return
    remember(audio?.currentTime ?? 0)
    useSettings.getState().set({ localMusic: { ...s.localMusic, dir, track: '', position: 0 } })
    await load(dir)
  },
  rescan(): void {
    remember(audio?.currentTime ?? 0)
    void load(get().dir)
  },
  toggle(): void {
    const s = settings()
    if (!s) return
    if (s.musicOn && s.musicPlayer === 'local') {
      useSettings.getState().set({ musicOn: false })
      wantOn = false
      apply()
      return
    }
    turnOn()
    apply()
  },
  playIndex(i: number): void {
    const st = get()
    let pos = st.order.indexOf(i)
    if (pos < 0) return
    if (settings()?.localMusic.shuffle) {
      // im Zufallsmodus geht es nach dem gewählten Titel gemischt weiter
      const order = playOrder(st.tracks.length, true, i)
      set({ order })
      pos = 0
    }
    turnOn()
    goTo(pos)
  },
  next(): void {
    const st = get()
    const p = nextPos(st.pos, st.order.length, 'all', false)
    if (p !== null) goTo(p)
  },
  prev(): void {
    const st = get()
    const p = prevPos(st.pos, st.order.length, audio && loadedRel ? audio.currentTime : st.time)
    if (p === st.pos) return localMusic.seek(0)
    goTo(p)
  },
  seek(sec: number): void {
    if (audio && loadedRel && loadedRel === currentTrack()) audio.currentTime = sec
    else resumeAt = sec
    set({ time: sec })
  },
  setShuffle(on: boolean): void {
    const s = settings()
    const st = get()
    if (!s) return
    const idx = st.order[st.pos] ?? 0
    const order = playOrder(st.tracks.length, on, idx)
    set({ order, pos: Math.max(0, order.indexOf(idx)) })
    useSettings.getState().set({ localMusic: { ...s.localMusic, shuffle: on } })
  },
  cycleRepeat(): void {
    const s = settings()
    if (s) useSettings.getState().set({ localMusic: { ...s.localMusic, repeat: nextRepeat(s.localMusic.repeat) } })
  }
}
