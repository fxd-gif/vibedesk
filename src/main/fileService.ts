import fs from 'fs'
import path from 'path'
import type { Eol, FileChange, FileContent, FileEntry, FileErrorCode, FileResult } from '../shared/types'

export const MAX_FILE_BYTES = 2 * 1024 * 1024
export const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'out', 'build'])

const fail = (code: FileErrorCode, message: string): { ok: false; code: FileErrorCode; message: string } => ({ ok: false, code, message })

function realOrParent(p: string): string {
  try {
    return fs.realpathSync.native(p)
  } catch {
    // Datei existiert (noch) nicht → Elternordner auflösen
    return path.join(realOrParent(path.dirname(p)), path.basename(p))
  }
}

function isInside(child: string, root: string): boolean {
  const rel = path.relative(root, child)
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel))
}

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

/** Prüft einen einzelnen Datei-/Ordnernamen (Windows-Regeln). Liefert eine Fehlermeldung oder null. */
export function nameError(name: string): string | null {
  if (!name || !name.trim()) return 'Bitte einen Namen eingeben'
  if (name.length > 255) return 'Name ist zu lang'
  if (name === '.' || name === '..') return 'Ungültiger Name'
  if (/[<>:"|?*\x00-\x1f]/.test(name)) return 'Diese Zeichen sind nicht erlaubt: < > : " | ? *'
  if (/[. ]$/.test(name)) return 'Name darf nicht mit Punkt oder Leerzeichen enden'
  if (RESERVED.test(name)) return `„${name}“ ist unter Windows reserviert`
  return null
}

/** Lesen/Schreiben von Projektdateien – ausschließlich innerhalb der registrierten Projektordner. */
export class FileService {
  constructor(private roots: () => string[]) {}

  /** Liefert den aufgelösten Pfad oder null, wenn er außerhalb aller Projektordner liegt. */
  resolve(p: string): string | null {
    if (typeof p !== 'string' || !p) return null
    const real = realOrParent(path.resolve(p))
    for (const r of this.roots()) {
      let root: string
      try {
        root = fs.realpathSync.native(r)
      } catch {
        continue
      }
      if (isInside(real, root)) return real
    }
    return null
  }

  private isRoot(real: string): boolean {
    return this.roots().some((r) => {
      try {
        return path.relative(fs.realpathSync.native(r), real) === ''
      } catch {
        return false
      }
    })
  }

  create(parent: string, name: string, kind: 'file' | 'dir'): FileResult<{ path: string }> {
    const d = this.resolve(parent)
    if (!d) return fail('outside', 'Ordner liegt außerhalb des Projekts')
    const parts = String(name).trim().split(/[\\/]+/).filter(Boolean)
    for (const p of parts.length ? parts : ['']) {
      const e = nameError(p)
      if (e) return fail('invalid', e)
    }
    const target = this.resolve(path.join(d, ...parts))
    if (!target) return fail('outside', 'Ziel liegt außerhalb des Projekts')
    try {
      if (fs.existsSync(target)) return fail('exists', `„${parts.join('/')}“ gibt es schon`)
      if (kind === 'dir') fs.mkdirSync(target, { recursive: true })
      else {
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, '', { flag: 'wx' })
      }
      return { ok: true, path: target }
    } catch (err) {
      return fail('io', (err as Error).message)
    }
  }

  rename(file: string, newName: string): FileResult<{ path: string }> {
    const f = this.resolve(file)
    if (!f) return fail('outside', 'Datei liegt außerhalb des Projekts')
    if (this.isRoot(f)) return fail('invalid', 'Der Projektordner selbst kann hier nicht umbenannt werden')
    const name = String(newName).trim()
    const e = nameError(name) ?? (/[\\/]/.test(name) ? 'Name darf keinen Schrägstrich enthalten' : null)
    if (e) return fail('invalid', e)
    const target = path.join(path.dirname(f), name)
    if (!this.resolve(target)) return fail('outside', 'Ziel liegt außerhalb des Projekts')
    try {
      if (!fs.existsSync(f)) return fail('not_found', 'Existiert nicht mehr')
      // nur Groß-/Kleinschreibung geändert → unter Windows dieselbe Datei, trotzdem umbenennen
      const caseOnly = target.toLowerCase() === f.toLowerCase()
      if (!caseOnly && fs.existsSync(target)) return fail('exists', `„${name}“ gibt es schon`)
      fs.renameSync(f, target)
      return { ok: true, path: target }
    } catch (err) {
      return fail('io', (err as Error).message)
    }
  }

  /** Prüft, ob etwas gelöscht werden darf (nicht der Projektordner selbst). */
  removable(file: string): FileResult<{ path: string }> {
    const f = this.resolve(file)
    if (!f) return fail('outside', 'Datei liegt außerhalb des Projekts')
    if (this.isRoot(f)) return fail('invalid', 'Der Projektordner selbst kann hier nicht gelöscht werden')
    if (!fs.existsSync(f)) return fail('not_found', 'Existiert nicht mehr')
    return { ok: true, path: f }
  }

  list(dir: string): FileResult<{ entries: FileEntry[] }> {
    const d = this.resolve(dir)
    if (!d) return fail('outside', 'Ordner liegt außerhalb des Projekts')
    try {
      const entries = fs
        .readdirSync(d, { withFileTypes: true })
        .filter((e) => !(e.isDirectory() && IGNORED_DIRS.has(e.name)))
        .map((e) => ({ name: e.name, path: path.join(d, e.name), dir: e.isDirectory() }))
        .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      return { ok: true, entries }
    } catch (err) {
      return fail('io', (err as Error).message)
    }
  }

  read(file: string): FileResult<FileContent> {
    const f = this.resolve(file)
    if (!f) return fail('outside', 'Datei liegt außerhalb des Projekts')
    try {
      const st = fs.statSync(f)
      if (!st.isFile()) return fail('io', 'Keine Datei')
      if (st.size > MAX_FILE_BYTES) return fail('too_large', 'Datei ist größer als 2 MB')
      const buf = fs.readFileSync(f)
      if (buf.subarray(0, 8000).includes(0)) return fail('binary', 'Binärdatei')
      const bom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf
      const raw = buf.toString('utf8', bom ? 3 : 0)
      const eol: Eol = raw.includes('\r\n') ? 'crlf' : 'lf'
      return { ok: true, path: f, text: raw.replace(/\r\n/g, '\n'), mtime: st.mtimeMs, eol, bom }
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      return e.code === 'ENOENT' ? fail('not_found', 'Datei existiert nicht mehr') : fail('io', e.message)
    }
  }

  /** expectedMtime = null überschreibt bewusst bzw. legt die Datei neu an. */
  write(file: string, text: string, expectedMtime: number | null, eol: Eol, bom: boolean): FileResult<{ mtime: number }> {
    const f = this.resolve(file)
    if (!f) return fail('outside', 'Datei liegt außerhalb des Projekts')
    try {
      if (expectedMtime !== null) {
        const cur = fs.existsSync(f) ? fs.statSync(f).mtimeMs : null
        if (cur !== expectedMtime) return fail('conflict', 'Datei wurde inzwischen geändert')
      }
      const body = eol === 'crlf' ? String(text).replace(/\r?\n/g, '\r\n') : String(text)
      fs.mkdirSync(path.dirname(f), { recursive: true })
      fs.writeFileSync(f, (bom ? '﻿' : '') + body, 'utf8')
      return { ok: true, mtime: fs.statSync(f).mtimeMs }
    } catch (err) {
      return fail('io', (err as Error).message)
    }
  }
}

/**
 * Beobachtet einzelne Dateien über ihren Elternordner – überlebt so auch
 * atomares Ersetzen (schreiben + umbenennen), das Datei-Watcher unter Windows verliert.
 */
export class FileWatcher {
  private dirs = new Map<string, { w: fs.FSWatcher | null; files: Map<string, number> }>()
  private timers = new Map<string, NodeJS.Timeout>()

  constructor(
    private emit: (c: FileChange) => void,
    private debounceMs = 150
  ) {}

  watch(file: string): void {
    const dir = path.dirname(file)
    const name = path.basename(file)
    let d = this.dirs.get(dir)
    if (!d) {
      let w: fs.FSWatcher | null = null
      try {
        w = fs.watch(dir, (_ev, fn) => {
          const n = fn?.toString()
          if (n && this.dirs.get(dir)?.files.has(n)) this.bump(path.join(dir, n))
        })
        w.on('error', () => undefined)
      } catch {
        // z. B. Netzlaufwerk – der mtime-Check beim Speichern schützt trotzdem
      }
      d = { w, files: new Map() }
      this.dirs.set(dir, d)
    }
    d.files.set(name, (d.files.get(name) ?? 0) + 1)
  }

  unwatch(file: string): void {
    const dir = path.dirname(file)
    const name = path.basename(file)
    const d = this.dirs.get(dir)
    if (!d) return
    const n = (d.files.get(name) ?? 0) - 1
    if (n > 0) d.files.set(name, n)
    else d.files.delete(name)
    if (!d.files.size) {
      d.w?.close()
      this.dirs.delete(dir)
    }
  }

  closeAll(): void {
    for (const d of this.dirs.values()) d.w?.close()
    this.dirs.clear()
    for (const t of this.timers.values()) clearTimeout(t)
    this.timers.clear()
  }

  private bump(file: string): void {
    clearTimeout(this.timers.get(file))
    this.timers.set(
      file,
      setTimeout(() => {
        this.timers.delete(file)
        try {
          this.emit({ path: file, kind: 'changed', mtime: fs.statSync(file).mtimeMs })
        } catch {
          this.emit({ path: file, kind: 'deleted' })
        }
      }, this.debounceMs)
    )
  }
}
