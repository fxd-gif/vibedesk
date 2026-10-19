import { app, BrowserWindow, clipboard, ipcMain, Notification, shell } from 'electron'
import { resolveLang, setLang, t } from '../shared/i18n'
import fs from 'fs'
import path from 'path'
import type { ProjectStore } from './projectStore'
import type { SettingsStore } from './settingsStore'
import { randomUUID } from 'crypto'
import { candidatesFromFiles, candidatesFromPath, readSkillFiles } from './skillStore'
import { decodeShare, encodeShare, fileBytes, toSharedFile } from '../shared/shareCode'
import { fetchGithubCandidates } from './github'
import { listClaudeSessions } from './claudeHistory'
import { saveShot } from './shots'
import { pickDevScript } from '../shared/devScript'
import type { SkillTarget } from '../shared/types'

export interface IpcDeps {
  win: () => BrowserWindow | null
  projects: ProjectStore
  settings: SettingsStore
}

/** Liefert bis zu 8 Unterordner, die zum eingegebenen Pfadpräfix passen. */
export function suggestDirs(prefix: string): string[] {
  if (!prefix) return []
  const endsWithSep = /[\\/]$/.test(prefix)
  const dir = endsWithSep ? prefix : path.dirname(prefix)
  const part = endsWithSep ? '' : path.basename(prefix).toLowerCase()
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('$') && d.name.toLowerCase().startsWith(part))
      .slice(0, 8)
      .map((d) => path.join(dir, d.name))
  } catch {
    return []
  }
}

export function registerCoreIpc(d: IpcDeps): void {
  // „Zeig drauf“: Ausschnitt der Vorschau als PNG, Claude liest ihn über den Pfad
  ipcMain.handle('preview:saveShot', (_e, dataUrl: unknown) => saveShot(path.join(app.getPath('userData'), 'shots'), dataUrl))
  ipcMain.handle('settings:get', () => d.settings.get())
  ipcMain.handle('settings:set', (_e, patch) => {
    const s = d.settings.set(patch)
    // Texte aus Main (Dialoge, Benachrichtigungen) folgen der Sprache sofort
    setLang(resolveLang(s.language, app.getLocale()))
    return s
  })

  ipcMain.handle('projects:list', () => d.projects.list())
  ipcMain.handle('projects:create', (_e, name: string) => d.projects.create(name))
  ipcMain.handle('projects:add', (_e, dir: string) => d.projects.add(dir))
  ipcMain.handle('projects:remove', (_e, id: string, trash: boolean) => d.projects.remove(id, { trash }))

  ipcMain.handle('fs:suggestDirs', (_e, prefix: string) => suggestDirs(prefix))

  ipcMain.on('app:exitFullscreen', () => d.win()?.setFullScreen(false))
  ipcMain.on('app:toggleFullscreen', () => {
    const w = d.win()
    if (w) w.setFullScreen(!w.isFullScreen())
  })
  ipcMain.on('app:quit', () => app.quit())
  // Windows-Benachrichtigung; Klick holt VibeDesk nach vorn und sagt dem Renderer, welche Mitteilung gemeint war
  const shown = new Set<Notification>()
  ipcMain.on('app:notify', (_e, id: number, title: string, body: string) => {
    if (!Notification.isSupported()) return
    const n = new Notification({ title: String(title).slice(0, 120), body: String(body).slice(0, 300), silent: true })
    // Referenz halten, sonst räumt der GC die Benachrichtigung samt Klick-Handler ab
    shown.add(n)
    const drop = (): void => void shown.delete(n)
    n.on('close', drop)
    n.on('click', () => {
      drop()
      const w = d.win()
      if (!w) return
      if (w.isMinimized()) w.restore()
      w.show()
      w.focus()
      w.webContents.send('notify:click', id)
    })
    n.show()
  })
  ipcMain.on('clipboard:write', (_e, text: string) => clipboard.writeText(String(text).slice(0, 2_000_000)))
  ipcMain.handle('clipboard:read', async () => String(await clipboard.readText()).slice(0, 2_000_000))
}

export interface SessionIpcDeps {
  sessions: import('./sessionManager').SessionManager
  projects: ProjectStore
  claudeProjectsDir: string
}

export function registerNotesIpc(notes: import('./notesStore').NotesStore): void {
  ipcMain.handle('notes:get', (_e, id: string) => notes.get(id))
  ipcMain.handle('notes:set', (_e, id: string, text: string) => notes.set(id, String(text).slice(0, 1_000_000)))
}

