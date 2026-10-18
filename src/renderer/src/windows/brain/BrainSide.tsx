// Rechte Spalte des Gehirns: Notiz lesen/bearbeiten, Datei-Wissen, leere Links anlegen.
import { useEffect, useState } from 'react'
import { api, errorText } from '../../api'
import { NOTE_TYPES, fileId, noteId, type NoteDetail, type NoteType } from '../../../../shared/brain'
import type { BrainFileInfo } from '../../../../shared/types'
import { alert, confirm } from '../../store/dialogStore'
import { openInEditor } from '../../store/editorStore'
import { useSettings } from '../../store/settingsStore'
import { relTime } from '../../util'
import { Icon } from '../../desktop/icons'
import { KIND_COLOR, noteTypeLabel } from './BrainGraph'
import { t } from '../../../../shared/i18n'
import { Markdown } from './Markdown'

export interface Draft {
  title: string
  type: NoteType
  body: string
  files: string
  /** bisheriger Titel beim Bearbeiten */
  prev?: string
}

export const emptyDraft = (o: Partial<Draft> = {}): Draft => ({ title: '', type: 'fact', body: '', files: '', ...o })

interface Props {
  projectId: string
  selected: string | null
  draft: Draft | null
  setDraft(d: Draft | null): void
  onSelect(id: string | null): void
  onSaved(title: string): void
}

