// Lebende Szenen auf der Platte: pro Szene ein Ordner mit scene.json, scene.js und dem Bild.
// Ausgeliefert über vibedesk-scene://living/<id>/… mit strenger CSP – das Skript läuft im Sandbox-iframe.
import { randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'
import { checkLivingCode, cleanLivingName, imageSize, LIVING_IMAGE_EXT, LIVING_IMAGE_MAX, LIVING_MAX, livingSlug, validLivingId, type LivingScene, type LivingStatus } from '../shared/living'
import { readJson, writeJsonAtomic } from './jsonFile'

/** Kein Netz, keine fremden Skripte: nur die Laufzeit und das Szenen-Skript aus demselben Ordner */
export const LIVING_CSP = "default-src 'none'; script-src vibedesk-scene:; img-src vibedesk-scene: data: blob:; style-src 'unsafe-inline'"

const INDEX = (s: Pick<LivingScene, 'image' | 'imageSize'>): string =>
  [
    '<!doctype html>',
    `<html data-image="${s.image ? 1 : 0}" data-w="${s.imageSize?.w ?? 0}" data-h="${s.imageSize?.h ?? 0}">`,
    '<head><meta charset="utf-8"><style>html,body{margin:0;height:100%;overflow:hidden;background:#0b0d12}canvas{position:fixed;inset:0;width:100vw;height:100vh;display:block}</style>',
    // crossorigin: Im Sandbox-iframe gilt alles als fremd – ohne CORS meldet onerror nur „Script error.“
    '<script src="runtime.js" crossorigin="anonymous"></script></head>',
    '<body><script src="scene.js" crossorigin="anonymous"></script><script src="start.js" crossorigin="anonymous"></script></body></html>'
  ].join('')

export interface SaveInput {
  id?: unknown
  name?: unknown
  code?: unknown
  /** Pfad zu einem Bild auf dem PC, 'keep' (bisheriges behalten) oder null (kein Bild) */
  imagePath?: string | null | 'keep'
}

export class LivingStore {
  private waiters = new Map<string, (s: LivingStatus) => void>()
  private last = new Map<string, LivingStatus>()
  /** Vorschau einer geteilten Szene vor dem Übernehmen – nur im Speicher, immer nur eine */
  private preview: { token: string; code: string } | null = null

  constructor(
    private dir: string,
    private runtimeFile: string
  ) {}

  private sceneDir(id: string): string {
    return path.join(this.dir, id)
  }

  list(): LivingScene[] {
    if (!fs.existsSync(this.dir)) return []
    return fs
      .readdirSync(this.dir)
      .filter(validLivingId)
      .map((id) => this.meta(id))
      .filter((x): x is LivingScene => !!x)
      .sort((a, b) => b.rev - a.rev)
  }

  meta(id: string): LivingScene | null {
    if (!validLivingId(id)) return null
    return readJson<LivingScene | null>(path.join(this.sceneDir(id), 'scene.json'), null)
  }

  code(id: string): string | null {
    if (!this.meta(id)) return null
    try {
      return fs.readFileSync(path.join(this.sceneDir(id), 'scene.js'), 'utf8')
    } catch {
      return null
    }
  }

  /** Anlegen oder ändern. Wirft mit einer Meldung für Claude, wenn etwas nicht passt. */
  save(input: SaveInput): LivingScene {
    const err = checkLivingCode(input.code)
    if (err) throw new Error(err)
    const name = cleanLivingName(input.name)
    let id = validLivingId(input.id) ? input.id : ''
    const old = id ? this.meta(id) : null
    if (id && !old) throw new Error(`Keine Szene mit der id „${id}“. Ohne id wird eine neue angelegt.`)
    if (!old) {
      if (!name) throw new Error('name fehlt (kurz, z. B. „Winterhaus“).')
      if (this.list().length >= LIVING_MAX) throw new Error(`Es gibt schon ${LIVING_MAX} lebende Szenen – lösche erst eine (desk_scene_delete).`)
      const base = livingSlug(name)
      id = base
      for (let n = 2; fs.existsSync(this.sceneDir(id)); n++) id = `${base}-${n}`
    }
    const dir = this.sceneDir(id)
    fs.mkdirSync(dir, { recursive: true })

    let image = old?.image ?? null
    let size = old?.imageSize ?? null
    if (input.imagePath === null) {
      image = null
      size = null
    } else if (input.imagePath && input.imagePath !== 'keep') {
      const src = input.imagePath
      const ext = path.extname(src).toLowerCase()
      if (!LIVING_IMAGE_EXT.includes(ext)) throw new Error(`Nur Bilder (${LIVING_IMAGE_EXT.join(', ')}) sind möglich.`)
      let st: fs.Stats
      try {
        st = fs.statSync(src)
      } catch {
        throw new Error(`Bild nicht gefunden: ${src}`)
      }
      if (!st.isFile() || st.size > LIVING_IMAGE_MAX) throw new Error('Das Bild ist zu groß (höchstens 25 MB).')
      const data = fs.readFileSync(src)
      size = imageSize(data)
      if (old?.image && old.image !== 'image' + ext) fs.rmSync(path.join(dir, old.image), { force: true })
      image = 'image' + ext
      fs.writeFileSync(path.join(dir, image), data)
    }

    fs.writeFileSync(path.join(dir, 'scene.js'), String(input.code))
    const scene: LivingScene = { id, name: name || old!.name, image, imageSize: size, createdAt: old?.createdAt ?? Date.now(), rev: Math.max(Date.now(), (old?.rev ?? 0) + 1) }
    writeJsonAtomic(path.join(dir, 'scene.json'), scene)
    this.last.delete(id)
    return scene
  }

  delete(id: string): boolean {
    if (!this.meta(id)) return false
    fs.rmSync(this.sceneDir(id), { recursive: true, force: true })
    return true
  }

  /** Skript einer geteilten Szene zum Ansehen bereitlegen → Kennung für vibedesk-scene://living-preview/<token>/ */
  setPreview(code: string): string {
    const err = checkLivingCode(code)
    if (err) throw new Error(err)
    this.preview = { token: randomUUID(), code }
    return this.preview.token
  }

  endPreview(token: string): void {
    if (this.preview?.token === token) this.preview = null
  }

  /** Antwort für vibedesk-scene://living/<id>/<datei> (und living-preview/<token>/<datei>) */
  serve(url: string): Response {
    let parts: string[]
    let host: string
    try {
      const u = new URL(url)
      host = u.host
      parts = u.pathname.replace(/^\/+/, '').split('/').map(decodeURIComponent)
    } catch {
      return new Response('bad', { status: 400 })
    }
    const [id, file] = parts
    if (parts.length !== 2) return new Response('not found', { status: 404 })
    // dns-prefetch aus: auch über Namensauflösung soll nichts hinausgehen
    const headers = (type: string): HeadersInit => ({ 'content-type': type, 'content-security-policy': LIVING_CSP, 'access-control-allow-origin': '*', 'cache-control': 'no-store', 'x-dns-prefetch-control': 'off' })
    const read = (f: string): ArrayBuffer | null => {
      try {
        const b = fs.readFileSync(f)
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
      } catch {
        return null
      }
    }
    const runtime = (): Response => {
      const js = read(this.runtimeFile)
      if (!js) return new Response('not found', { status: 404 })
      // start.js: nur noch die Szene starten – die Laufzeit ist dann schon geladen
      return new Response(file === 'runtime.js' ? js : 'vd.__start()', { headers: headers('text/javascript; charset=utf-8') })
    }
    if (host === 'living-preview') {
      // Vorschau: dieselbe Seite, dieselbe CSP, nur ohne Bild
      const pv = this.preview
      if (!pv || pv.token !== id) return new Response('not found', { status: 404 })
      if (file === 'index.html') return new Response(INDEX({ image: null, imageSize: null }), { headers: headers('text/html; charset=utf-8') })
      if (file === 'runtime.js' || file === 'start.js') return runtime()
      if (file === 'scene.js') return new Response(pv.code, { headers: headers('text/javascript; charset=utf-8') })
      return new Response('not found', { status: 404 })
    }
    const meta = validLivingId(id) ? this.meta(id) : null
    if (!meta) return new Response('not found', { status: 404 })
    if (file === 'index.html') return new Response(INDEX(meta), { headers: headers('text/html; charset=utf-8') })
    if (file === 'runtime.js' || file === 'start.js') return runtime()
    if (file === 'scene.js') {
      const js = read(path.join(this.sceneDir(id), 'scene.js'))
      return js ? new Response(js, { headers: headers('text/javascript; charset=utf-8') }) : new Response('not found', { status: 404 })
    }
    if (file === 'image' && meta.image) {
      const data = read(path.join(this.sceneDir(id), meta.image))
      const ext = path.extname(meta.image).slice(1).replace('jpg', 'jpeg')
      return data ? new Response(data, { headers: headers(`image/${ext}`) }) : new Response('not found', { status: 404 })
    }
    return new Response('not found', { status: 404 })
  }

  // ---------- Rückmeldung der laufenden Szene ----------

  report(s: LivingStatus): void {
    this.last.set(s.id, s)
    const w = this.waiters.get(`${s.id}@${s.rev}`)
    if (w) w(s)
  }

  /** Wartet, bis die Szene in dieser Fassung läuft oder einen Fehler meldet (null = keine Antwort, z. B. andere Szene aktiv) */
  waitStatus(id: string, rev: number, ms: number): Promise<LivingStatus | null> {
    const known = this.last.get(id)
    if (known && known.rev === rev) return Promise.resolve(known)
    const key = `${id}@${rev}`
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiters.delete(key)
        resolve(null)
      }, ms)
      this.waiters.set(key, (s) => {
        clearTimeout(timer)
        this.waiters.delete(key)
        resolve(s)
      })
    })
  }
}
