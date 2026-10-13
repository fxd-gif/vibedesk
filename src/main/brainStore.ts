// Notizen des Gehirns als Markdown-Dateien im Projekt (.vibedesk/brain) – Obsidian kann den Ordner direkt öffnen.
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

export class BrainStore {
  readonly dir: string

  constructor(readonly root: string) {
    this.dir = path.join(root, BRAIN_DIR)
  }

  /** alle Notizen, auch aus Unterordnern (Obsidian-Nutzer sortieren gern) */
  list(): NoteMeta[] {
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
          out.push(parseNote(title, fs.readFileSync(p, 'utf8'), st.mtimeMs))
          seen.add(titleKey(title))
        } catch {
          // gerade gelöscht oder gesperrt – beim nächsten Mal
        }
      }
    }
    walk(this.dir, 0)
    return out
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
    if (!file) throw new Error('Ungültiger Titel')
    const body = String(input.body ?? '').slice(0, LIMITS.bodyLen)
    if (!body.trim()) throw new Error('Die Notiz ist leer')
    const existing = this.find(title)
    const old = existing ? this.get(title) : null
    if (!old && this.list().length >= LIMITS.notes) throw new Error(`Das Gehirn ist voll (${LIMITS.notes} Notizen) – fasse Notizen zusammen oder lösche alte.`)
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
    return true
  }

  rename(from: string, to: string): NoteMeta {
    const f = this.find(from)
    if (!f) throw new Error('Notiz nicht gefunden')
    const file = noteFileName(to)
    if (!file) throw new Error('Ungültiger Titel')
    if (titleKey(from) !== titleKey(to) && this.find(to)) throw new Error('Eine Notiz mit diesem Titel gibt es schon')
    const target = path.join(path.dirname(f), file)
    fs.renameSync(f, target)
    // Links in anderen Notizen mitziehen, damit der Graph zusammenhält
    const re = new RegExp(`\\[\\[${cleanTitle(from).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\]|#])`, 'gi')
    for (const n of this.list()) {
      if (!n.links.some((l) => titleKey(l) === titleKey(from))) continue
      const p = this.find(n.title)
      if (!p) continue
      const text = fs.readFileSync(p, 'utf8')
      const next = text.replace(re, `[[${cleanTitle(to)}`)
      if (next !== text) fs.writeFileSync(p, next, 'utf8')
    }
    return this.get(to)!
  }
}
