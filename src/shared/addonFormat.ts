// Binärformat .vibeaddon: "VIBEADDON" + Version + Flags, danach deflate(zip ohne Kompression).
// Das doppelte Packen versteckt auch die Dateinamen – Verschleierung, keine Verschlüsselung.
import { t } from './i18n'
import { deflateSync, Inflate, strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import type { BlocklyProgram, Capability } from './addonBlocks'

export interface AddonManifest {
  id: string
  name: string
  author: string
  description: string
  version: number
  formatVersion: 1
  createdWith: string
  capabilities: Capability[]
  prompts: Record<string, string>
}

export interface AddonPackage {
  manifest: AddonManifest
  program: BlocklyProgram
  assets: Record<string, Uint8Array>
}

export type AddonFormatCode = 'not-addon' | 'too-new' | 'corrupt' | 'too-large'

export class AddonFormatError extends Error {
  constructor(
    readonly code: AddonFormatCode,
    message = FORMAT_MESSAGES[code]
  ) {
    super(message)
  }
}

/** Getter: übersetzt beim Lesen, nicht beim Import */
export const FORMAT_MESSAGES: Record<AddonFormatCode, string> = {
  get 'not-addon'() {
    return t('Diese Datei ist kein gültiges VibeDesk-Addon.')
  },
  get 'too-new'() {
    return t('Dieses Addon braucht eine neuere VibeDesk-Version.')
  },
  get corrupt() {
    return t('Diese Datei ist kein gültiges VibeDesk-Addon.')
  },
  get 'too-large'() {
    return t('Dieses Addon ist zu groß.')
  }
}

export const MAGIC = 'VIBEADDON'
export const FORMAT_VERSION = 1
const HEADER = 11
const MiB = 2 ** 20
export const LIMITS = { file: 25 * MiB, asset: 10 * MiB, assets: 50, unpacked: 120 * MiB, depth: 64 }
const CHUNK = 16 * 1024

export function encodeAddon(p: AddonPackage): Uint8Array {
  const files: Zippable = {
    'manifest.json': strToU8(JSON.stringify(p.manifest)),
    'program.json': strToU8(JSON.stringify(p.program))
  }
  for (const [name, bytes] of Object.entries(p.assets)) files['assets/' + name] = bytes
  const body = deflateSync(zipSync(files, { level: 0 }), { level: 6 })
  const out = new Uint8Array(HEADER + body.length)
  out.set(strToU8(MAGIC), 0)
  out[9] = FORMAT_VERSION
  out[10] = 0
  out.set(body, HEADER)
  return out
}

/** Entpackt in kleinen Stücken und bricht ab, sobald mehr als LIMITS.unpacked herauskäme. */
function inflateLimited(data: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = []
  let total = 0
  const inf = new Inflate()
  inf.ondata = (chunk) => {
    total += chunk.length
    if (total > LIMITS.unpacked) throw new AddonFormatError('too-large')
    parts.push(chunk)
  }
  try {
    for (let i = 0; i < data.length; i += CHUNK) inf.push(data.subarray(i, i + CHUNK), i + CHUNK >= data.length)
    if (data.length === 0) inf.push(new Uint8Array(0), true)
  } catch (e) {
    if (e instanceof AddonFormatError) throw e
    throw new AddonFormatError('corrupt')
  }
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

export function decodeAddon(bytes: Uint8Array): AddonPackage {
  if (bytes.length < HEADER || strFromU8(bytes.subarray(0, 9)) !== MAGIC) throw new AddonFormatError('not-addon')
  if (bytes[9] > FORMAT_VERSION) throw new AddonFormatError('too-new')
  if (bytes[9] < 1) throw new AddonFormatError('not-addon')
  if (bytes.length > LIMITS.file) throw new AddonFormatError('too-large')

  const zip = inflateLimited(bytes.subarray(HEADER))
  let files: Record<string, Uint8Array>
  let sum = 0
  try {
    files = unzipSync(zip, {
      // Angaben im Zip stammen vom Ersteller und können lügen: nur unkomprimierte Einträge (wie encodeAddon sie schreibt),
      // deren tatsächliche Größe zur Angabe passt und die sich nicht überlappen – sonst wäre eine innere Zip-Bombe möglich.
      filter: (f) => {
        if (f.compression !== 0 || f.size !== f.originalSize) throw new AddonFormatError('corrupt')
        sum += f.size
        if (f.size > LIMITS.asset || sum > LIMITS.unpacked) throw new AddonFormatError('too-large')
        if (sum > zip.length) throw new AddonFormatError('corrupt')
        return true
      }
    })
  } catch (e) {
    if (e instanceof AddonFormatError) throw e
    throw new AddonFormatError('corrupt')
  }

  const manifest = files['manifest.json']
  const program = files['program.json']
  if (!manifest || !program) throw new AddonFormatError('corrupt')
  const assets: Record<string, Uint8Array> = {}
  for (const [name, data] of Object.entries(files)) {
    if (name.startsWith('assets/') && name.length > 7) assets[name.slice(7)] = data
  }
  try {
    return { manifest: JSON.parse(strFromU8(manifest)), program: JSON.parse(strFromU8(program)), assets }
  } catch {
    throw new AddonFormatError('corrupt')
  }
}

/** Assets installierter Addons: vibedesk-addon://<id>/<datei> */
export const ADDON_SCHEME = 'vibedesk-addon'
