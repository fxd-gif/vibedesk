import type { Settings } from '../../../shared/types'

const AUDIBLE = 0.05
const DEFAULT_VOLUME = 0.5

/** Einschalten bei (fast) Lautstärke 0 würde stumm „laufen“ – dann auf 50 % setzen. */
export function toggleMusic(s: Pick<Settings, 'musicOn' | 'musicVolume'>): Partial<Settings> {
  if (s.musicOn) return { musicOn: false }
  return s.musicVolume < AUDIBLE ? { musicOn: true, musicVolume: DEFAULT_VOLUME } : { musicOn: true }
}

export function toggleRainSound(s: Pick<Settings, 'rainSoundOn' | 'rainSoundVolume'>): Partial<Settings> {
  if (s.rainSoundOn) return { rainSoundOn: false }
  return s.rainSoundVolume < AUDIBLE ? { rainSoundOn: true, rainSoundVolume: DEFAULT_VOLUME } : { rainSoundOn: true }
}

export const isMuted = (volume: number): boolean => volume < AUDIBLE
