import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { KINDS, type FlowNodeData } from '../../../addons/flowModel'
import { summarize } from '../../../addons/flowLabels'
import { FlowIcon } from './FlowIcon'

/** Kartenknoten im Neon-Stil: Icon-Kachel, Titel, Kurzfassung; Anschlüsse je nach Typ. */
export const NodeCard = memo(function NodeCard({ data, selected }: NodeProps): React.JSX.Element {
  const d = data as FlowNodeData & { dim?: boolean }
  const kind = KINDS[d.type]
  const sub = summarize(d)
  const isText = (d.type === 'vd_show_notice' || d.type === 'vd_copy_text') && d.values.TEXT?.k === 'text'
  const out = kind.outputs
  return (
    <div className={`fnode cat-${kind.category}${selected ? ' sel' : ''}${d.dim ? ' dim' : ''}${d.type === 'controls_if' ? ' fnode-if' : ''}`} data-testid={`fnode-${d.type}`}>
      {kind.category !== 'trigger' && <Handle type="target" position={Position.Top} className="fh fh-in" />}
      <div className="fnode-main">
        <div className="fnode-icon">
          <FlowIcon name={kind.icon} size={20} />
        </div>
        <div className="fnode-text">
          <div className="fnode-title">{kind.label}</div>
          {sub && (isText ? <div className="fnode-chip">{sub}</div> : <div className="fnode-sub">{sub}</div>)}
        </div>
      </div>
      {d.type === 'controls_if' ? (
        <div className="fnode-branches">
          <span className="yes">Ja</span>
          <span className="no">Nein</span>
          <Handle type="source" id="yes" position={Position.Bottom} className="fh fh-yes" style={{ left: '25%' }} />
          <Handle type="source" id="no" position={Position.Bottom} className="fh fh-no" style={{ left: '75%' }} />
        </div>
      ) : (
        <>
          {out.includes('body') && (
            <>
              <span className="fnode-side-label">Schleife</span>
              <Handle type="source" id="body" position={Position.Right} className="fh fh-body" />
            </>
          )}
          {out.includes('next') && <Handle type="source" id="next" position={Position.Bottom} className="fh fh-out" />}
        </>
      )}
    </div>
  )
})
