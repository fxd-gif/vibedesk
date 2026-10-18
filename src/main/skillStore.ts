import { t } from '../shared/i18n'
import fs from 'fs'
import path from 'path'
import { parse as parseYaml } from 'yaml'
import { unzipSync } from 'fflate'
import type { Project, SkillInfo, SkillTarget } from '../shared/types'

export interface SkillCandidate {
  name: string
  description: string
  /** relative POSIX-Pfade → Inhalt */
  files: Map<string, Uint8Array>
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.venv', '__pycache__', 'dist', 'out'])
const MAX_DEPTH = 4
const MAX_FILES = 500
const MAX_BYTES = 50 * 1024 * 1024

export function parseSkillMd(text: string): { name: string; description: string } | null {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) return null
  let fm: unknown
  try {
    fm = parseYaml(m[1])
  } catch {
    return null
  }
  if (!fm || typeof fm !== 'object') return null
  const { name, description } = fm as Record<string, unknown>
  if (typeof name !== 'string' || !name.trim() || typeof description !== 'string' || !description.trim()) return null
  return { name: name.trim(), description: description.trim() }
}

export function sanitizeSkillName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

const safeRel = (rel: string): boolean => !!rel && !rel.startsWith('/') && !/^[a-zA-Z]:/.test(rel) && !rel.split('/').some((s) => s === '..' || s === '')

/** Baut Kandidaten aus einer flachen Dateiliste (relative POSIX-Pfade). */
function fromEntries(entries: Map<string, Uint8Array>): SkillCandidate[] {
  const out: SkillCandidate[] = []
  for (const [p, data] of entries) {
    if (path.posix.basename(p) !== 'SKILL.md') continue
    const meta = parseSkillMd(Buffer.from(data).toString('utf8'))
    if (!meta) continue
    const dir = path.posix.dirname(p)
    const prefix = dir === '.' ? '' : dir + '/'
    const files = new Map<string, Uint8Array>()
    let bytes = 0
    for (const [q, d] of entries) {
      if (!q.startsWith(prefix)) continue
      const rel = q.slice(prefix.length)
      if (!safeRel(rel)) continue
      if (files.size >= MAX_FILES || (bytes += d.length) > MAX_BYTES) break
      files.set(rel, d)
    }
    out.push({ ...meta, files })
  }
  return out
}

/** Kandidaten aus einer fertigen Dateiliste (z. B. aus einem Share-Code). */
export function candidatesFromFiles(files: { path: string; data: Uint8Array }[]): SkillCandidate[] {
  const entries = new Map<string, Uint8Array>()
  for (const f of files) if (safeRel(f.path)) entries.set(f.path, f.data)
  return fromEntries(entries)
}

/** Liest einen installierten Skill-Ordner zum Teilen ein (ohne Symlinks, mit Größengrenzen). */
export function readSkillFiles(dir: string, maxBytes = 1024 * 1024): { path: string; data: Uint8Array }[] {
  const out: { path: string; data: Uint8Array }[] = []
  let bytes = 0
  const walk = (abs: string, rel: string, depth: number): void => {
    if (depth > MAX_DEPTH) return
    for (const d of fs.readdirSync(abs, { withFileTypes: true })) {
      if (d.isSymbolicLink() || d.name.startsWith('.')) continue
      const r = rel ? `${rel}/${d.name}` : d.name
      if (d.isDirectory()) {
        if (!SKIP_DIRS.has(d.name)) walk(path.join(abs, d.name), r, depth + 1)
      } else if (d.isFile()) {
        const data = fs.readFileSync(path.join(abs, d.name))
        bytes += data.length
        if (bytes > maxBytes || out.length >= 200) throw new Error(t('Der Skill ist zu groß zum Teilen per Code (max. 1 MB, 200 Dateien).'))
        out.push({ path: r, data })
      }
    }
  }
  walk(dir, '', 0)
  return out
}

export function candidatesFromDir(dir: string): SkillCandidate[] {
  const entries = new Map<string, Uint8Array>()
  let bytes = 0
  const walk = (abs: string, rel: string, depth: number): void => {
    if (depth > MAX_DEPTH + 3 || entries.size > MAX_FILES * 4 || bytes > MAX_BYTES) return
    for (const d of fs.readdirSync(abs, { withFileTypes: true })) {
      if (d.isSymbolicLink()) continue
      const r = rel ? `${rel}/${d.name}` : d.name
      if (d.isDirectory()) {
        if (!SKIP_DIRS.has(d.name)) walk(path.join(abs, d.name), r, depth + 1)
      } else if (d.isFile()) {
        const data = fs.readFileSync(path.join(abs, d.name))
        bytes += data.length
        entries.set(r, data)
      }
    }
  }
  walk(dir, '', 0)
  // SKILL.md tiefer als MAX_DEPTH ignorieren
  for (const k of [...entries.keys()]) if (path.posix.basename(k) === 'SKILL.md' && k.split('/').length - 1 > MAX_DEPTH) entries.delete(k)
  return fromEntries(entries)
}

