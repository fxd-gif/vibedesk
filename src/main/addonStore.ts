import fs from 'fs'
import path from 'path'
import { CAPABILITY_LABELS } from '../shared/addonBlocks'
import { ADDON_SCHEME, decodeAddon, encodeAddon, type AddonManifest, type AddonPackage } from '../shared/addonFormat'
import { sniffAsset, validateAddon } from '../shared/addonValidate'
import type { AddonPreview, InstalledAddon } from '../shared/types'
import { readJson, writeJsonAtomic } from './jsonFile'

export { ADDON_SCHEME }

const ID_RE = /^[a-z0-9-]{8,64}$/

/** Letztes Argument mit Endung .vibeaddon, das als Datei existiert (Doppelklick im Explorer). */
export function addonPathFromArgv(argv: string[]): string | null {
  for (let i = argv.length - 1; i >= 0; i--) {
    const a = argv[i]
    if (a.toLowerCase().endsWith('.vibeaddon') && fs.existsSync(a)) return a
  }
  return null
}

/** Installierte Addons liegen entpackt unter <dir>/<id>/, Aktiv-Schalter in <dir>/addons.json. */
export class AddonStore {
  private readonly stateFile: string

  constructor(private readonly dir: string) {
    this.stateFile = path.join(dir, 'addons.json')
  }

  private enabledMap(): Record<string, boolean> {
    return readJson<{ enabled?: Record<string, boolean> }>(this.stateFile, {}).enabled ?? {}
  }

  private setEnabledMap(enabled: Record<string, boolean>): void {
    writeJsonAtomic(this.stateFile, { enabled })
  }

  private read(id: string): InstalledAddon | null {
    const base = path.join(this.dir, id)
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(base, 'manifest.json'), 'utf8')) as AddonManifest
      const program = JSON.parse(fs.readFileSync(path.join(base, 'program.json'), 'utf8'))
      const assetDir = path.join(base, 'assets')
      const assetNames = fs.existsSync(assetDir) ? fs.readdirSync(assetDir).sort() : []
      return { manifest, program, assetNames, enabled: this.enabledMap()[id] ?? true }
    } catch {
      return null
    }
  }

  list(): InstalledAddon[] {
    if (!fs.existsSync(this.dir)) return []
    return fs
      .readdirSync(this.dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && ID_RE.test(d.name))
      .map((d) => this.read(d.name))
      .filter((a): a is InstalledAddon => !!a)
      .sort((a, b) => a.manifest.name.localeCompare(b.manifest.name, 'de'))
  }

  inspect(bytes: Uint8Array): AddonPreview {
    const p = validateAddon(decodeAddon(bytes))
    const old = this.read(p.manifest.id)
    const images = Object.entries(p.assets)
      .map(([name, data]) => ({ name, data, s: sniffAsset(data) }))
      .filter((x) => x.s?.kind === 'image')
      .slice(0, 6)
      .map((x) => ({ name: x.name, dataUrl: `data:${x.s!.mime};base64,${Buffer.from(x.data).toString('base64')}` }))
    return {
      manifest: p.manifest,
      capabilityLabels: p.manifest.capabilities.map((c) => CAPABILITY_LABELS[c]),
      images,
      existing: old ? { name: old.manifest.name, author: old.manifest.author, version: old.manifest.version } : null
    }
  }

  install(bytes: Uint8Array): InstalledAddon {
    return this.write(validateAddon(decodeAddon(bytes)))
  }

  saveDraft(p: AddonPackage): InstalledAddon {
    return this.write(validateAddon(p))
  }

  /** Schreibt in einen Nachbarordner und tauscht erst danach aus – ein Fehler lässt das Bestehende unberührt. */
  private write(p: AddonPackage): InstalledAddon {
    const id = p.manifest.id
    const target = path.join(this.dir, id)
    const tmp = path.join(this.dir, `${id}.tmp`)
    fs.rmSync(tmp, { recursive: true, force: true })
    fs.mkdirSync(path.join(tmp, 'assets'), { recursive: true })
    fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify(p.manifest))
    fs.writeFileSync(path.join(tmp, 'program.json'), JSON.stringify(p.program))
    for (const [name, data] of Object.entries(p.assets)) fs.writeFileSync(path.join(tmp, 'assets', name), data)
    fs.rmSync(target, { recursive: true, force: true })
    fs.renameSync(tmp, target)
    const enabled = this.enabledMap()
    if (!(id in enabled)) this.setEnabledMap({ ...enabled, [id]: true })
    return this.read(id)!
  }

  remove(id: string): void {
    if (!ID_RE.test(id)) return
    fs.rmSync(path.join(this.dir, id), { recursive: true, force: true })
    const { [id]: _gone, ...rest } = this.enabledMap()
    this.setEnabledMap(rest)
  }

  setEnabled(id: string, on: boolean): void {
    if (!this.read(id)) return
    this.setEnabledMap({ ...this.enabledMap(), [id]: on })
  }

  exportBytes(id: string): Uint8Array {
    const a = this.read(id)
    if (!a) throw new Error('Addon nicht gefunden')
    const assets: Record<string, Uint8Array> = {}
    for (const name of a.assetNames) assets[name] = new Uint8Array(fs.readFileSync(path.join(this.dir, id, 'assets', name)))
    return encodeAddon({ manifest: a.manifest, program: a.program, assets })
  }

  /** Löst vibedesk-addon://<id>/<datei> sicher auf eine Datei im Asset-Ordner auf. */
  assetFile(url: string): string | null {
    let id: string
    let name: string
    try {
      const u = new URL(url)
      if (u.protocol !== `${ADDON_SCHEME}:`) return null
      id = u.hostname
      name = decodeURIComponent(u.pathname.replace(/^\/+/, ''))
    } catch {
      return null
    }
    if (!ID_RE.test(id) || !name || name !== path.basename(name) || name.includes('..')) return null
    return path.join(this.dir, id, 'assets', name)
  }
}
