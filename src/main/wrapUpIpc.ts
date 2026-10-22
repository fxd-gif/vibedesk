// Session-Abschluss: Zusammenfassung aus dem Protokoll, Änderungen und Commit im Arbeitsordner der Session.
import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import { t } from '../shared/i18n'
import { lastAssistantText, type WrapChanges } from '../shared/wrapUp'
import type { GitService } from './gitService'
import type { SessionManager } from './sessionManager'

/** vom Protokollende reicht dieses Stück für die letzte Antwort */
const TAIL_BYTES = 1024 * 1024

/** Nur Claudes eigene Protokolle lesen – der Pfad kommt aus einem Hook und damit von außen */
export function transcriptAllowed(file: unknown, projectsDir: string): file is string {
  if (typeof file !== 'string' || !file.toLowerCase().endsWith('.jsonl')) return false
  const rel = path.relative(path.resolve(projectsDir), path.resolve(file))
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel)
}

/** Letzte Antwort von Claude aus dem Ende des Protokolls */
export async function readSummary(file: string, tail = TAIL_BYTES): Promise<string> {
  let fh: fs.promises.FileHandle | null = null
  try {
    fh = await fs.promises.open(file, 'r')
    const size = (await fh.stat()).size
    const start = Math.max(0, size - tail)
    const buf = Buffer.alloc(size - start)
    await fh.read(buf, 0, buf.length, start)
    const lines = buf.toString('utf8').split('\n')
    // mitten in einer Zeile angefangen: die erste ist unvollständig
    if (start > 0) lines.shift()
    return lastAssistantText(lines)
  } catch {
    return ''
  } finally {
    await fh?.close()
  }
}

export function registerWrapUpIpc(d: { sessions: SessionManager; git: GitService; claudeProjectsDir: string }): void {
  const cwd = (sessionId: unknown): string => {
    const s = d.sessions.list().find((x) => x.id === sessionId)
    if (!s) throw new Error(t('Diese Session läuft nicht mehr.'))
    return s.cwd
  }
  ipcMain.handle('wrapup:summary', (_e, file: unknown) => (transcriptAllowed(file, d.claudeProjectsDir) ? readSummary(file) : ''))
  ipcMain.handle('wrapup:changes', (_e, id): Promise<WrapChanges> => d.git.changes(cwd(id)))
  ipcMain.handle('wrapup:aiMessage', (_e, id) => d.git.aiMessage(cwd(id)))
  ipcMain.handle('wrapup:commit', (_e, id, message) => d.git.commit(cwd(id), String(message ?? ''), true))
}
