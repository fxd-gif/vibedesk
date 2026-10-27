// Share-Codes: Prompts, Skills, Atmosphären und lebende Szenen als kopierbarer Text (vibe1:…) – kein Server nötig.
// Rein und in Main + Renderer nutzbar. Alles Eingehende ist fremd: streng prüfen, Größen begrenzen.
import { t } from './i18n'
import { cleanLivingName, LIVING_CODE_MAX, LIVING_NAME_MAX, LIVING_SHARE_MAX } from './living'
import { deflateSync, Inflate, strFromU8, strToU8 } from 'fflate'

export const SHARE_PREFIX = 'vibe1:'
/** Discord-Nachrichten fassen 2000 Zeichen (Nitro 4000) – längere Codes macht Discord zur Datei. */
export const DISCORD_LIMIT = 2000
const MAX_CODE = 400_000
const MAX_RAW = 2 * 1024 * 1024
const MAX_FILES = 200

export interface SharedPrompt {
  title: string
  text: string
}

export interface SharedFile {
  path: string
  /** UTF-8-Text – oder base64, wenn die Datei binär ist */
  text?: string
  b64?: string
}

export interface SharedAmbience {
  scene: string
  rainIntensity: number
  blur: number
  rainSoundOn: boolean
  rainSoundVolume: number
  musicOn: boolean
  musicVolume: number
  streamUrl: string
}

/** Lebende Szene ohne Bild – das bleibt privat beim Absender */
export interface SharedScene {
  name: string
  /** Szenen-Skript (läuft beim Empfänger in derselben Sandbox wie eigene Szenen) */
  code: string
  /** Die Szene war für ein eigenes Bild gemacht */
  needsImage: boolean
  /** Größe des Bildes beim Absender – nur zur Info */
  imageSize: { w: number; h: number } | null
}

export type ShareData =
  | { kind: 'prompts'; prompts: SharedPrompt[] }
  | { kind: 'skill'; name: string; description: string; files: SharedFile[] }
  | { kind: 'ambience'; ambience: SharedAmbience }
  | { kind: 'scene'; scene: SharedScene }

export type ShareEnvelope = ShareData & { from?: string }

export class ShareError extends Error {}

// ---------- base64url (Node + Browser) ----------

function toB64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const toB64Url = (b: Uint8Array): string => toB64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromB64Url = (s: string): Uint8Array => fromB64(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))

/** Entpackt mit harter Obergrenze – schützt vor „Zip-Bomben“ in fremden Codes. */
function inflateLimited(data: Uint8Array, limit: number): Uint8Array {
  const parts: Uint8Array[] = []
  let total = 0
  let over = false
  const inf = new Inflate((chunk) => {
    total += chunk.length
    if (total > limit) over = true
    else parts.push(chunk)
  })
  // kleine Häppchen: Deflate vervielfacht höchstens ~1000×, so bleibt jeder Schritt klein
  for (let i = 0; i < data.length && !over; i += 1024) inf.push(data.subarray(i, i + 1024), i + 1024 >= data.length)
  if (over) throw new ShareError(t('Der Code ist zu groß.'))
  const out = new Uint8Array(total)
  let o = 0
  for (const p of parts) (out.set(p, o), (o += p.length))
  return out
}

// ---------- Bereinigen ----------

/** Steuer- und Richtungszeichen entfernen (verhindert z. B. umgedrehten Text zum Täuschen). */
export function cleanText(s: unknown, max: number, multiline = false): string {
  if (typeof s !== 'string') return ''
  const ctrl = multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g : /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g
  return s.replace(ctrl, '').slice(0, max)
}

export const safeRelPath = (rel: string): boolean =>
  !!rel && rel.length <= 240 && !rel.startsWith('/') && !rel.includes('\\') && !/^[a-zA-Z]:/.test(rel) && !rel.split('/').some((s) => s === '..' || s === '' || s === '.')

const num01 = (x: unknown, d: number): number => (typeof x === 'number' && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : d)
const bool = (x: unknown, d: boolean): boolean => (typeof x === 'boolean' ? x : d)
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {})

