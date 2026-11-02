// Werkzeug-Fenster auf der Platte: pro Fenster ein Ordner mit app.json, app.html, app.js, app.css und data.json (vd.store).
// Ausgeliefert über vibedesk-scene://app/<id>/… mit strenger CSP – das Skript läuft im Sandbox-iframe.
import fs from 'fs'
import path from 'path'
import { APP_HINT_MAX, APP_MAX, APP_NAME_MAX, APP_STORE_MAX, appSize, appSlug, checkAppInput, cleanAppText, validAppId, type AppStatus, type DeskApp } from '../shared/apps'
import { readJson, writeJsonAtomic } from './jsonFile'

/** Kein Netz, keine fremden Skripte, keine Inline-Skripte: nur Laufzeit und App-Dateien aus demselben Ordner */
export const APP_CSP = "default-src 'none'; script-src vibedesk-scene:; style-src vibedesk-scene: 'unsafe-inline'; img-src vibedesk-scene: data: blob:; font-src data:; form-action 'none'; base-uri 'none'"

const FILES = { html: 'app.html', code: 'app.js', css: 'app.css' } as const

export interface AppSaveInput {
  id?: unknown
  name?: unknown
  hint?: unknown
  html?: unknown
  code?: unknown
  css?: unknown
  w?: unknown
  h?: unknown
}

export class AppStore {
  private waiters = new Map<string, (s: AppStatus) => void>()
  private last = new Map<string, AppStatus>()

  constructor(
    private dir: string,
    private runtimeJs: string,
    private runtimeCss: string
  ) {}

  private appDir(id: string): string {
    return path.join(this.dir, id)
  }

