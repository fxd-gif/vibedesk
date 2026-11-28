// Notizen des Gehirns als Markdown-Dateien im Projekt (.vibedesk/brain) – Obsidian kann den Ordner direkt öffnen.
import { t } from '../shared/i18n'
import fs from 'fs'
import path from 'path'
import { BRAIN_DIR, LIMITS, NOTE_TYPES, cleanTitle, noteFileName, parseNote, serializeNote, titleKey, type NoteMeta, type NoteType } from '../shared/brain'

export interface NoteInput {
  title: string
  type?: string
  body: string
  tags?: string[]
  files?: string[]
}

const ARCHIVE = '.archiv'
const MAX_DEPTH = 3

/**
 * Notizen je Gehirn-Ordner im Speicher. Unter Windows kostet allein das Öffnen einer Datei rund 0,6 ms – bei 500 Notizen
 * blockierte jedes list() den Main-Prozess (und damit die ganze App) für eine halbe Sekunde, und list() läuft bei jedem
 * Gehirn-Werkzeug, beim Session-Start und bei jedem Neuzeichnen des Graphen. Jetzt: Ein Wächter meldet Änderungen;
 * ohne Meldung gibt es die gemerkte Liste ohne Dateizugriff, sonst werden nur geänderte Dateien neu gelesen (mtime + Größe).
 */
interface NoteCache {
  files: Map<string, { mtime: number; size: number; note: NoteMeta }>
  list: NoteMeta[] | null
  /** seit dem letzten Einlesen hat sich etwas geändert (oder es gibt keinen Wächter) */
  dirty: boolean
  watcher: fs.FSWatcher | null
}
const caches = new Map<string, NoteCache>()

function cacheOf(dir: string): NoteCache {
  let c = caches.get(dir)
  if (!c) caches.set(dir, (c = { files: new Map(), list: null, dirty: true, watcher: null }))
  return c
}

/** Wächter anlegen, sobald der Ordner existiert; fällt er aus, wird bei jedem Aufruf nachgesehen */
function watchNotes(dir: string, c: NoteCache): void {
  if (c.watcher) return
  try {
    const w = fs.watch(dir, { recursive: true }, () => {
      c.dirty = true
    })
    w.on('error', () => {
      w.close()
      if (c.watcher === w) c.watcher = null
      c.dirty = true
    })
    c.watcher = w
  } catch {
    // Ordner fehlt oder Wächter nicht möglich – dann prüft list() jedes Mal mtime und Größe
  }
}

/** Beim Beenden: alle Wächter schließen */
export function closeNoteCaches(): void {
  for (const c of caches.values()) c.watcher?.close()
  caches.clear()
}

export class BrainStore {
  readonly dir: string

  constructor(readonly root: string) {
    this.dir = path.join(root, BRAIN_DIR)
  }

