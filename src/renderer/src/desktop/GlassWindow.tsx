import { useRef, useState, type ReactNode, type PointerEvent as RPointerEvent } from 'react'
import { DOCK_H, useUi } from '../store/uiStore'
import { snapRect } from './layout'
import type { WindowRect } from '../../../shared/types'

interface Props {
  id: string
  title: ReactNode
  children: ReactNode
  solid?: boolean
  minW?: number
  minH?: number
  onClose?: () => void
}

export function GlassWindow({ id, title, children, solid, minW = 280, minH = 160, onClose }: Props): React.JSX.Element | null {
  const rect = useUi((s) => s.rects[id])
  const z = useUi((s) => s.open.indexOf(id))
  const top = useUi((s) => s.open[s.open.length - 1] === id)
  const minimized = useUi((s) => s.minimized.includes(id))
  const maximized = useUi((s) => s.maximized === id)
  const { setRect, focus, toggleMax, minimize, closeWin } = useUi.getState()
  const drag = useRef<{ dx: number; dy: number; resize: boolean; start: WindowRect; px: number; py: number } | null>(null)
  const [snapPreview, setSnapPreview] = useState<WindowRect | null>(null)

  if (!rect) return null
  const screen = { w: window.innerWidth, h: window.innerHeight }
  const shown: WindowRect = maximized ? { x: 8, y: 8, w: screen.w - 16, h: screen.h - DOCK_H - 8 } : rect

  const onDown = (e: RPointerEvent, resize: boolean): void => {
    if (e.button !== 0 || maximized) return
    if ((e.target as HTMLElement).closest('button')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { dx: e.clientX - rect.x, dy: e.clientY - rect.y, resize, start: rect, px: e.clientX, py: e.clientY }
  }
  const onMove = (e: RPointerEvent): void => {
    const d = drag.current
    if (!d) return
    if (d.resize) {
      setRect(id, {
        ...d.start,
        w: Math.max(minW, d.start.w + e.clientX - d.px),
        h: Math.max(minH, d.start.h + e.clientY - d.py)
      })
    } else {
      const y = Math.min(Math.max(0, e.clientY - d.dy), screen.h - DOCK_H - 40)
      setRect(id, { ...rect, x: e.clientX - d.dx, y })
      setSnapPreview(snapRect(rect, e.clientX, screen, DOCK_H))
    }
  }
  const onUp = (e: RPointerEvent): void => {
    const d = drag.current
    drag.current = null
    setSnapPreview(null)
    if (d && !d.resize) {
      const snapped = snapRect(rect, e.clientX, screen, DOCK_H)
      if (snapped) setRect(id, { x: snapped.x + 8, y: snapped.y + 8, w: snapped.w - 16, h: snapped.h - 16 })
    }
  }

  return (
    <>
      {snapPreview && (
        <div className="snap-preview" style={{ left: snapPreview.x + 8, top: snapPreview.y + 8, width: snapPreview.w - 16, height: snapPreview.h - 16 }} />
      )}
      <section
        className={`gwin${solid ? ' solid' : ''}${top ? ' top' : ''}${minimized ? ' min' : ''}${maximized ? ' max' : ''}`}
        style={{ left: shown.x, top: shown.y, width: shown.w, height: shown.h, zIndex: 10 + z }}
        onPointerDownCapture={() => !top && focus(id)}
        data-testid={`win-${id}`}
      >
        <header
          className="gwin-bar"
          onPointerDown={(e) => onDown(e, false)}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onDoubleClick={() => toggleMax(id)}
        >
          <div className="gwin-title">{title}</div>
          <div className="gwin-btns">
            <button className="gbtn" title="Minimieren" onClick={() => minimize(id)}>
              <span className="gbtn-min" />
            </button>
            <button className="gbtn" title={maximized ? 'Wiederherstellen' : 'Maximieren'} onClick={() => toggleMax(id)}>
              <span className="gbtn-max" />
            </button>
            <button className="gbtn close" title="Schließen" onClick={() => (onClose ? onClose() : closeWin(id))}>
              <span className="gbtn-x" />
            </button>
          </div>
        </header>
        <div className="gwin-body">{children}</div>
        {!maximized && (
          <div className="gwin-resize" onPointerDown={(e) => onDown(e, true)} onPointerMove={onMove} onPointerUp={onUp} />
        )}
      </section>
    </>
  )
}