  list(): DeskApp[] {
    if (!fs.existsSync(this.dir)) return []
    return fs
      .readdirSync(this.dir)
      .filter(validAppId)
      .map((id) => this.meta(id))
      .filter((x): x is DeskApp => !!x)
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  meta(id: string): DeskApp | null {
    if (!validAppId(id)) return null
    return readJson<DeskApp | null>(path.join(this.appDir(id), 'app.json'), null)
  }

  private file(id: string, f: string): string {
    try {
      return fs.readFileSync(path.join(this.appDir(id), f), 'utf8')
    } catch {
      return ''
    }
  }

  /** Quelltext zum Ändern (für Claude) */
  source(id: string): { html: string; code: string; css: string } | null {
    if (!this.meta(id)) return null
    return { html: this.file(id, FILES.html), code: this.file(id, FILES.code), css: this.file(id, FILES.css) }
  }

  /** Anlegen oder ändern. Wirft mit einer Meldung für Claude, wenn etwas nicht passt. Weggelassene Teile bleiben beim Ändern. */
  save(input: AppSaveInput): DeskApp {
    let id = validAppId(input.id) ? input.id : ''
    const old = id ? this.meta(id) : null
    if (id && !old) throw new Error(`Kein Werkzeug-Fenster mit der id „${id}“. Ohne id wird ein neues angelegt.`)
    const prev = old ? this.source(id)! : { html: '', code: '', css: '' }
    const next = {
      html: input.html === undefined ? prev.html : input.html,
      code: input.code === undefined ? prev.code : input.code,
      css: input.css === undefined ? prev.css : input.css
    }
    const err = checkAppInput(next)
    if (err) throw new Error(err)
    const name = cleanAppText(input.name, APP_NAME_MAX)
    if (!old) {
      if (!name) throw new Error('name fehlt (kurz, z. B. „Todo-Übersicht“).')
      if (this.list().length >= APP_MAX) throw new Error(`Es gibt schon ${APP_MAX} Werkzeug-Fenster – lösche erst eins (desk_app_delete).`)
      const base = appSlug(name)
      id = base
      for (let n = 2; fs.existsSync(this.appDir(id)); n++) id = `${base}-${n}`
    }
    const dir = this.appDir(id)
    fs.mkdirSync(dir, { recursive: true })
    for (const k of ['html', 'code', 'css'] as const) fs.writeFileSync(path.join(dir, FILES[k]), String(next[k]))
    const size = input.w !== undefined || input.h !== undefined || !old ? appSize(input.w ?? old?.w, input.h ?? old?.h) : { w: old.w, h: old.h }
    const hint = input.hint === undefined ? (old?.hint ?? '') : cleanAppText(input.hint, APP_HINT_MAX)
    const app: DeskApp = { id, name: name || old!.name, hint, ...size, createdAt: old?.createdAt ?? Date.now(), rev: Math.max(Date.now(), (old?.rev ?? 0) + 1) }
    writeJsonAtomic(path.join(dir, 'app.json'), app)
    this.last.delete(id)
    return app
  }

  delete(id: string): boolean {
    if (!this.meta(id)) return false
    fs.rmSync(this.appDir(id), { recursive: true, force: true })
    return true
  }

  // ---------- eigener Speicher (vd.store) ----------

  private data(id: string): Record<string, unknown> {
    return readJson<Record<string, unknown>>(path.join(this.appDir(id), 'data.json'), {})
  }

  storeGet(id: string, key: string): unknown {
    if (!this.meta(id)) return undefined
    return this.data(id)[key]
  }

  /** undefined löscht den Schlüssel; wirft, wenn der Speicher zu groß würde */
  storeSet(id: string, key: string, value: unknown): void {
    if (!this.meta(id)) throw new Error('unbekanntes Fenster')
    if (!key || key.length > 100) throw new Error('Schlüssel 1–100 Zeichen')
    const d = this.data(id)
    if (value === undefined) delete d[key]
    else d[key] = value
    if (JSON.stringify(d).length > APP_STORE_MAX) throw new Error(`Speicher voll (höchstens ${APP_STORE_MAX} Zeichen)`)
    writeJsonAtomic(path.join(this.appDir(id), 'data.json'), d)
  }

  // ---------- Ausliefern ----------

  /** Antwort für vibedesk-scene://app/<id>/<datei> */
  serve(url: string): Response {
    let parts: string[]
    try {
      parts = new URL(url).pathname.replace(/^\/+/, '').split('/').map(decodeURIComponent)
    } catch {
      return new Response('bad', { status: 400 })
    }
    if (parts.length !== 2) return new Response('not found', { status: 404 })
    const [id, file] = parts
    const meta = validAppId(id) ? this.meta(id) : null
    if (!meta) return new Response('not found', { status: 404 })
    const headers = (type: string): HeadersInit => ({ 'content-type': type, 'content-security-policy': APP_CSP, 'access-control-allow-origin': '*', 'cache-control': 'no-store', 'x-dns-prefetch-control': 'off' })
    const js = (body: string): Response => new Response(body, { headers: headers('text/javascript; charset=utf-8') })
    const css = (body: string): Response => new Response(body, { headers: headers('text/css; charset=utf-8') })
    const read = (f: string): string | null => {
      try {
        return fs.readFileSync(f, 'utf8')
      } catch {
        return null
      }
    }
    switch (file) {
      case 'index.html':
        return new Response(appIndex(meta.name, this.file(id, FILES.html)), { headers: headers('text/html; charset=utf-8') })
      case 'runtime.js': {
        const r = read(this.runtimeJs)
        return r === null ? new Response('not found', { status: 404 }) : js(r)
      }
      case 'runtime.css': {
        const r = read(this.runtimeCss)
        return r === null ? new Response('not found', { status: 404 }) : css(r)
      }
      case 'start.js':
        return js('vd.__start()')
      case 'app.js':
        // in einer async-Funktion: await geht direkt (Zeile 1 = Claudes erste Zeile + 1)
        return js(wrapAppCode(this.file(id, FILES.code)))
      case 'app.css':
        return css(this.file(id, FILES.css))
      default:
        return new Response('not found', { status: 404 })
    }
  }

  // ---------- Rückmeldung des laufenden Fensters ----------

  report(s: AppStatus): void {
    this.last.set(s.id, s)
    const w = this.waiters.get(`${s.id}@${s.rev}`)
    if (w) w(s)
  }

  lastStatus(id: string): AppStatus | undefined {
    return this.last.get(id)
  }

  /** Wartet, bis das Fenster in dieser Fassung läuft oder einen Fehler meldet (null = keine Antwort) */
  waitStatus(id: string, rev: number, ms: number): Promise<AppStatus | null> {
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

/** Claudes Skript läuft in einer async-Funktion – Fehler darin melden sich als unhandledrejection */
export const wrapAppCode = (code: string): string => `;(async () => {\n${code}\n})()`

const escAttr = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

/** Seite des Fensters: Laufzeit + Design zuerst, dann Claudes Markup, Skript und der Start */
export function appIndex(name: string, html: string): string {
  return [
    '<!doctype html>',
    '<html lang="de"><head><meta charset="utf-8">',
    `<title>${escAttr(name)}</title>`,
    '<link rel="stylesheet" href="runtime.css" crossorigin="anonymous"><link rel="stylesheet" href="app.css" crossorigin="anonymous">',
    // crossorigin: Im Sandbox-iframe gilt alles als fremd – ohne CORS meldet onerror nur „Script error.“
    '<script src="runtime.js" crossorigin="anonymous"></script></head>',
    `<body>${html}<script src="app.js" crossorigin="anonymous"></script><script src="start.js" crossorigin="anonymous"></script></body></html>`
  ].join('')
}