export function candidatesFromZip(data: Uint8Array): SkillCandidate[] {
  const raw = unzipSync(data)
  const entries = new Map<string, Uint8Array>()
  for (const [name, d] of Object.entries(raw)) {
    const p = name.replace(/\\/g, '/')
    if (p.endsWith('/') || !safeRel(p)) continue
    entries.set(p, d)
  }
  return fromEntries(entries)
}

/** Ordner, .zip oder einzelne SKILL.md */
export function candidatesFromPath(p: string): SkillCandidate[] {
  const st = fs.statSync(p)
  if (st.isDirectory()) return candidatesFromDir(p)
  if (p.toLowerCase().endsWith('.zip')) return candidatesFromZip(fs.readFileSync(p))
  if (path.basename(p).toLowerCase() === 'skill.md') {
    const data = fs.readFileSync(p)
    return fromEntries(new Map([['SKILL.md', data]]))
  }
  throw new Error(t('Bitte einen Ordner, eine .zip oder eine SKILL.md wählen'))
}

export class SkillStore {
  constructor(
    private globalDir: string,
    private projectDir: (projectId: string) => string | undefined,
    private trash: (p: string) => Promise<void>
  ) {}

  private scan(dir: string, scope: string): SkillInfo[] {
    if (!fs.existsSync(dir)) return []
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .flatMap((d) => {
        const md = path.join(dir, d.name, 'SKILL.md')
        if (!fs.existsSync(md)) return []
        const meta = parseSkillMd(fs.readFileSync(md, 'utf8'))
        return [{ name: meta?.name ?? d.name, description: meta?.description ?? '', dir: path.join(dir, d.name), scope }]
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  private roots(projects: Project[]): { dir: string; scope: string }[] {
    return [
      { dir: this.globalDir, scope: 'global' },
      ...projects.flatMap((p) => {
        const d = this.projectDir(p.id)
        return d ? [{ dir: d, scope: p.id }] : []
      })
    ]
  }

  list(projects: Project[]): SkillInfo[] {
    return this.roots(projects).flatMap((r) => this.scan(r.dir, r.scope))
  }

  async install(c: SkillCandidate, target: SkillTarget, opts: { replace: boolean }): Promise<SkillInfo> {
    const base = target.kind === 'global' ? this.globalDir : this.projectDir(target.projectId)
    if (!base) throw new Error(t('Projekt nicht gefunden'))
    const folder = sanitizeSkillName(c.name) || 'skill'
    const dir = path.join(base, folder)
    if (fs.existsSync(dir)) {
      if (!opts.replace) throw new Error('SKILL_EXISTS')
      await this.trash(dir)
    }
    for (const [rel, data] of c.files) {
      if (!safeRel(rel)) continue
      const abs = path.join(dir, ...rel.split('/'))
      if (!abs.startsWith(dir + path.sep)) continue
      fs.mkdirSync(path.dirname(abs), { recursive: true })
      fs.writeFileSync(abs, data)
    }
    return { name: c.name, description: c.description, dir, scope: target.kind === 'global' ? 'global' : target.projectId }
  }

  /** true, wenn `dir` ein Skill-Ordner direkt unter einem bekannten Skill-Verzeichnis ist */
  isSkillDir(dir: string, projects: Project[] = []): boolean {
    const abs = path.resolve(dir)
    const ok = [this.globalDir, ...projects.map((p) => this.projectDir(p.id)).filter(Boolean)].some(
      (root) => path.dirname(abs).toLowerCase() === path.resolve(root as string).toLowerCase()
    )
    return ok && fs.existsSync(path.join(abs, 'SKILL.md'))
  }

  async remove(dir: string, projects: Project[] = []): Promise<void> {
    const abs = path.resolve(dir)
    const ok = [this.globalDir, ...projects.map((p) => this.projectDir(p.id)).filter(Boolean)].some(
      (root) => path.dirname(abs).toLowerCase() === path.resolve(root as string).toLowerCase()
    )
    if (!ok || !fs.existsSync(path.join(abs, 'SKILL.md'))) throw new Error(t('Kein Skill-Ordner'))
    await this.trash(abs)
  }
}
