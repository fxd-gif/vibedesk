import { t } from '../shared/i18n'
import { ipcMain, type BrowserWindow } from 'electron'
import type { GitService } from './gitService'
import type { MergeService } from './mergeService'
import type { ProjectStore } from './projectStore'
import type { SettingsStore } from './settingsStore'

export function registerMergeIpc(merge: MergeService, git: GitService, projects: ProjectStore, settings: SettingsStore, win: () => BrowserWindow | null): void {
  const root = (projectId: unknown): string => {
    const p = typeof projectId === 'string' ? projects.get(projectId) : undefined
    if (!p || p.missing) throw new Error(t('Projekt nicht gefunden'))
    return p.path
  }
  const str = (v: unknown): string => (typeof v === 'string' ? v : '')
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  const hunks = (v: unknown): Record<string, number[]> | null => {
    if (!v || typeof v !== 'object') return null
    const out: Record<string, number[]> = {}
    for (const [k, idx] of Object.entries(v as Record<string, unknown>)) if (Array.isArray(idx)) out[k] = idx.filter((n): n is number => Number.isInteger(n) && n >= 0)
    return out
  }
  const testCmd = (id: unknown): string | null => (typeof id === 'string' ? settings.get().mergeTestCmd?.[id] : undefined) || null
  const send = (ch: string, ...args: unknown[]): void => {
    const w = win()
    if (w && !w.isDestroyed()) w.webContents.send(ch, ...args)
  }

  ipcMain.handle('merge:overview', (_e, id) => merge.overview(root(id), testCmd(id)))
  ipcMain.handle('merge:fileDiff', (_e, id, wt, file) => merge.fileDiff(root(id), str(wt), str(file)))
  ipcMain.handle('merge:create', (_e, id, name) => merge.create(root(id), str(name)))
  ipcMain.handle('merge:commit', (_e, id, wt, message) => merge.commit(root(id), str(wt), str(message)))
  ipcMain.handle('merge:aiMessage', async (_e, id, wt) => git.aiMessage((await merge.worktree(root(id), wt)).path))
  ipcMain.handle('merge:apply', (_e, id, wt, files, h, confirmed) => merge.apply(root(id), str(wt), list(files), hunks(h), confirmed === true))
  ipcMain.handle('merge:merge', (_e, id, branch, confirmed) => merge.merge(root(id), str(branch), confirmed === true))
  ipcMain.handle('merge:abort', (_e, id, confirmed) => merge.abort(root(id), confirmed === true))
  ipcMain.handle('merge:finish', (_e, id) => merge.finish(root(id)))
  ipcMain.handle('merge:checkpoint', (_e, id, label) => merge.checkpoint(root(id), str(label)))
  ipcMain.handle('merge:checkpoints', (_e, id) => merge.checkpoints(root(id)))
  ipcMain.handle('merge:restore', (_e, id, ref, resetBranch, confirmed) => merge.restore(root(id), str(ref), resetBranch === true, confirmed === true))
  ipcMain.handle('merge:removeWorktree', (_e, id, wt, force, confirmed) => merge.removeWorktree(root(id), str(wt), force === true, confirmed === true))
  ipcMain.handle('merge:deleteBranch', (_e, id, branch, confirmed) => merge.deleteBranch(root(id), str(branch), confirmed === true))
  ipcMain.handle('merge:review', (_e, id) => merge.review(root(id)))
  ipcMain.handle('merge:runTests', (_e, id, wt, cmd) => merge.runTests(root(id), str(wt), str(cmd), (line) => send('merge:testLog', line)))
  ipcMain.on('merge:stopTests', () => merge.stopTests())
}
