import { useEffect, useRef, useState } from 'react'
import { Prec, type EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { api } from '../../api'
import { choose, confirm } from '../../store/dialogStore'
import { isSensitiveFile } from '../../../../shared/redact'
import { useSettings } from '../../store/settingsStore'
import { samePath, type Tab } from '../../store/editorModel'
import { currentProject, editorDocs, ensureProject, selectProject, useEditor, useEditorUi } from '../../store/editorStore'
import { createState, revealLine, revealText } from './cmSetup'
import { FileTree } from './FileTree'
import { t } from '../../../../shared/i18n'

function extrasFor(path: string) {
  return [
    Prec.highest(
      keymap.of([
        {
          key: 'Mod-s',
          preventDefault: true,
          run: (v) => {
            useEditor.getState().save(path, v.state.doc.toString())
            return true
          }
        }
      ])
    ),
    EditorView.updateListener.of((u) => {
      editorDocs.set(path, u.state)
      if (!u.docChanged) return
      const tab = useEditor.getState().tabs.find((x) => samePath(x.path, path))
      if (tab) useEditor.getState().setDirty(path, u.state.doc.length !== tab.diskText.length || u.state.doc.toString() !== tab.diskText)
    })
  ]
}

/** Minimaler Austausch (gemeinsamer Anfang/Ende bleibt) → Cursor und Scroll bleiben stehen. */
function replaceSpec(st: EditorState, next: string) {
  const cur = st.doc.toString()
  let a = 0
  const max = Math.min(cur.length, next.length)
  while (a < max && cur.charCodeAt(a) === next.charCodeAt(a)) a++
  let b = 0
  while (b < max - a && cur.charCodeAt(cur.length - 1 - b) === next.charCodeAt(next.length - 1 - b)) b++
  return { changes: { from: a, to: cur.length - b, insert: next.slice(a, next.length - b) } }
}

const relPath = (file: string, root?: string): string =>
  root && file.toLowerCase().startsWith(root.toLowerCase()) ? file.slice(root.length).replace(/^[\\/]+/, '') : file

async function closeTab(tab: Tab): Promise<void> {
  if (tab.dirty) {
    const r = await choose({ title: t('„{name}“ speichern?', { name: tab.name }), message: t('Die Datei hat ungespeicherte Änderungen.'), confirmLabel: t('Speichern'), altLabel: t('Verwerfen') })
    if (r === 'cancel') return
    if (r === 'ok') {
      const st = editorDocs.get(tab.path)
      if (!st || !(await useEditor.getState().save(tab.path, st.doc.toString()))) return
    }
  }
  editorDocs.delete(tab.path)
  useEditor.getState().close(tab.path)
}

function Banner({ tab }: { tab: Tab }): React.JSX.Element | null {
  const ed = useEditor.getState()
  if (tab.conflict === 'changed')
    return (
      <div className="ed-banner warn" data-testid="editor-conflict">
        <span>{t('Claude hat diese Datei geändert, während du sie bearbeitet hast.')}</span>
        <button className="btn small" onClick={() => ed.resolveConflict(tab.path, 'theirs')}>
          {t('Claudes Version laden')}
        </button>
        <button className="btn small primary" onClick={() => ed.resolveConflict(tab.path, 'mine')}>
          {t('Meine behalten')}
        </button>
      </div>
    )
  if (tab.conflict === 'deleted')
    return (
      <div className="ed-banner warn">
        <span>{t('Die Datei wurde gelöscht. Mit Strg+S legst du sie neu an.')}</span>
        <button className="btn small" onClick={() => closeTab({ ...tab, dirty: false })}>
          {t('Tab schließen')}
        </button>
      </div>
    )
  if (tab.error)
    return (
      <div className="ed-banner err">
        <span>{t('Speichern fehlgeschlagen: {error}', { error: tab.error })}</span>
      </div>
    )
  if (tab.force)
    return (
      <div className="ed-banner info">
        <span>{t('Beim nächsten Speichern (Strg+S) wird Claudes Version überschrieben.')}</span>
      </div>
    )
  return null
}

export function EditorWindow(): React.JSX.Element {
  const tabs = useEditor((s) => s.tabs)
  const active = useEditor((s) => s.active)
  const reveal = useEditor((s) => s.reveal)
  const projects = useEditorUi((s) => s.projects)
  const projectId = useEditorUi((s) => s.projectId)
  const treeOpen = useEditorUi((s) => s.treeOpen)
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const shown = useRef<string | null>(null)
  const revs = useRef(new Map<string, number>())

  const activeTab = tabs.find((t) => t.path === active)
  const project = currentProject()
  // Streamer-Modus: .env & Co. erst nach Bestätigung zeigen
  const protect = useSettings((x) => !!x.s?.streamer.enabled && !!x.s?.streamer.protectFiles)
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set())
  const veiled = !!activeTab && activeTab.status === 'ready' && protect && isSensitiveFile(activeTab.path) && !unlocked.has(activeTab.path)

  useEffect(() => {
    ensureProject()
    view.current = new EditorView({ parent: host.current! })
    return () => {
      view.current?.destroy()
      view.current = null
      shown.current = null
    }
  }, [])

  // Tab-Wechsel: CodeMirror-Zustand des Tabs einsetzen (Undo & Cursor bleiben pro Tab)
  useEffect(() => {
    const v = view.current
    if (!v) return
    if (!activeTab || activeTab.status !== 'ready') {
      shown.current = null
      return
    }
    if (shown.current === activeTab.path) return
    let st = editorDocs.get(activeTab.path)
    if (!st) {
      st = createState(activeTab.diskText, activeTab.path, extrasFor(activeTab.path))
      editorDocs.set(activeTab.path, st)
      revs.current.set(activeTab.path, activeTab.rev)
    }
    v.setState(st)
    shown.current = activeTab.path
    v.focus()
    // Host war evtl. unsichtbar bzw. das Fenster skaliert noch beim Einblenden → neu vermessen
    requestAnimationFrame(() => v.requestMeasure())
    setTimeout(() => v.dom.isConnected && v.requestMeasure(), 250)
  }, [activeTab?.path, activeTab?.status])

  // Von außen neu geladene Dateien übernehmen; geschlossene Tabs aufräumen
  useEffect(() => {
    for (const t of tabs) {
      const st = editorDocs.get(t.path)
      if (!st || revs.current.get(t.path) === t.rev) continue
      revs.current.set(t.path, t.rev)
      const spec = replaceSpec(st, t.diskText)
      if (shown.current === t.path && view.current) view.current.dispatch(spec)
      else editorDocs.set(t.path, st.update(spec).state)
    }
    for (const k of [...editorDocs.keys()]) if (!tabs.some((t) => t.path === k)) editorDocs.delete(k)
  }, [tabs])

  // Sprung zu Claudes Änderung
  useEffect(() => {
    if (!reveal || !view.current || shown.current !== reveal.path) return
    const v = view.current
    requestAnimationFrame(() => {
      if (reveal.find) revealText(v, reveal.find)
      else if (reveal.line) revealLine(v, reveal.line)
      v.focus()
    })
  }, [reveal?.seq, activeTab?.path])

  return (
    <div className="editor" data-testid="editor">
      <div className="ed-top">
        <button className={`ed-icon${treeOpen ? ' on' : ''}`} title={treeOpen ? t('Dateibaum ausblenden') : t('Dateibaum einblenden')} onClick={() => useEditorUi.setState({ treeOpen: !treeOpen })}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 4v16" />
          </svg>
        </button>
        <select className="ed-project" value={projectId ?? ''} onChange={(e) => selectProject(e.target.value)} title={t('Projekt')}>
          {!projectId && <option value="">{t('Projekt wählen …')}</option>}
          {projects.map((p) => (
            <option key={p.id} value={p.id} disabled={p.missing}>
              {p.name}
              {p.missing ? t(' (fehlt)') : ''}
            </option>
          ))}
        </select>
        <div className="ed-tabs">
          {tabs.map((tab) => (
            <div
              key={tab.path}
              className={`ed-tab${tab.path === active ? ' on' : ''}${tab.conflict ? ' conflict' : ''}`}
              onClick={() => useEditor.getState().activate(tab.path)}
              onAuxClick={(e) => e.button === 1 && closeTab(tab)}
              title={tab.path}
              data-testid="editor-tab"
            >
              <span className="ed-tab-name">{tab.name}</span>
              <button
                className={`ed-tab-x${tab.dirty ? ' dirty' : ''}`}
                title={tab.dirty ? t('Ungespeichert – schließen') : t('Schließen')}
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab)
                }}
              >
                <span className="ed-dot" />
                <span className="ed-x">×</span>
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="ed-main">
        {treeOpen && project && (
          <FileTree root={project.path} active={active} onOpen={(p) => useEditor.getState().open(p)} />
        )}
        <div className="ed-pane">
          {activeTab && <Banner tab={activeTab} />}
          <div className="ed-cm" ref={host} style={{ display: activeTab?.status === 'ready' ? undefined : 'none' }} />
          {veiled && activeTab && (
            <div className="ed-veil" data-testid="editor-veil">
              <b>{activeTab.name}</b>
              <span className="dim">{t('kann Passwörter oder Schlüssel enthalten – im Streamer-Modus verborgen.')}</span>
              <button
                className="btn small"
                onClick={async () => {
                  if (await confirm({ title: t('„{name}“ anzeigen?', { name: activeTab.name }), message: t('Der Inhalt ist dann im Stream zu sehen. Zieh am besten vorher den Vorhang zu (Strg+Umschalt+H).'), confirmLabel: t('Anzeigen'), danger: true }))
                    setUnlocked(new Set([...unlocked, activeTab.path]))
                }}
              >
                {t('Trotzdem anzeigen')}
              </button>
            </div>
          )}
          {activeTab && activeTab.status !== 'ready' && (
            <div className="panel-empty ed-notice">
              <b>{activeTab.name}</b>
              <br />
              {activeTab.status === 'binary' ? t('Binärdatei – kann hier nicht bearbeitet werden.') : t('Größer als 2 MB – kann hier nicht bearbeitet werden.')}
              <br />
              <button className="btn small" style={{ marginTop: 12 }} onClick={() => api.files.reveal(activeTab.path)}>
                {t('Im Explorer zeigen')}
              </button>
            </div>
          )}
          {!activeTab && (
            <div className="panel-empty ed-notice">
              {project ? (
                <>
                  {t('Wähle links eine Datei –')}
                  <br />
                  {t('oder klicke im Live-Feed auf eine Änderung von Claude.')}
                </>
              ) : (
                t('Lege zuerst ein Projekt an.')
              )}
            </div>
          )}
          {activeTab?.status === 'ready' && (
            <div className="ed-status">
              <span className="mono">{relPath(activeTab.path, project?.path)}</span>
              <span>{activeTab.eol.toUpperCase()}</span>
              <span>{activeTab.dirty ? t('Strg+S speichern') : t('gespeichert')}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
