// Anhänge im Claude-Terminal: Knopf mit Zähler in der Titelleiste und Liste, was Claude schon bekommen hat.
import { useEffect } from 'react'
import { Icon } from '../desktop/icons'
import { clearAttachments, hydrateAttachments, removeAttachment, useAttach } from '../store/attachStore'
import { insertFiles, pickFiles } from '../store/terminals'
import { fmtSize, type Attachment, type AttachStatus } from '../../../shared/attachments'

const NONE: Attachment[] = []

const STATUS: Record<AttachStatus, { label: string; hint: string }> = {
  pending: { label: 'noch nicht abgeschickt', hint: 'Der Pfad steht in der Eingabe – mit Enter geht er an Claude.' },
  sent: { label: 'abgeschickt', hint: 'Mit deiner Nachricht an Claude gegangen.' },
  read: { label: 'Claude hat sie gelesen', hint: 'Claude hat die Datei geöffnet.' }
}

const useList = (sessionId: string): Attachment[] => useAttach((s) => s.items[sessionId] ?? NONE)

/** Büroklammer in der Titelleiste: Anzahl der Anhänge, Punkt solange etwas noch nicht abgeschickt ist */
export function AttachButton({ sessionId, open, onToggle }: { sessionId: string; open: boolean; onToggle(): void }): React.JSX.Element {
  useEffect(() => hydrateAttachments(sessionId), [sessionId])
  const list = useList(sessionId)
  const pending = list.some((a) => a.status === 'pending')
  return (
    <button
      className={`term-tool attach-btn${open ? ' on' : ''}`}
      title={list.length ? `${list.length} Anhänge – anzeigen` : 'Dateien anhängen'}
      onClick={onToggle}
      data-testid="term-attach-btn"
    >
      <Icon name="clip" size={13} />
      {list.length > 0 && <b className={`attach-count${pending ? ' pending' : ''}`}>{list.length}</b>}
    </button>
  )
}

/** Leiste unten im Terminal: angehängte Dateien mit Status, neue wählen, erneut einfügen, entfernen */
export function TermAttach({ sessionId }: { sessionId: string }): React.JSX.Element {
  const list = useList(sessionId)
  const done = list.filter((a) => a.status !== 'pending').length
  return (
    <div className="term-queue term-attach" data-testid="term-attach" onMouseDown={(e) => e.stopPropagation()}>
      {list.length === 0 && <div className="ta-empty">Noch nichts angehängt. Zieh Dateien aufs Terminal, füge ein Bild mit Strg+V ein oder wähle Dateien aus.</div>}
      {list.map((a) => (
        <div key={a.path} className="tq-item" data-testid="attach-item" data-status={a.status}>
          <span className={`ta-dot ${a.status}`} title={STATUS[a.status].hint} />
          <span className="tq-text" title={a.path}>
            {a.image ? '🖼 ' : ''}
            {a.name}
            {a.size ? <span className="dim"> · {fmtSize(a.size)}</span> : null}
          </span>
          <span className={`ta-status ${a.status}`} title={STATUS[a.status].hint}>
            {STATUS[a.status].label}
          </span>
          <button className="icon-btn" title="Pfad noch einmal in die Eingabe einfügen" onClick={() => insertFiles(sessionId, [{ path: a.path, size: a.size }])}>
            ↵
          </button>
          <button className="icon-btn" title="Aus der Liste nehmen" onClick={() => removeAttachment(sessionId, a.path)}>
            <Icon name="trash" size={13} />
          </button>
        </div>
      ))}
      <div className="tq-add">
        <button className="btn small primary" onClick={() => void pickFiles(sessionId)} data-testid="attach-pick">
          <Icon name="clip" size={13} /> Dateien wählen …
        </button>
        {done > 0 && (
          <button className="btn small ghost" onClick={() => clearAttachments(sessionId, true)} title="Abgeschickte und gelesene aus der Liste nehmen">
            Erledigte entfernen
          </button>
        )}
      </div>
    </div>
  )
}
