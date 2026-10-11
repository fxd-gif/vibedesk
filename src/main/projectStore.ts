import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type { Project } from '../shared/types'
import { readJson, writeJsonAtomic } from './jsonFile'

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

export function validateProjectName(name: string): string | null {
  if (!name.trim()) return 'Ungültiger Projektname: Name darf nicht leer sein'
  if (/[<>:"/\\|?*\x00-\x1f]/.test(name)) return 'Ungültiger Projektname: Zeichen < > : " / \\ | ? * sind nicht erlaubt'
  if (RESERVED.test(name)) return 'Ungültiger Projektname: von Windows reserviert'
  if (/[. ]$/.test(name)) return 'Ungültiger Projektname: darf nicht auf Punkt oder Leerzeichen enden'
  return null
}

export class ProjectStore {
  private projects: Project[]

  constructor(
    private file: string,
    private getProjectsDir: () => string,
    private trash: (p: string) => Promise<void>
  ) {
    this.projects = readJson<Project[]>(file, [])
  }

  list(): Project[] {
    return this.projects
      .map((p) => ({ ...p, missing: !fs.existsSync(p.path) }))
      .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0) || a.name.localeCompare(b.name))
  }

  get(id: string): Project | undefined {
    return this.projects.find((p) => p.id === id)
  }

  create(name: string): Project {
    const err = validateProjectName(name)
    if (err) throw new Error(err)
    const dir = path.join(this.getProjectsDir(), name)
    if (fs.existsSync(dir)) throw new Error('Ordner existiert bereits')
    fs.mkdirSync(dir, { recursive: true })
    return this.insert(name, dir)
  }

  add(dir: string): Project {
    const abs = path.resolve(dir)
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) throw new Error('Ordner nicht gefunden')
    if (this.projects.some((p) => p.path.toLowerCase() === abs.toLowerCase())) throw new Error('Projekt bereits vorhanden')
    return this.insert(path.basename(abs), abs)
  }

  touch(id: string): void {
    this.projects = this.projects.map((p) => (p.id === id ? { ...p, lastOpenedAt: Date.now() } : p))
    this.save()
  }

  async remove(id: string, opts: { trash: boolean }): Promise<void> {
    const p = this.get(id)
    if (!p) return
    if (opts.trash && fs.existsSync(p.path)) await this.trash(p.path)
    this.projects = this.projects.filter((x) => x.id !== id)
    this.save()
  }

  private insert(name: string, dir: string): Project {
    const p: Project = { id: randomUUID(), name, path: dir, createdAt: Date.now(), lastOpenedAt: null }
    this.projects = [...this.projects, p]
    this.save()
    return p
  }

  private save(): void {
    writeJsonAtomic(this.file, this.projects)
  }
}
