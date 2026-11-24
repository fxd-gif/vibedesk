// Gehirn als Dateien, wie auf der Website: links der Ordner mit den Notizen (├── └──), rechts das Protokoll,
// was Claude in dieser Sitzung gelesen und festgehalten hat. Ergänzt den Graphen – ehrlich: die Notizen liegen flach als Titel.md.
import { useMemo } from 'react'
import { ME_ID, type BrainView, type GraphNode, type NoteType } from '../../../../shared/brain'
import { t, tn } from '../../../../shared/i18n'
import { branch } from '../../ascii/lines'
import { useBrainLog, type NoteMark } from '../../store/brainLog'
import { noteTypeLabel } from './BrainGraph'

const isNote = (n: GraphNode): n is GraphNode & { kind: NoteType } => n.kind !== 'file' && n.kind !== 'missing'

const markLabel = (m: NoteMark): string => (m === 'read' ? t('gelesen') : m === 'new' ? t('neu') : t('geändert'))

const clock = (ts: number): string => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export function BrainFiles({ view, projectName, onSelect }: { view: BrainView; projectName: string; onSelect(id: string): void }): React.JSX.Element {
  const pid = view.projectId
  const entries = useBrainLog((s) => s.entries[pid])
  const marks = useBrainLog((s) => s.marks[pid])
  const notes = useMemo(() => view.graph.nodes.filter(isNote).sort((a, b) => a.label.localeCompare(b.label)), [view])
  const label = useMemo(() => new Map(view.graph.nodes.map((n) => [n.id, n.label])), [view])
  // relativ zum Projekt – nie ein absoluter Pfad mit Benutzernamen
  const folder = pid === ME_ID ? t('Über dich') + '/' : `${projectName}/.vibedesk/brain/`
  const log = entries ?? []

  return (
    <figure className="brain-files" data-testid="brain-files">
      <div className="bf-tree">
        <p className="bf-path">{folder}</p>
        <ul>
          {notes.map((n, i) => {
            const m = marks?.[n.id]
            return (
              <li key={n.id} className={m ?? undefined}>
                <span className="bf-b" aria-hidden>
                  {branch(i, notes.length)}
                </span>
                <button className="bf-n" onClick={() => onSelect(n.id)} title={n.label}>
                  {n.label}.md
                </button>
                <span className="bf-t">
                  {m && <em>{markLabel(m)}</em>}
                  {noteTypeLabel(n.kind)}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
      <ol className="bf-log" aria-label={t('Was Claude in dieser Sitzung gelesen und festgehalten hat')}>
        <li className="bf-dim">{tn(notes.length, 'kennt {n} Notiz aus früheren Sessions', 'kennt {n} Notizen aus früheren Sessions')}</li>
        {log.length === 0 && <li className="bf-dim bf-wait">{t('Sobald Claude im Gehirn liest oder etwas festhält, steht es hier.')}</li>}
        {log.map((e, k) => (
          <li key={k} className={e.kind === 'learn' ? 'bf-learn' : undefined}>
            <span className="bf-dot">●</span>
            {e.kind === 'read'
              ? t('gelesen: {notes}', { notes: e.items.map((id) => label.get(id) ?? id.slice(2)).join(', ') })
              : e.created
                ? t('gelernt: „{title}“', { title: e.items[0] })
                : t('ergänzt: „{title}“', { title: e.items[0] })}
            <time>{clock(e.ts)}</time>
          </li>
        ))}
      </ol>
    </figure>
  )
}
