// Rechte Spalte, solange nichts gewählt ist: in Worten, was Claude weiß – zuletzt Gelerntes, zu Prüfendes, Bereiche.
import type { BrainView, GraphNode, NoteType } from '../../../../shared/brain'
import { t, tn } from '../../../../shared/i18n'
import { relTime } from '../../util'
import { KIND_COLOR } from './BrainGraph'

const isNote = (n: GraphNode): n is GraphNode & { kind: NoteType } => n.kind !== 'file' && n.kind !== 'missing'

function Row({ n, onSelect, time }: { n: GraphNode; onSelect(id: string): void; time?: boolean }): React.JSX.Element {
  return (
    <button className="bo-row" onClick={() => onSelect(n.id)} title={n.label}>
      <i style={{ background: KIND_COLOR[n.kind] }} className={n.stale ? 'stale' : undefined} />
      <span>{n.label}</span>
      {time && n.updated ? <small>{relTime(n.updated)}</small> : null}
    </button>
  )
}

export function BrainOverview({ view, isMe, onSelect }: { view: BrainView; isMe: boolean; onSelect(id: string): void }): React.JSX.Element {
  const notes = view.graph.nodes.filter(isNote)
  const recent = [...notes].sort((a, b) => (b.updated ?? 0) - (a.updated ?? 0)).slice(0, 6)
  const stale = notes.filter((n) => n.stale).slice(0, 5)
  const areas = notes.filter((n) => n.kind === 'module').sort((a, b) => b.weight - a.weight)
  return (
    <div className="bs bo" data-testid="brain-overview">
      <h3>{isMe ? t('Was Claude über dich weiß') : t('Was Claude über dein Projekt weiß')}</h3>
      <p className="bs-hint">
        {isMe
          ? tn(view.notes, '{n} Notiz gilt in allen Projekten. Jede neue Session startet damit.', '{n} Notizen gelten in allen Projekten. Jede neue Session startet damit.')
          : tn(view.notes, '{n} Notiz. Jede neue Session startet mit diesem Wissen, statt alles neu zu erkunden.', '{n} Notizen. Jede neue Session startet mit diesem Wissen, statt alles neu zu erkunden.')}
      </p>
      <section>
        <h4>{t('Zuletzt gelernt')}</h4>
        {recent.map((n) => (
          <Row key={n.id} n={n} onSelect={onSelect} time />
        ))}
      </section>
      {stale.length > 0 && (
        <section>
          <h4 className="bo-stale">{t('Zu prüfen')}</h4>
          {stale.map((n) => (
            <Row key={n.id} n={n} onSelect={onSelect} />
          ))}
        </section>
      )}
      {areas.length > 0 && (
        <section>
          <h4>{t('Bereiche')}</h4>
          {areas.slice(0, 8).map((n) => (
            <Row key={n.id} n={n} onSelect={onSelect} />
          ))}
          {areas.length > 8 && <small className="dim bo-more">{t('+ {n} weitere im Graph', { n: areas.length - 8 })}</small>}
        </section>
      )}
    </div>
  )
}