function Editor({ projectId, draft, setDraft, onSaved }: { projectId: string; draft: Draft; setDraft(d: Draft | null): void; onSaved(t: string): void }): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const save = async (): Promise<void> => {
    setBusy(true)
    try {
      const files = draft.files
        .split(/[\n,]/)
        .map((f) => f.trim())
        .filter(Boolean)
      const n = await api.brain.write(projectId, { title: draft.title, type: draft.type, body: draft.body, files }, draft.prev)
      setDraft(null)
      onSaved(n.title)
    } catch (err) {
      await alert(t('Notiz nicht gespeichert'), errorText(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="bs-edit" data-testid="brain-editor">
      <input className="field" placeholder={t('Titel')} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} autoFocus={!draft.prev} data-testid="brain-title" />
      <div className="bs-types">
        {NOTE_TYPES.map((k) => (
          <button key={k} className={`chip${draft.type === k ? ' on' : ''}`} onClick={() => setDraft({ ...draft, type: k })}>
            <i style={{ background: KIND_COLOR[k] }} />
            {noteTypeLabel(k)}
          </button>
        ))}
      </div>
      <textarea
        className="field mono"
        placeholder={t('Was sollte Claude (und du) beim nächsten Mal wissen?\nVerlinke verwandte Notizen mit [[Titel]].')}
        value={draft.body}
        onChange={(e) => setDraft({ ...draft, body: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 's' && e.ctrlKey) {
            e.preventDefault()
            void save()
          }
        }}
        data-testid="brain-body"
      />
      <input className="field small mono" placeholder={t('Dateien, z. B. src/main/index.ts, src/app.tsx')} value={draft.files} onChange={(e) => setDraft({ ...draft, files: e.target.value })} />
      <div className="row between">
        <button className="btn small ghost" onClick={() => setDraft(null)}>
          {t('Abbrechen')}
        </button>
        <button className="btn small primary" disabled={busy || !draft.title.trim() || !draft.body.trim()} onClick={() => void save()} data-testid="brain-save">
          {t('Speichern')}
        </button>
      </div>
    </div>
  )
}

export function BrainSide({ projectId, selected, draft, setDraft, onSelect, onSaved }: Props): React.JSX.Element | null {
  const [note, setNote] = useState<NoteDetail | null>(null)
  const [file, setFile] = useState<BrainFileInfo | null>(null)
  const [reveal, setReveal] = useState(false)
  const hideNotes = useSettings((s) => !!s.s?.streamer.enabled && !!s.s.streamer.hideNotes)

  const kind = selected?.slice(0, 2)
  const key = selected?.slice(2) ?? ''
  useEffect(() => {
    setNote(null)
    setFile(null)
    setReveal(false)
    if (!selected) return
    let live = true
    const load = (): void => {
      if (kind === 'n:') void api.brain.note(projectId, key).then((n) => live && setNote(n))
      else if (kind === 'f:') void api.brain.file(projectId, key).then((f) => live && setFile(f))
    }
    load()
    const off = api.on.brainChanged((pid) => pid === projectId && load())
    return () => {
      live = false
      off()
    }
  }, [projectId, selected])

  const openNote = (title: string): void => onSelect(noteId(title))

  if (draft) return <Editor projectId={projectId} draft={draft} setDraft={setDraft} onSaved={onSaved} />
  if (!selected) return null

  if (kind === 'f:') {
    if (!file) return <div className="bs-empty"><span className="spin" /></div>
    return (
      <div className="bs" data-testid="brain-file">
        <div className="bs-kind">
          <i style={{ background: KIND_COLOR.file }} /> {t('Datei')}
        </div>
        <h3 className="mono">{file.file}</h3>
        <p className="dim small">
          {t('{reads}× gelesen · {edits}× geändert', { reads: file.reads, edits: file.edits })}
        </p>
        <div className="row">
          <button className="btn small" onClick={() => void openInEditor(file.abs)}>
            <Icon name="code" size={13} /> {t('Im Editor öffnen')}
          </button>
          <button className="btn small" onClick={() => setDraft(emptyDraft({ files: file.file, type: 'module' }))}>
            <Icon name="plus" size={13} /> {t('Notiz dazu')}
          </button>
        </div>
        {file.notes.length > 0 && (
          <section>
            <h4>{t('Wissen dazu')}</h4>
            {file.notes.map((n) => (
              <button key={n} className="bs-ref" onClick={() => openNote(n)}>
                {n}
              </button>
            ))}
          </section>
        )}
        {file.co.length > 0 && (
          <section>
            <h4>{t('Wird oft zusammen geändert mit')}</h4>
            {file.co.map((c) => (
              <button key={c.file} className="bs-ref mono" onClick={() => onSelect(fileId(c.file))}>
                {c.file} <span className="dim">{c.count}×</span>
              </button>
            ))}
          </section>
        )}
        {!file.notes.length && <p className="bs-hint">{t('Zu dieser Datei gibt es noch kein Wissen. Claude legt es an, wenn es hier arbeitet – oder du schreibst selbst eine Notiz.')}</p>}
      </div>
    )
  }

  if (!note) {
    // Link auf eine Notiz, die es noch nicht gibt
    return (
      <div className="bs" data-testid="brain-missing">
        <div className="bs-kind">
          <i className="hollow" /> {t('Noch nicht angelegt')}
        </div>
        <h3>{key}</h3>
        <p className="bs-hint">{t('Andere Notizen verweisen hierher, aber die Notiz fehlt noch.')}</p>
        <button className="btn small primary" onClick={() => setDraft(emptyDraft({ title: key }))}>
          <Icon name="plus" size={13} /> {t('Anlegen')}
        </button>
      </div>
    )
  }

  const archive = async (): Promise<void> => {
    if (!(await confirm({ title: t('„{title}“ archivieren?', { title: note.title }), message: t('Die Notiz wandert nach .vibedesk/brain/.archiv und verschwindet aus dem Gehirn.'), confirmLabel: t('Archivieren'), danger: true }))) return
    await api.brain.remove(projectId, note.title)
    onSelect(null)
  }

  return (
    <div className="bs" data-testid="brain-note">
      <div className="bs-kind">
        <i style={{ background: KIND_COLOR[note.type] }} /> {noteTypeLabel(note.type)}
        <span className="dim">· {relTime(note.updated)}</span>
      </div>
      <h3>{note.title}</h3>
      {note.stale && <div className="bs-stale">{t('Zu prüfen – verknüpfte Dateien wurden seitdem geändert.')}</div>}
      {hideNotes && !reveal ? (
        <button className="bs-veil" onClick={() => setReveal(true)}>
          <Icon name="eyeoff" size={16} /> {t('Im Streamer-Modus verdeckt – klicken zum Anzeigen')}
        </button>
      ) : (
        <Markdown text={note.body} onLink={openNote} />
      )}
      {note.files.length > 0 && (
        <section>
          <h4>{t('Dateien')}</h4>
          {note.files.map((f) => (
            <button key={f} className="bs-ref mono" onClick={() => onSelect(fileId(f))}>
              {f}
            </button>
          ))}
        </section>
      )}
      {note.backlinks.length > 0 && (
        <section>
          <h4>{t('Verlinkt von')}</h4>
          {note.backlinks.map((n) => (
            <button key={n} className="bs-ref" onClick={() => openNote(n)}>
              {n}
            </button>
          ))}
        </section>
      )}
      {note.tags.length > 0 && <div className="bs-tags">{note.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}
      <div className="row bs-actions">
        <button
          className="btn small"
          onClick={() => setDraft({ title: note.title, type: note.type, body: note.body, files: note.files.join(', '), prev: note.title })}
          data-testid="brain-edit"
        >
          <Icon name="pen" size={13} /> {t('Bearbeiten')}
        </button>
        <button className="btn small ghost" title={t('Archivieren')} onClick={() => void archive()}>
          <Icon name="trash" size={13} />
        </button>
      </div>
    </div>
  )
}