function validate(raw: unknown): ShareEnvelope {
  const o = obj(raw)
  if (o.v !== 1) throw new ShareError(t('Dieser Code stammt aus einer neueren VibeDesk-Version.'))
  const from = cleanText(o.from, 40).trim() || undefined
  const d = obj(o.data)
  switch (o.kind) {
    case 'prompts': {
      const list = Array.isArray(d.prompts) ? d.prompts : []
      const prompts = list
        .slice(0, 50)
        .map((p) => ({ title: cleanText(obj(p).title, 120).trim(), text: cleanText(obj(p).text, 20_000, true) }))
        .filter((p) => p.text.trim())
      if (!prompts.length) throw new ShareError(t('Der Code enthält keine Prompts.'))
      return { kind: 'prompts', prompts, from }
    }
    case 'skill': {
      const name = cleanText(d.name, 64).trim()
      const description = cleanText(d.description, 1024).trim()
      const list = Array.isArray(d.files) ? d.files : []
      if (!name || !list.length || list.length > MAX_FILES) throw new ShareError(t('Der Skill im Code ist unvollständig.'))
      const files: SharedFile[] = []
      const seen = new Set<string>()
      for (const f of list) {
        const fo = obj(f)
        const path = typeof fo.path === 'string' ? fo.path : ''
        if (!safeRelPath(path) || seen.has(path.toLowerCase())) throw new ShareError(t('Ungültiger Dateipfad im Skill: {path}', { path: cleanText(path, 80) }))
        seen.add(path.toLowerCase())
        if (typeof fo.text === 'string') files.push({ path, text: fo.text })
        else if (typeof fo.b64 === 'string' && /^[A-Za-z0-9+/=]*$/.test(fo.b64)) files.push({ path, b64: fo.b64 })
        else throw new ShareError(t('Datei ohne Inhalt im Skill: {path}', { path: cleanText(path, 80) }))
      }
      if (!files.some((f) => f.path === 'SKILL.md' && f.text !== undefined)) throw new ShareError(t('Dem Skill fehlt die SKILL.md.'))
      return { kind: 'skill', name, description, files, from }
    }
    case 'ambience': {
      const a = obj(d.ambience)
      const scene = cleanText(a.scene, 40)
      const url = cleanText(a.streamUrl, 500).trim()
      if (!/^[a-z0-9-]+$/.test(scene)) throw new ShareError(t('Unbekannter Ausblick im Code.'))
      return {
        kind: 'ambience',
        from,
        ambience: {
          scene,
          rainIntensity: num01(a.rainIntensity, 0.6),
          blur: num01(a.blur, 0.6),
          rainSoundOn: bool(a.rainSoundOn, true),
          rainSoundVolume: num01(a.rainSoundVolume, 0.35),
          musicOn: bool(a.musicOn, true),
          musicVolume: num01(a.musicVolume, 0.5),
          streamUrl: /^https?:\/\/[^\s]+$/.test(url) ? url : ''
        }
      }
    }
    case 'scene': {
      const sc = obj(d.scene)
      const name = cleanLivingName(cleanText(sc.name, LIVING_NAME_MAX * 2))
      // das Skript bleibt unverändert – es läuft ohnehin nur abgeschottet
      const code = typeof sc.code === 'string' ? sc.code : ''
      if (!name || !code.trim()) throw new ShareError(t('Die Szene im Code ist unvollständig.'))
      if (code.length > LIVING_CODE_MAX) throw new ShareError(t('Der Code ist zu groß.'))
      const sz = obj(sc.imageSize)
      const dim = (x: unknown): number => (typeof x === 'number' && Number.isInteger(x) && x > 0 && x <= 50_000 ? x : 0)
      const w = dim(sz.w)
      const h = dim(sz.h)
      return { kind: 'scene', from, scene: { name, code, needsImage: bool(sc.needsImage, false), imageSize: w && h ? { w, h } : null } }
    }
    default:
      throw new ShareError(t('Unbekannter Code-Typ.'))
  }
}

// ---------- öffentlich ----------

export function encodeShare(e: ShareEnvelope): string {
  const { from, ...data } = e
  const { kind, ...rest } = data
  const json = JSON.stringify({ v: 1, kind, from: from || undefined, data: rest })
  const code = SHARE_PREFIX + toB64Url(deflateSync(strToU8(json), { level: 9 }))
  if (kind === 'scene' && code.length > LIVING_SHARE_MAX) throw new ShareError(t('Die Szene ist zu groß zum Teilen.'))
  return code
}

export function decodeShare(code: string): ShareEnvelope {
  const c = code.trim().replace(/\s+/g, '')
  if (!c.toLowerCase().startsWith(SHARE_PREFIX)) throw new ShareError(t('Das ist kein VibeDesk-Code (er beginnt mit „vibe1:“).'))
  const body = c.slice(SHARE_PREFIX.length)
  if (body.length > MAX_CODE) throw new ShareError(t('Der Code ist zu groß.'))
  if (!/^[A-Za-z0-9_-]+$/.test(body)) throw new ShareError(t('Der Code ist beschädigt – wurde er vollständig kopiert?'))
  let json: unknown
  try {
    json = JSON.parse(strFromU8(inflateLimited(fromB64Url(body), MAX_RAW)))
  } catch (err) {
    if (err instanceof ShareError) throw err
    throw new ShareError(t('Der Code ist beschädigt – wurde er vollständig kopiert?'))
  }
  const env = validate(json)
  if (env.kind === 'scene' && c.length > LIVING_SHARE_MAX) throw new ShareError(t('Der Code ist zu groß.'))
  return env
}

/** Findet den ersten Share-Code in beliebigem Text (Chat, Discord-Nachricht …). */
export function findShareCode(text: string): string | null {
  const m = /vibe1:[A-Za-z0-9_-]{8,}/i.exec(text)
  return m ? m[0] : null
}

const RISKY = /\.(sh|bash|zsh|ps1|psm1|bat|cmd|exe|dll|msi|com|scr|vbs|js|mjs|cjs|ts|py|rb|pl|php|jar|lnk|reg)$/i

/** Dateien, die Code enthalten und von Claude ausgeführt werden könnten. */
export function riskyFiles(files: SharedFile[]): string[] {
  return files.filter((f) => RISKY.test(f.path)).map((f) => f.path)
}

export function fileBytes(f: SharedFile): Uint8Array {
  return f.text !== undefined ? strToU8(f.text) : fromB64(f.b64 ?? '')
}

/** Datei für den Share-Code: Text, wenn gültiges UTF-8, sonst base64. */
export function toSharedFile(path: string, data: Uint8Array): SharedFile {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(data)
    if (!text.includes('\u0000')) return { path, text }
  } catch {
    // binär
  }
  return { path, b64: toB64(data) }
}

/** Getter: übersetzt beim Lesen, nicht beim Import */
export const SHARE_KIND_LABEL: Record<ShareData['kind'], string> = {
  get prompts() {
    return t('Prompts')
  },
  get skill() {
    return t('Skill')
  },
  get ambience() {
    return t('Atmosphäre')
  },
  get scene() {
    return t('Lebende Szene')
  }
}
