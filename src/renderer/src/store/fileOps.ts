// Dateien im Editor anlegen, umbenennen und löschen – offene Tabs ziehen mit.
import { t } from '../../../shared/i18n'
import { api } from '../api'
import { alert, confirm, prompt } from './dialogStore'
import { baseName, samePath } from './editorModel'
import { editorDocs, settleDirty, useEditor } from './editorStore'

const norm = (p: string): string => p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
/** true, wenn `p` der Pfad selbst oder etwas darin ist */
export const isUnder = (p: string, root: string): boolean => samePath(p, root) || norm(p).startsWith(norm(root) + '\\')

const affectedTabs = (path: string) => useEditor.getState().tabs.filter((t) => isUnder(t.path, path))

export async function createEntry(parent: string, kind: 'file' | 'dir'): Promise<string | null> {
  const name = await prompt({
    title: kind === 'file' ? t('Neue Datei') : t('Neuer Ordner'),
    message: t('Unterordner gehen mit „/“, z. B. src/utils/format.ts'),
    placeholder: kind === 'file' ? 'name.ts' : t('ordner'),
    confirmLabel: t('Anlegen')
  })
  if (!name) return null
  const r = await api.files.create(parent, name, kind)
  if (!r.ok) {
    await alert(t('Anlegen fehlgeschlagen'), r.message)
    return null
  }
  if (kind === 'file') await useEditor.getState().open(r.path)
  return r.path
}

export async function renameEntry(path: string): Promise<string | null> {
  if (!(await settleDirty(t('Vor dem Umbenennen.'), (tab) => isUnder(tab.path, path)))) return null
  const old = baseName(path)
  const name = await prompt({ title: t('„{name}“ umbenennen', { name: old }), defaultValue: old, confirmLabel: t('Umbenennen') })
  if (!name || name === old) return null
  const r = await api.files.rename(path, name)
  if (!r.ok) {
    await alert(t('Umbenennen fehlgeschlagen'), r.message)
    return null
  }
  // offene Tabs unter dem neuen Pfad wieder öffnen
  const ed = useEditor.getState()
  const wasActive = ed.active
  let nextActive: string | null = null
  for (const t of affectedTabs(path)) {
    const np = r.path + t.path.slice(path.length)
    editorDocs.delete(t.path)
    ed.close(t.path)
    const o = await useEditor.getState().open(np)
    if (o.ok && wasActive && samePath(wasActive, t.path)) nextActive = o.path
  }
  if (nextActive) useEditor.getState().activate(nextActive)
  else if (wasActive && useEditor.getState().tabs.some((t) => samePath(t.path, wasActive))) useEditor.getState().activate(wasActive)
  return r.path
}

export async function deleteEntry(path: string, isDir: boolean): Promise<boolean> {
  const name = baseName(path)
  const dirty = affectedTabs(path).filter((t) => t.dirty)
  const ok = await confirm({
    title: t('„{name}“ löschen?', { name }),
    message:
      (isDir ? t('Der Ordner wird mit seinem ganzen Inhalt in den Papierkorb verschoben.') : t('Die Datei wird in den Papierkorb verschoben.')) +
      (dirty.length ? ' ' + t('Ungespeicherte Änderungen in {names} gehen verloren.', { names: dirty.map((tab) => tab.name).join(', ') }) : ''),
    confirmLabel: t('In den Papierkorb'),
    danger: true
  })
  if (!ok) return false
  const r = await api.files.trash(path)
  if (!r.ok) {
    await alert(t('Löschen fehlgeschlagen'), r.message)
    return false
  }
  for (const t of affectedTabs(path)) {
    editorDocs.delete(t.path)
    useEditor.getState().close(t.path)
  }
  return true
}