  /** alle Notizen, auch aus Unterordnern (Obsidian-Nutzer sortieren gern) – aus dem Speicher, solange sich nichts geändert hat */
  list(): NoteMeta[] {
    const c = cacheOf(this.dir)
    if (c.list && !c.dirty && c.watcher) return c.list.slice()
    // vor dem Einlesen „sauber“ setzen: eine Änderung währenddessen macht die Liste gleich wieder ungültig
    c.dirty = false
    const seenFiles = new Set<string>()
    const out: NoteMeta[] = []
    const seen = new Set<string>()
    const walk = (dir: string, depth: number): void => {
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const e of entries) {
        if (e.name.startsWith('.')) continue
        const p = path.join(dir, e.name)
        if (e.isDirectory()) {
          if (depth < MAX_DEPTH) walk(p, depth + 1)
          continue
        }
        if (!e.isFile() || !e.name.toLowerCase().endsWith('.md') || out.length >= LIMITS.notes) continue
        const title = e.name.slice(0, -3)
        if (seen.has(titleKey(title))) continue
        try {
          const st = fs.statSync(p)
          if (st.size > LIMITS.bodyLen * 2) continue
          const hit = c.files.get(p)
          let note: NoteMeta
          if (hit && hit.mtime === st.mtimeMs && hit.size === st.size) note = hit.note
          else {
            note = parseNote(title, fs.readFileSync(p, 'utf8'), st.mtimeMs)
            c.files.set(p, { mtime: st.mtimeMs, size: st.size, note })
          }
          seenFiles.add(p)
          out.push(note)
          seen.add(titleKey(title))
        } catch {
          // gerade gelöscht oder gesperrt – beim nächsten Mal
          c.dirty = true
        }
      }
    }
    walk(this.dir, 0)
    for (const p of c.files.keys()) if (!seenFiles.has(p)) c.files.delete(p)
    c.list = out
    watchNotes(this.dir, c)
    return out.slice()
  }

  /** eigene Änderung: sofort neu einlesen, nicht erst auf den Wächter warten */
  private touched(): void {
    cacheOf(this.dir).dirty = true
  }

  private find(title: string): string | null {
    const want = titleKey(title)
    if (!want) return null
    const walk = (dir: string, depth: number): string | null => {
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        return null
      }
      for (const e of entries) {
        if (e.isFile() && e.name.toLowerCase().endsWith('.md') && titleKey(e.name.slice(0, -3)) === want) return path.join(dir, e.name)
      }
      for (const e of entries) {
        if (e.isDirectory() && !e.name.startsWith('.') && depth < MAX_DEPTH) {
          const hit = walk(path.join(dir, e.name), depth + 1)
          if (hit) return hit
        }
      }
      return null
    }
    return walk(this.dir, 0)
  }

  get(title: string): NoteMeta | null {
    // aus dem Speicher, wenn die Liste aktuell ist (der Wächter hat nichts gemeldet)
    const c = cacheOf(this.dir)
    if (c.list && !c.dirty && c.watcher) {
      const want = titleKey(title)
      const hit = c.list.find((n) => titleKey(n.title) === want)
      if (hit) return hit
    }
    const f = this.find(title)
    if (!f) return null
    try {
      return parseNote(path.basename(f, '.md'), fs.readFileSync(f, 'utf8'), fs.statSync(f).mtimeMs)
    } catch {
      return null
    }
  }

  /** Anlegen oder ersetzen. Typ, Tags und Dateien bleiben erhalten, wenn sie nicht mitkommen. */
  write(input: NoteInput, now = Date.now()): { note: NoteMeta; created: boolean } {
    const title = cleanTitle(input.title)
    const file = noteFileName(title)
    if (!file) throw new Error(t('Ungültiger Titel'))
    const body = String(input.body ?? '').slice(0, LIMITS.bodyLen)
    if (!body.trim()) throw new Error(t('Die Notiz ist leer'))
    const existing = this.find(title)
    const old = existing ? this.get(title) : null
    if (!old && this.list().length >= LIMITS.notes) throw new Error(t('Das Gehirn ist voll ({max} Notizen) – fasse Notizen zusammen oder lösche alte.', { max: LIMITS.notes }))
    const type: NoteType = NOTE_TYPES.includes(input.type as NoteType) ? (input.type as NoteType) : (old?.type ?? 'fact')
    const list = (v: string[] | undefined, fallback: string[], max: number): string[] =>
      Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim().replace(/\\/g, '/')).filter(Boolean))].slice(0, max) : fallback
    const note = {
      title,
      type,
      body,
      tags: list(input.tags, old?.tags ?? [], LIMITS.tagsPerNote),
      files: list(input.files, old?.files ?? [], LIMITS.filesPerNote),
      created: old?.created ?? now,
      updated: now
    }
    const target = existing ?? path.join(this.dir, file)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    const tmp = target + '.tmp'
    fs.writeFileSync(tmp, serializeNote(note), 'utf8')
    fs.renameSync(tmp, target)
    this.touched()
    return { note: parseNote(title, serializeNote(note), now), created: !old }
  }

  /** Nicht endgültig: landet in .archiv, falls es doch noch gebraucht wird */
  remove(title: string): boolean {
    const f = this.find(title)
    if (!f) return false
    const archive = path.join(this.dir, ARCHIVE)
    fs.mkdirSync(archive, { recursive: true })
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    fs.renameSync(f, path.join(archive, `${path.basename(f, '.md')} ${stamp}.md`))
    this.touched()
    return true
  }

  rename(from: string, to: string): NoteMeta {
    const f = this.find(from)
    if (!f) throw new Error(t('Notiz nicht gefunden'))
    const file = noteFileName(to)
    if (!file) throw new Error(t('Ungültiger Titel'))
    if (titleKey(from) !== titleKey(to) && this.find(to)) throw new Error(t('Eine Notiz mit diesem Titel gibt es schon'))
    const target = path.join(path.dirname(f), file)
    fs.renameSync(f, target)
    this.touched()
    // Links in anderen Notizen mitziehen, damit der Graph zusammenhält
    const re = new RegExp(`\\[\\[${cleanTitle(from).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\]|#])`, 'gi')
    for (const n of this.list()) {
      if (!n.links.some((l) => titleKey(l) === titleKey(from))) continue
      const p = this.find(n.title)
      if (!p) continue
      const text = fs.readFileSync(p, 'utf8')
      const next = text.replace(re, `[[${cleanTitle(to)}`)
      if (next !== text) {
        fs.writeFileSync(p, next, 'utf8')
        this.touched()
      }
    }
    return this.get(to)!
  }
}