export function registerSessionIpc(d: SessionIpcDeps): void {
  ipcMain.handle('history:list', (_e, projectId: string) => {
    const p = d.projects.get(projectId)
    return p ? listClaudeSessions(p.path, d.claudeProjectsDir) : []
  })
  ipcMain.handle('sessions:start', (_e, projectId: string, resumeId?: string, cwd?: string) => {
    const p = d.projects.get(projectId)
    if (!p) throw new Error(t('Projekt nicht gefunden'))
    if (!fs.existsSync(p.path)) throw new Error(t('Projektordner fehlt: {path}', { path: p.path }))
    const info = d.sessions.start(p, { resumeId, cwd: typeof cwd === 'string' && cwd ? cwd : undefined })
    d.projects.touch(p.id)
    return info
  })
  ipcMain.handle('sessions:stop', (_e, id: string) => d.sessions.stop(id))
  ipcMain.handle('sessions:list', () => d.sessions.list())
  // Dev-Server per Klick: Skript aus package.json im Ordner der Session (auch Worktrees)
  ipcMain.handle('sessions:devScript', (_e, id: unknown) => {
    const s = d.sessions.list().find((x) => x.id === id)
    if (!s) return null
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(s.cwd, 'package.json'), 'utf8'))
      return pickDevScript(pkg, fs.readdirSync(s.cwd))
    } catch {
      return null
    }
  })
  ipcMain.on('sessions:write', (_e, id: string, data: string) => d.sessions.write(id, data))
  ipcMain.on('sessions:resize', (_e, id: string, cols: number, rows: number) => d.sessions.resize(id, cols, rows))
}

export interface SkillIpcDeps {
  skills: import('./skillStore').SkillStore
  projects: ProjectStore
}

export function registerSkillIpc(d: SkillIpcDeps): void {
  // Kandidaten bleiben im Main-Prozess, der Renderer sieht nur Token + Metadaten
  const pending = new Map<string, import('./skillStore').SkillCandidate>()
  const summarize = (cands: import('./skillStore').SkillCandidate[]) => {
    if (!cands.length) throw new Error(t('Keine SKILL.md mit gültigem Frontmatter (name, description) gefunden'))
    return cands.map((c) => {
      const token = randomUUID()
      pending.set(token, c)
      return { token, name: c.name, description: c.description }
    })
  }
  ipcMain.handle('skills:list', () => d.skills.list(d.projects.list()))
  ipcMain.handle('skills:importPaths', (_e, paths: string[]) => summarize(paths.flatMap((p) => candidatesFromPath(p))))
  ipcMain.handle('skills:importGithub', async (_e, url: string) => summarize(await fetchGithubCandidates(url)))
  ipcMain.handle('skills:install', async (_e, tokens: string[], target: SkillTarget, replace: boolean) => {
    const out = []
    for (const tok of tokens) {
      const c = pending.get(tok)
      if (!c) throw new Error(t('Import abgelaufen – bitte erneut hinzufügen'))
      out.push(await d.skills.install(c, target, { replace }))
      pending.delete(tok)
    }
    return out
  })
  ipcMain.handle('skills:remove', (_e, dir: string) => d.skills.remove(dir, d.projects.list()))
  ipcMain.handle('skills:exportCode', (_e, dir: string, from: string) => {
    if (!d.skills.isSkillDir(String(dir), d.projects.list())) throw new Error(t('Kein Skill-Ordner'))
    const files = readSkillFiles(String(dir))
    const cand = candidatesFromFiles(files).find((c) => c.files.has('SKILL.md') && [...c.files.keys()].length === files.length)
    if (!cand) throw new Error(t('Die SKILL.md dieses Skills hat kein gültiges Frontmatter (name, description).'))
    return encodeShare({ kind: 'skill', name: cand.name, description: cand.description, files: files.map((f) => toSharedFile(f.path, f.data)), from: String(from ?? '').slice(0, 40) })
  })
  ipcMain.handle('skills:importCode', (_e, code: string) => {
    const e = decodeShare(String(code))
    if (e.kind !== 'skill') throw new Error(t('Der Code enthält keinen Skill.'))
    return summarize(candidatesFromFiles(e.files.map((f) => ({ path: f.path, data: fileBytes(f) }))).filter((c) => c.files.has('SKILL.md') && c.files.size === e.files.length))
  })
}

export function registerFileIpc(files: import('./fileService').FileService, watcher: import('./fileService').FileWatcher): void {
  ipcMain.handle('files:list', (_e, dir: string) => files.list(dir))
  ipcMain.handle('files:read', (_e, p: string) => files.read(p))
  ipcMain.handle('files:write', (_e, p: string, text: string, expectedMtime: number | null, eol: 'lf' | 'crlf', bom: boolean) =>
    files.write(p, String(text), typeof expectedMtime === 'number' ? expectedMtime : null, eol === 'crlf' ? 'crlf' : 'lf', !!bom)
  )
  ipcMain.handle('files:create', (_e, parent: string, name: string, kind: string) => files.create(parent, String(name ?? ''), kind === 'dir' ? 'dir' : 'file'))
  ipcMain.handle('files:rename', (_e, p: string, name: string) => files.rename(p, String(name ?? '')))
  ipcMain.handle('files:trash', async (_e, p: string) => {
    const r = files.removable(p)
    if (!r.ok) return r
    try {
      await shell.trashItem(r.path)
      return r
    } catch (err) {
      return { ok: false, code: 'io', message: (err as Error).message }
    }
  })
  ipcMain.on('files:watch', (_e, p: string) => {
    const f = files.resolve(p)
    if (f) watcher.watch(f)
  })
  ipcMain.on('files:unwatch', (_e, p: string) => {
    const f = files.resolve(p)
    if (f) watcher.unwatch(f)
  })
  ipcMain.on('files:reveal', (_e, p: string) => {
    const f = files.resolve(p)
    if (f) shell.showItemInFolder(f)
  })
}
