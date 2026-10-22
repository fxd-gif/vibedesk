// Lebende Szenen: Hintergründe, die Claude als kleines Skript schreibt (Schnee, der auf dem Dach liegen bleibt,
// Glühwürmchen, die der Maus folgen …). Das Skript läuft abgeschottet in einem Sandbox-iframe.

export const LIVING_PREFIX = 'living:'
/** Skript höchstens so groß – eine Szene ist ein paar Effekte, kein Spiel */
export const LIVING_CODE_MAX = 100_000
export const LIVING_NAME_MAX = 40
export const LIVING_MAX = 40
/** Bild für die Szene höchstens so groß */
export const LIVING_IMAGE_MAX = 25 * 1024 * 1024
export const LIVING_IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp']

export interface LivingScene {
  id: string
  name: string
  /** Bilddatei im Szenenordner (nur Name), sonst malt das Skript alles selbst */
  image: string | null
  /** Bildgröße in Pixeln – Claude rechnet Flächen in Anteilen davon */
  imageSize: { w: number; h: number } | null
  createdAt: number
  /** ändert sich bei jedem Speichern – lädt die Szene neu */
  rev: number
}

/** Rückmeldung der laufenden Szene */
export interface LivingStatus {
  id: string
  rev: number
  ok: boolean
  error?: string
}

export const isLivingScene = (scene: string | undefined): boolean => !!scene && scene.startsWith(LIVING_PREFIX)
export const livingId = (scene: string): string => scene.slice(LIVING_PREFIX.length)
export const validLivingId = (id: unknown): id is string => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,47}$/.test(id)

/** Name → Kennung für Ordner und URL (nur a–z, 0–9, -) */
export function livingSlug(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return s || 'szene'
}

export const cleanLivingName = (x: unknown): string => (typeof x === 'string' ? x.replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, LIVING_NAME_MAX) : '')

/** Skript prüfen: Text, nicht leer, nicht zu groß */
export function checkLivingCode(code: unknown): string | null {
  if (typeof code !== 'string' || !code.trim()) return 'code fehlt: das Szenen-Skript (JavaScript mit der vd-API).'
  if (code.length > LIVING_CODE_MAX) return `code ist zu lang (höchstens ${LIVING_CODE_MAX} Zeichen).`
  return null
}

/** Breite und Höhe aus den ersten Bytes eines PNG, JPEG, GIF, WebP oder BMP – ohne Bildbibliothek */
export function imageSize(b: Uint8Array): { w: number; h: number } | null {
  const u16be = (i: number): number => (b[i] << 8) | b[i + 1]
  const u16le = (i: number): number => b[i] | (b[i + 1] << 8)
  const u32le = (i: number): number => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)) + b[i + 3] * 0x1000000
  const u32be = (i: number): number => b[i] * 0x1000000 + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3])
  if (b.length < 26) return null
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { w: u32be(16), h: u32be(20) }
  // GIF
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { w: u16le(6), h: u16le(8) }
  // BMP
  if (b[0] === 0x42 && b[1] === 0x4d) return { w: u32le(18), h: Math.abs((u32le(22) << 0) | 0) }
  // WebP
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    const kind = String.fromCharCode(b[12], b[13], b[14], b[15])
    if (kind === 'VP8 ' && b.length >= 30) return { w: u16le(26) & 0x3fff, h: u16le(28) & 0x3fff }
    if (kind === 'VP8L' && b.length >= 25) {
      const bits = u32le(21)
      return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 }
    }
    if (kind === 'VP8X' && b.length >= 30) return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) }
    return null
  }
  // JPEG: SOF-Marker suchen
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null
      const m = b[i + 1]
      const len = u16be(i + 2)
      if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) return { w: u16be(i + 7), h: u16be(i + 5) }
      i += 2 + len
    }
  }
  return null
}
