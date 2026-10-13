import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { isTrigger, KINDS, outputsOf, type FlowNodeData } from '../../../addons/flowModel'
import { HANDLE_LABELS, summarize } from '../../../addons/flowLabels'
import { FlowIcon } from './FlowIcon'

const SIDE = new Set(['next', 'body'])

/** Beschriftung eines Ausgangs: Fallwert, eigener Knopftext oder Standard. */
function outLabel(d: FlowNodeData, h: string): string {
  const m = /^case(\d+)$/.exec(h)
  if (m) return d.cases?.[Number(m[1])] || '–'
  if (d.type === 'vd_ask' && h === 'yes') return String(d.fields.YES_LABEL || 'Ja')
  if (d.type === 'vd_ask' && h === 'no') return String(d.fields.NO_LABEL || 'Nein')
  return HANDLE_LABELS[h] ?? h
}

/** Kartenknoten im Neon-Stil: Icon-Kachel, Titel, Kurzfassung; Anschlüsse je nach Typ. */
export const NodeCard = memo(function NodeCard({ data, selected }: NodeProps): React.JSX.Element {
  const d = data as FlowNodeData
  const kind = KINDS[d.type]
  const sub = summarize(d)
  const isText = ['vd_show_notice', 'vd_copy_text', 'vd_ask'].includes(d.type) && d.values.TEXT?.k === 'text'
  const outs = outputsOf(d)
  const footer = outs.filter((h) => !SIDE.has(h))
  // „Weiter“ wandert an die Seite, wenn unten schon Zweige sitzen (Gleichzeitig)
  const nextSide = footer.length > 0 && outs.includes('next')
  const width = Math.max(230, footer.length * 72)
  return (
    <div className={`fnode cat-${kind.category}${selected ? ' sel' : ''}${footer.length ? ' fnode-branch' : ''}`} style={{ width }} data-testid={`fnode-${d.type}`}>
      {!isTrigger(d.type) && <Handle type="target" position={Position.Top} className="fh fh-in" />}
      <div className="fnode-main">
        <div className="fnode-icon">
          <FlowIcon name={kind.icon} size={20} />
        </div>
        <div className="fnode-text">
          <div className="fnode-title">{kind.label}</div>
          {sub && (isText ? <div className="fnode-chip">{sub}</div> : <div className="fnode-sub">{sub}</div>)}
        </div>
      </div>
      {footer.length > 0 && (
        <div className="fnode-branches">
          {footer.map((h) => (
            <span key={h} className={`fbr fbr-${h.replace(/\d+$/, '')}`}>
              {outLabel(d, h)}
            </span>
          ))}
          {footer.map((h, i) => (
            <Handle key={h} type="source" id={h} position={Position.Bottom} className={`fh fh-out fh-${h.replace(/\d+$/, '')}`} style={{ left: `${((i + 0.5) / footer.length) * 100}%` }} />
          ))}
        </div>
      )}
      {outs.includes('body') && (
        <>
          <span className="fnode-side-label">Schleife</span>
          <Handle type="source" id="body" position={Position.Right} className="fh fh-body" />
        </>
      )}
      {nextSide && (
        <>
          <span className="fnode-side-label">Danach</span>
          <Handle type="source" id="next" position={Position.Right} className="fh fh-body" />
        </>
      )}
      {outs.includes('next') && !nextSide && <Handle type="source" id="next" position={Position.Bottom} className="fh fh-out" />}
    </div>
  )
})
