import { t } from '../shared/i18n'
import { ipcMain, shell, type BrowserWindow } from 'electron'
import type { ProjectStore } from './projectStore'
import type { GitService } from './gitService'

export function registerGitIpc(git: GitService, projects: ProjectStore, win: () => BrowserWindow | null): void {
  const cwd = (projectId: unknown): string => {
    const p = typeof projectId === 'string' ? projects.get(projectId) : undefined
    if (!p || p.missing) throw new Error(t('Projekt nicht gefunden'))
    return p.path
  }
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  const send = (ch: string, ...args: unknown[]): void => {
    const w = win()
    if (w && !w.isDestroyed()) w.webContents.send(ch, ...args)
  }

  ipcMain.handle('git:tools', () => git.tools())
  ipcMain.handle('git:install', (_e, tool) => {
    if (tool !== 'git' && tool !== 'gh') return false
    return git.install(tool, (line) => send('git:installLog', tool, line))
  })
  ipcMain.handle('git:login', async () => {
    await git.githubLogin((code, url) => {
      send('git:loginCode', code, url)
      void shell.openExternal(url)
    })
  })
  ipcMain.on('git:cancelLogin', () => git.cancelLogin())

  ipcMain.handle('git:status', (_e, id) => git.status(cwd(id)))
  ipcMain.handle('git:diff', (_e, id, file, staged, untracked) => git.diff(cwd(id), String(file), !!staged, !!untracked))
  ipcMain.handle('git:stage', (_e, id, paths) => git.stage(cwd(id), list(paths)))
  ipcMain.handle('git:stageAll', (_e, id) => git.stageAll(cwd(id)))
  ipcMain.handle('git:unstage', (_e, id, paths, unborn) => git.unstage(cwd(id), list(paths), !!unborn))
  ipcMain.handle('git:discard', (_e, id, files) =>
    git.discard(
      cwd(id),
      (Array.isArray(files) ? files : []).map((f: { path?: unknown; untracked?: unknown }) => ({ path: String(f?.path ?? ''), untracked: !!f?.untracked }))
    )
  )
  ipcMain.handle('git:commit', (_e, id, message, all) => git.commit(cwd(id), String(message ?? ''), !!all))
  ipcMain.handle('git:log', (_e, id) => git.log(cwd(id)))
  // Hotspots fürs Gehirn: unbekanntes Projekt (z. B. „Über dich“) → leer statt Fehler
  ipcMain.handle('brain:hotspots', (_e, id) => {
    const p = typeof id === 'string' ? projects.get(id) : undefined
    return p && !p.missing ? git.hotspots(p.path) : []
  })
  ipcMain.handle('git:branches', (_e, id) => git.branches(cwd(id)))
  ipcMain.handle('git:switch', (_e, id, name, create) => git.switchBranch(cwd(id), String(name ?? ''), !!create))
  ipcMain.handle('git:show', (_e, id, hash) => git.show(cwd(id), String(hash)))
  ipcMain.handle('git:init', (_e, id) => git.init(cwd(id)))
  ipcMain.handle('git:pull', (_e, id) => git.pull(cwd(id)))
  ipcMain.handle('git:push', (_e, id, hasUpstream) => git.push(cwd(id), !!hasUpstream))
  ipcMain.handle('git:fetch', (_e, id) => git.fetch(cwd(id)))
  ipcMain.handle('git:publish', (_e, id, name, priv) => git.publish(cwd(id), String(name ?? ''), !!priv))
  ipcMain.handle('git:aiMessage', (_e, id) => git.aiMessage(cwd(id)))
  ipcMain.handle('git:prInfo', (_e, id) => git.prInfo(cwd(id)))
  ipcMain.handle('git:aiPr', (_e, id) => git.aiPr(cwd(id)))
  ipcMain.handle('git:createPr', (_e, id, o: { title?: unknown; body?: unknown; branch?: unknown; draft?: unknown }) =>
    git.createPr(cwd(id), { title: String(o?.title ?? ''), body: String(o?.body ?? '').slice(0, 60_000), branch: typeof o?.branch === 'string' ? o.branch : undefined, draft: !!o?.draft })
  )
  ipcMain.on('git:openWeb', (_e, url: unknown) => {
    if (typeof url === 'string' && /^https:\/\//.test(url)) void shell.openExternal(url)
  })
}
