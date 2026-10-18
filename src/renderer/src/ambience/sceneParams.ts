// Prozedurale Szenen hinter der Scheibe: reine Parameter, deterministisch per Seed.
import { t } from '../../../shared/i18n'

export interface SceneColor {
  hex: string
  warm: boolean
}

export interface SceneLight {
  x: number
  y: number
  /** Radius relativ zur Bildbreite */
  r: number
  color: SceneColor
  alpha: number
}

export interface SceneParams {
  /** Verlauf oben → unten */
  bg: [string, string, string]
  lights: SceneLight[]
  /** 0..1 – Dunst über der Szene */
  fog: number
  fogColor: string
}

/** label übersetzt sich beim Lesen (Getter) – die Liste selbst entsteht beim Import */
export const SCENES: { id: 'city' | 'forest' | 'tokyo'; readonly label: string }[] = [
  {
    id: 'city',
    get label() {
      return t('Stadt bei Nacht')
    }
  },
  {
    id: 'forest',
    get label() {
      return t('Wald in der Dämmerung')
    }
  },
  {
    id: 'tokyo',
    get label() {
      return t('Tokio-Gasse')
    }
  }
]

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const c = (hex: string, warm: boolean): SceneColor => ({ hex, warm })
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

function city(r: () => number): SceneParams {
  const warm = [c('#ffb36b', true), c('#ffd29a', true), c('#ff8a3d', true), c('#fff1d6', true), c('#ff5a4f', true)]
  const cool = [c('#8ab4ff', false), c('#bfd6ff', false), c('#6fe3ff', false)]
  const lights: SceneLight[] = []
  // Straße: Laternen, Scheinwerfer, Rücklichter im unteren Drittel
  for (let i = 0; i < 90; i++) {
    const y = clamp01(0.58 + r() * 0.4)
    lights.push({ x: r(), y, r: 0.012 + r() * 0.05 * (y - 0.4), color: warm[Math.floor(r() * warm.length)], alpha: 0.35 + r() * 0.55 })
  }
  // Bürofenster / ferne Gebäude
  for (let i = 0; i < 70; i++) {
    lights.push({ x: r(), y: clamp01(0.2 + r() * 0.45), r: 0.006 + r() * 0.018, color: r() < 0.6 ? cool[Math.floor(r() * cool.length)] : warm[3], alpha: 0.2 + r() * 0.5 })
  }
  // wenige große, sehr weiche Lichtflecken
  for (let i = 0; i < 8; i++) {
    lights.push({ x: r(), y: clamp01(0.45 + r() * 0.5), r: 0.08 + r() * 0.1, color: warm[Math.floor(r() * 3)], alpha: 0.12 + r() * 0.12 })
  }
  return { bg: ['#070b16', '#0d1424', '#1a1410'], lights, fog: 0.25, fogColor: '#1b2333' }
}

function forest(r: () => number): SceneParams {
  const lights: SceneLight[] = []
  for (let i = 0; i < 6; i++)
    lights.push({ x: 0.15 + r() * 0.7, y: clamp01(0.55 + r() * 0.2), r: 0.01 + r() * 0.02, color: c('#ffbf7a', true), alpha: 0.4 + r() * 0.4 })
  for (let i = 0; i < 10; i++)
    lights.push({ x: r(), y: clamp01(0.1 + r() * 0.3), r: 0.06 + r() * 0.12, color: c('#9fc7c0', false), alpha: 0.05 + r() * 0.08 })
  return { bg: ['#0c1518', '#0a1512', '#050907'], lights, fog: 0.62, fogColor: '#2a3a3a' }
}

function tokyo(r: () => number): SceneParams {
  const neon = [c('#ff3cac', true), c('#2de2e6', false), c('#9d4dff', false), c('#ffd166', true), c('#ff6b6b', true)]
  const lights: SceneLight[] = []
  // senkrechte Neonschilder links/rechts
  for (let s = 0; s < 6; s++) {
    const x = s < 3 ? 0.04 + r() * 0.22 : 0.74 + r() * 0.22
    const col = neon[s % neon.length]
    const top = 0.1 + r() * 0.3
    for (let i = 0; i < 12; i++)
      lights.push({ x: clamp01(x + (r() - 0.5) * 0.02), y: clamp01(top + i * 0.03), r: 0.012 + r() * 0.012, color: col, alpha: 0.5 + r() * 0.4 })
  }
  // Gasse: Laternen und Reflexionen
  for (let i = 0; i < 50; i++)
    lights.push({ x: 0.2 + r() * 0.6, y: clamp01(0.5 + r() * 0.48), r: 0.01 + r() * 0.04, color: neon[Math.floor(r() * neon.length)], alpha: 0.25 + r() * 0.5 })
  for (let i = 0; i < 6; i++)
    lights.push({ x: r(), y: clamp01(0.3 + r() * 0.6), r: 0.1 + r() * 0.1, color: neon[i % 2], alpha: 0.08 + r() * 0.1 })
  return { bg: ['#0b0614', '#120a1e', '#07040c'], lights, fog: 0.3, fogColor: '#1e1030' }
}

export function sceneParams(id: string, seed: number): SceneParams {
  const r = rng(seed)
  if (id === 'forest') return forest(r)
  if (id === 'tokyo') return tokyo(r)
  return city(r)
}
