import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api'
import type { FileEntry } from '../../../../shared/types'
import { samePath } from '../../store/editorModel'

type Node = FileEntry[] | 'loading' | { error: string }

interface Props {
  root: string
  active: string | null
  onOpen(path: string): void
}

export function FileTree({ root, active, onOpen }: Props): React.JSX.Element {
  const [nodes, setNodes] = useState<Record<string, Node>>({})
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([root]))

  const load = useCallback(async (dir: string) => {
    setNodes((n) => (n[dir] ? n : { ...n, [dir]: 'loading' }))
    const r = await api.files.list(dir)
    setNodes((n) => ({ ...n, [dir]: r.ok ? r.entries : { error: r.message } }))
  }, [])

  useEffect(() => {
    setNodes({})
    setExpanded(new Set([root]))
    load(root)
  }, [root, load])

  const refresh = (): void => {
    for (const d of expanded) load(d)
  }

  const toggle = (dir: string): void => {
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(dir)) next.delete(dir)
      else {
        next.add(dir)
        load(dir)
      }
      return next
    })
  }

  const render = (dir: string, depth: number): React.ReactNode => {
    const n = nodes[dir]
    if (!n || n === 'loading') return <div className="ftree-msg" style={{ paddingLeft: 14 + depth * 12 }}>…</div>
    if (!Array.isArray(n)) return <div className="ftree-msg err" style={{ paddingLeft: 14 + depth * 12 }}>{n.error}</div>
    if (!n.length) return <div className="ftree-msg" style={{ paddingLeft: 14 + depth * 12 }}>leer</div>
    return n.map((e) => {
      const open = e.dir && expanded.has(e.path)
      return (
        <div key={e.path}>
          <button
            className={`ftree-row${!e.dir && active && samePath(active, e.path) ? ' on' : ''}${e.dir ? ' dir' : ''}`}
            style={{ paddingLeft: 8 + depth * 12 }}
            onClick={() => (e.dir ? toggle(e.path) : onOpen(e.path))}
            title={e.path}
            data-testid="ftree-row"
          >
            <span className={`ftree-caret${open ? ' open' : ''}`}>{e.dir ? '›' : ''}</span>
            <span className="ftree-name">{e.name}</span>
          </button>
          {open && render(e.path, depth + 1)}
        </div>
      )
    })
  }

  return (
    <div className="ftree">
      <div className="ftree-head">
        <span>Dateien</span>
        <button className="ftree-refresh" title="Neu laden" onClick={refresh}>
          ↻
        </button>
      </div>
      <div className="ftree-body">{render(root, 0)}</div>
    </div>
  )
}
