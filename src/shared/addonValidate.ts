// Prüft ein entpacktes Addon vollständig, bevor irgendetwas installiert wird.
import { BLOCKS, capabilitiesOf, walkBlocks, type BlocklyBlock, type FieldSpec } from './addonBlocks'
import { LIMITS, type AddonPackage } from './addonFormat'

export type AssetKind = 'image' | 'sound'

export class AddonInvalidError extends Error {
  constructor(readonly reason: string) {
    super(reason)
  }
}

const ascii = (b: Uint8Array, from: number, len: number): string => String.fromCharCode(...b.subarray(from, from + len))

export function sniffAsset(b: Uint8Array): { kind: AssetKind; mime: string } | null {
  if (b[0] === 0x89 && ascii(b, 1, 3) === 'PNG') return { kind: 'image', mime: 'image/png' }
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { kind: 'image', mime: 'image/jpeg' }
  if (ascii(b, 0, 4) === 'GIF8') return { kind: 'image', mime: 'image/gif' }
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return { kind: 'image', mime: 'image/webp' }
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WAVE') return { kind: 'sound', mime: 'audio/wav' }
  if (ascii(b, 0, 4) === 'OggS') return { kind: 'sound', mime: 'audio/ogg' }
  if (ascii(b, 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { kind: 'sound', mime: 'audio/mpeg' }
  return null
}

const fail = (reason: string): never => {
  throw new AddonInvalidError(reason)
}

const ID_RE = /^[a-z0-9-]{8,64}$/
const ASSET_RE = /^[\w.-]{1,80}$/

function checkText(label: string, v: unknown, min: number, max: number): void {
  if (typeof v !== 'string' || v.length < min || v.length > max) fail(`${label} ist ungültig (${min}–${max} Zeichen).`)
}

function inputAllowed(name: string, allowed: string[]): boolean {
  return allowed.some((a) => (a.endsWith('*') ? new RegExp(`^${a.slice(0, -1)}\\d+$`).test(name) : a === name))
}

function checkField(b: BlocklyBlock, key: string, spec: FieldSpec, v: unknown, assetKinds: Map<string, AssetKind>, vars: Set<string>): void {
  const bad = (): never => fail(`Ungültiger Wert für ${key} in Baustein ${b.type}`)
  switch (spec.kind) {
    case 'enum':
      if (typeof v !== 'string' || !spec.options.includes(v)) bad()
      return
    case 'int':
      if (typeof v !== 'number' || !Number.isInteger(v) || v < spec.min || v > spec.max) bad()
      return
    case 'number':
      if (typeof v !== 'number' || !Number.isFinite(v)) bad()
      return
    case 'text':
      if (typeof v !== 'string' || v.length > spec.maxLen) bad()
      return
    case 'bool':
      if (v !== true && v !== false && v !== 'TRUE' && v !== 'FALSE') bad()
      return
    case 'asset': {
      if (typeof v !== 'string') return bad()
      if (spec.builtins.includes(v)) return
      if (!v.startsWith('asset:') || assetKinds.get(v.slice(6)) !== spec.assetKind) bad()
      return
    }
    case 'variable': {
      const id = typeof v === 'object' && v ? (v as { id?: unknown }).id : undefined
      if (typeof id !== 'string' || !vars.has(id)) fail(`Variable in Baustein ${b.type} fehlt.`)
      return
    }
  }
}

const MAX_BLOCKS = 5000
const MAX_MUTATION = 50

/** Blockly lädt extraState in Schleifen – nur kleine, bekannte Werte zulassen (sonst friert der Maker ein). */
function checkExtraState(b: BlocklyBlock): void {
  const e = b.extraState
  if (e === undefined || e === null) return
  const small = (v: unknown): boolean => v === undefined || (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MAX_MUTATION)
  const bad = (): never => fail(`Ungültige Zusatzdaten in Baustein ${b.type}`)
  if (typeof e !== 'object') return bad()
  const o = e as Record<string, unknown>
  const keys = Object.keys(o)
  if (b.type === 'controls_if') {
    if (keys.some((k) => k !== 'elseIfCount' && k !== 'hasElse') || !small(o.elseIfCount) || (o.hasElse !== undefined && typeof o.hasElse !== 'boolean')) bad()
  } else if (b.type === 'text_join') {
    if (keys.some((k) => k !== 'itemCount') || !small(o.itemCount)) bad()
  } else bad()
}

export function validateAddon(p: AddonPackage): AddonPackage {
  const m = p.manifest
  if (!m || typeof m !== 'object') fail('Manifest fehlt.')
  if (typeof m.id !== 'string' || !ID_RE.test(m.id)) fail('Die ID des Addons ist ungültig.')
  checkText('Name', m.name, 1, 60)
  checkText('Autor', m.author ?? '', 0, 60)
  checkText('Beschreibung', m.description ?? '', 0, 500)
  if (typeof m.version !== 'number' || !Number.isInteger(m.version) || m.version < 1) fail('Versionsnummer ist ungültig.')
  const prompts = m.prompts ?? {}
  if (typeof prompts !== 'object' || Object.keys(prompts).length > 50) fail('Zu viele Prompt-Vorlagen (max. 50).')
  for (const [k, v] of Object.entries(prompts)) {
    checkText('Prompt-Name', k, 1, 60)
    checkText('Prompt-Vorlage', v, 0, 5000)
  }

  const names = Object.keys(p.assets ?? {})
  if (names.length > LIMITS.assets) fail(`Zu viele Dateien im Addon (max. ${LIMITS.assets}).`)
  const assetKinds = new Map<string, AssetKind>()
  for (const name of names) {
    if (!ASSET_RE.test(name) || name.includes('..')) fail(`Ungültiger Dateiname im Addon: ${name}`)
    const data = p.assets[name]
    if (data.length > LIMITS.asset) fail(`Datei zu groß: ${name}`)
    const s = sniffAsset(data)
    if (!s) fail(`Unbekannter Dateityp: ${name}`)
    assetKinds.set(name, s!.kind)
  }

  const vars = new Set((p.program?.variables ?? []).map((v) => v.id))
  let count = 0
  walkBlocks(p.program ?? {}, (b, depth) => {
    if (depth > LIMITS.depth) fail('Das Programm ist zu tief verschachtelt.')
    if (++count > MAX_BLOCKS) fail(`Zu viele Bausteine (max. ${MAX_BLOCKS}).`)
    const spec = Object.hasOwn(BLOCKS, b.type) ? BLOCKS[b.type] : undefined
    if (!spec) fail(`Unbekannter Baustein: ${b.type}`)
    checkExtraState(b)
    for (const [key, v] of Object.entries(b.fields ?? {})) {
      const f = Object.hasOwn(spec!.fields, key) ? spec!.fields[key] : undefined
      if (!f) fail(`Unbekanntes Feld ${key} in Baustein ${b.type}`)
      checkField(b, key, f!, v, assetKinds, vars)
    }
    for (const key of Object.keys(b.inputs ?? {})) {
      if (!inputAllowed(key, [...spec!.inputs, ...spec!.statements])) fail(`Unbekannte Eingabe ${key} in Baustein ${b.type}`)
    }
  })

  return { ...p, manifest: { ...m, prompts, capabilities: capabilitiesOf(p.program ?? {}) } }
}
