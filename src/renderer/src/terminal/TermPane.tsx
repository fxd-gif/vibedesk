// Ein Terminal im Fenster: einhängen, Größe anpassen, Suche (Strg+F), Rechtsklick und Dateien per Drag & Drop.
import { useEffect, useRef, useState } from 'react'
import { Icon } from '../desktop/icons'
import { copySelection, dropFiles, getTerminal, mountTerminal, onTerminalUi, pasteInto } from '../store/terminals'

const MATCH = { matchBackground: '#3b4a7a', matchOverviewRuler: '#7c9cff', activeMatchBackground: '#c8f04a', activeMatchColorOverviewRuler: '#c8f04a' }

export function TermPane({ id, testId, focused, label }: { id: string; testId?: string; focused?: boolean; label?: string }): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState<string | null>(null)
  const [hits, setHits] = useState<{ index: number; count: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const el = host.current
    const t = el && mountTerminal(id, el)
    if (!el || !t) return
    // Fit höchstens einmal pro Frame – beim Ziehen feuert der ResizeObserver sehr oft
    let frame = 0
    const ro = new ResizeObserver(() => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        try {
          t.fit.fit()
        } catch {
          /* unsichtbar */
        }
      })
    })
    ro.observe(el)
    const results = t.search.onDidChangeResults((r) => setHits(r.resultCount ? { index: r.resultIndex, count: r.resultCount } : null))
    const off = onTerminalUi(id, (a) => {
      if (a !== 'search') return
      setSearch((q) => q ?? t.term.getSelection().split('\n')[0] ?? '')
      requestAnimationFrame(() => input.current?.select())
    })
    return () => {
      ro.disconnect()
      cancelAnimationFrame(frame)
      results.dispose()
      off()
    }
  }, [id])

  useEffect(() => {
    if (focused) getTerminal(id)?.term.focus()
  }, [focused, id])

  const find = (q: string, back = false): void => {
    const s = getTerminal(id)?.search
    if (!s) return
    if (!q) {
      s.clearDecorations()
      setHits(null)
      return
    }
    const opts = { decorations: MATCH, incremental: !back }
    if (back) s.findPrevious(q, opts)
    else s.findNext(q, opts)
  }
  const closeSearch = (): void => {
    getTerminal(id)?.search.clearDecorations()
    setSearch(null)
    setHits(null)
    getTerminal(id)?.term.focus()
  }

  return (
    <div
      className={`term-pane${dragging ? ' drop' : ''}`}
      onContextMenu={(e) => {
        // wie im Windows Terminal: Rechtsklick kopiert die Markierung, ohne Markierung fügt er ein
        e.preventDefault()
        if (!copySelection(id)) void pasteInto(id)
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        e.stopPropagation()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return
        e.preventDefault()
        e.stopPropagation()
        setDragging(false)
        dropFiles(id, [...e.dataTransfer.files])
      }}
    >
      {label && <div className="term-pane-label">{label}</div>}
      <div className="term-host" ref={host} data-testid={testId} data-session={id} />
      {search !== null && (
        <div className="term-search" onMouseDown={(e) => e.stopPropagation()} data-testid="term-search">
          <Icon name="search" size={13} />
          <input
            ref={input}
            className="field small"
            value={search}
            placeholder="Im Terminal suchen"
            aria-label="Im Terminal suchen"
            autoFocus
            onChange={(e) => {
              setSearch(e.target.value)
              find(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') closeSearch()
              else if (e.key === 'Enter') find(search, e.shiftKey)
            }}
          />
          <span className="dim small term-search-count">{search ? (hits ? `${hits.index + 1}/${hits.count}` : 'keine Treffer') : ''}</span>
          <button className="icon-btn" title="Vorheriger (Umschalt+Enter)" onClick={() => find(search, true)}>
            ↑
          </button>
          <button className="icon-btn" title="Nächster (Enter)" onClick={() => find(search)}>
            ↓
          </button>
          <button className="icon-btn" title="Schließen (Esc)" onClick={closeSearch}>
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
