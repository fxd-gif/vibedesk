import { create } from 'zustand'
import type { EditorState } from '@codemirror/state'
import { api } from '../api'
import type { Project } from '../../../shared/types'
import { alert, choose } from './dialogStore'
import { createEditorStore, samePath } from './editorModel'
import { useSettings } from './settingsStore'
import { centeredRect, useUi } from './uiStore'
import { useSessions } from './sessionStore'

export const EDITOR_ID = 'editor'
export const EDITOR_SIZE = { w: 980, h: 640 }

export const useEditor = createEditorStore(() => api.files)

interface EditorUi {
  projects: Project[]
  projectId: string | null
  treeOpen: boolean
}

export const useEditorUi = create<EditorUi>(() => ({ projects: [], projectId: null, treeOpen: true }))

/** CodeMirror-Zustände pro Tab (Inhalt, Undo, Cursor) – vom EditorWindow gepflegt. */
export const editorDocs = new Map<string, EditorState>()

export const docText = (path: string): string | undefined => {
  for (const [k, st] of editorDocs) if (samePath(k, path)) return st.doc.toString()
  return undefined
}

const dirtyTabs = () => useEditor.getState().tabs.filter((t) => t.dirty)

export const currentProject = (): Project | undefined => {
  const { projects, projectId } = useEditorUi.getState()
  return projects.find((p) => p.id === projectId)
}

async function loadProjects(): Promise<Project[]> {
  const projects = await api.projects.list()
  useEditorUi.setState({ projects })
  return projects
}

const norm = (p: string): string => p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()

function projectOf(projects: Project[], file: string): Project | undefined {
  const f = norm(file)
  // längster Treffer gewinnt (verschachtelte Projekte)
  return projects
    .filter((p) => !p.missing && (f === norm(p.path) || f.startsWith(norm(p.path) + '\\')))
    .sort((a, b) => b.path.length - a.path.length)[0]
}

/** Fragt bei ungespeicherten Tabs nach. false = Abbrechen. */
export async function settleDirty(what: string, only?: (t: import('./editorModel').Tab) => boolean): Promise<boolean> {
  const dirty = dirtyTabs().filter((t) => !only || only(t))
  if (!dirty.length) return true
  const names = dirty.map((t) => t.name).join(', ')
  const r = await choose({
    title: dirty.length === 1 ? `„${dirty[0].name}“ speichern?` : `${dirty.length} Dateien speichern?`,
    message: `Ungespeicherte Änderungen in ${names}. ${what}`,
    confirmLabel: 'Speichern',
    altLabel: 'Verwerfen'
  })
  if (r === 'cancel') return false
  if (r === 'alt') return true
  for (const t of dirty) {
    const text = docText(t.path)
    if (text === undefined || !(await useEditor.getState().save(t.path, text))) {
      await alert(`„${t.name}“ konnte nicht gespeichert werden`, useEditor.getState().tabs.find((x) => x.path === t.path)?.error ?? 'Die Datei wurde inzwischen geändert.')
      return false
    }
  }
  return true
}

function persistTabs(): void {
  const { projectId } = useEditorUi.getState()
  const s = useSettings.getState().s
  if (!projectId || !s) return
  const paths = useEditor.getState().tabs.map((t) => t.path)
  useSettings.getState().set({ editorTabs: { ...s.editorTabs, [projectId]: paths } })
}

async function switchProject(id: string): Promise<boolean> {
  if (useEditorUi.getState().projectId === id) return true
  if (!(await settleDirty('Beim Projektwechsel werden die Tabs geschlossen.'))) return false
  useEditor.getState().closeAll()
  editorDocs.clear()
  useEditorUi.setState({ projectId: id })
  const saved = useSettings.getState().s?.editorTabs[id] ?? []
  for (const p of saved) await useEditor.getState().open(p)
  const first = useEditor.getState().tabs[0]
  if (first) useEditor.getState().activate(first.path)
  return true
}

export async function selectProject(id: string): Promise<void> {
  await switchProject(id)
}

const showWindow = (): void => useUi.getState().openWin(EDITOR_ID, centeredRect(EDITOR_SIZE.w, EDITOR_SIZE.h))

function focusedSessionProject(projects: Project[]): Project | undefined {
  const { open, minimized } = useUi.getState()
  const sessions = useSessions.getState().sessions
  for (let i = open.length - 1; i >= 0; i--) {
    if (!open[i].startsWith('term:') || minimized.includes(open[i])) continue
    const s = sessions.find((x) => 'term:' + x.id === open[i])
    const p = s && projects.find((x) => x.id === s.projectId && !x.missing)
    if (p) return p
  }
  return projects.find((p) => !p.missing)
}

/** Projektliste laden und – falls noch keins gewählt – das der fokussierten Session nehmen. */
export async function ensureProject(): Promise<void> {
  const projects = await loadProjects()
  if (!useEditorUi.getState().projectId || !currentProject()) {
    const p = focusedSessionProject(projects)
    if (p) await switchProject(p.id)
  }
}

export async function openEditor(): Promise<void> {
  await ensureProject()
  useEditorUi.setState({ treeOpen: true })
  showWindow()
  useUi.getState().focus(EDITOR_ID)
}

/** Dock-Klick: öffnen bzw. schließen. */
export async function toggleEditor(): Promise<void> {
  const ui = useUi.getState()
  if (ui.open.includes(EDITOR_ID) && !ui.minimized.includes(EDITOR_ID)) {
    await closeEditor()
    return
  }
  await ensureProject()
  useEditorUi.setState({ treeOpen: true })
  showWindow()
}

export async function closeEditor(): Promise<void> {
  if (!(await settleDirty('Der Editor wird geschlossen.'))) return
  useUi.getState().closeWin(EDITOR_ID)
}

/** Aus dem Live-Feed: Datei öffnen und zur Stelle springen. */
export async function openInEditor(path: string, find?: string, line?: number): Promise<void> {
  const projects = await loadProjects()
  const p = projectOf(projects, path)
  if (!p) {
    await alert('Datei liegt außerhalb des Projekts', path)
    return
  }
  if (!(await switchProject(p.id))) return
  const r = await useEditor.getState().open(path, { find, line })
  if (!r.ok) {
    await alert(r.code === 'not_found' ? 'Datei existiert nicht mehr' : 'Datei konnte nicht geöffnet werden', r.message === r.code ? path : `${r.message}\n${path}`)
    return
  }
  useEditorUi.setState({ treeOpen: false })
  showWindow()
  useUi.getState().focus(EDITOR_ID)
}

let wired = false
export function wireEditor(): void {
  if (wired) return
  wired = true
  api.on.fileChange((c) => useEditor.getState().external(c))
  let last = ''
  useEditor.subscribe((s) => {
    const key = s.tabs.map((t) => t.path).join('|')
    if (key !== last) {
      last = key
      persistTabs()
    }
  })
  // Beenden mit ungespeicherten Tabs → erst nachfragen
  let allowQuit = false
  window.addEventListener('beforeunload', (e) => {
    if (allowQuit || !dirtyTabs().length) return
    e.preventDefault()
    e.returnValue = false
    useUi.getState().focus(EDITOR_ID)
    settleDirty('VibeDesk wird beendet.').then((ok) => {
      if (!ok) return
      allowQuit = true
      api.app.quit()
    })
  })
}
