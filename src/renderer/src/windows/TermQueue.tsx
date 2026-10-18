import { useState } from 'react'
import { Icon } from '../desktop/icons'
import { dequeue, enqueue, moveUp, setPaused, useQueue, type QueuedPrompt } from '../store/queueStore'
import { t } from '../../../shared/i18n'

const NONE: QueuedPrompt[] = []

/** Knopf in der Titelleiste: „Danach …“ bzw. Anzahl vorgemerkter Aufträge */
export function QueueChip({ sessionId, open, onToggle }: { sessionId: string; open: boolean; onToggle(): void }): React.JSX.Element {
  const n = useQueue((s) => (s.items[sessionId] ?? NONE).length)
  return (
    <button className={`queue-chip${n ? ' on' : ''}${open ? ' open' : ''}`} onClick={onToggle} title={t('Aufträge vormerken – sie starten, sobald Claude fertig ist')} data-testid="queue-chip">
      {n ? `⏭ ${t('{n} vorgemerkt', { n })}` : `＋ ${t('Danach')}`}
    </button>
  )
}

/** Leiste unten im Terminal: Warteschlange ansehen, umsortieren, neue Aufträge vormerken */
export function TermQueue({ sessionId }: { sessionId: string }): React.JSX.Element {
  const items = useQueue((s) => s.items[sessionId] ?? NONE)
  const paused = useQueue((s) => !!s.paused[sessionId])
  const [text, setText] = useState('')
  const add = (): void => {
    if (enqueue(sessionId, text)) setText('')
  }
  return (
    <div className="term-queue" data-testid="term-queue" onMouseDown={(e) => e.stopPropagation()}>
      {items.map((q, i) => (
        <div key={q.id} className="tq-item">
          <span className="tq-n">{i + 1}</span>
          <span className="tq-text" title={q.text}>
            {q.text}
          </span>
          {i > 0 && (
            <button className="icon-btn" title={t('Nach vorn')} onClick={() => moveUp(sessionId, q.id)}>
              ↑
            </button>
          )}
          <button className="icon-btn" title={t('Entfernen')} onClick={() => dequeue(sessionId, q.id)}>
            <Icon name="trash" size={13} />
          </button>
        </div>
      ))}
      {paused && (
        <div className="tq-paused">
          {t('Angehalten – die Session hatte einen Fehler.')}
          <button className="btn small ghost" onClick={() => setPaused(sessionId, false)}>
            {t('Weiter')}
          </button>
        </div>
      )}
      <div className="tq-add">
        <input
          className="field small"
          placeholder={items.length ? t('Noch etwas danach …') : t('Wenn Claude fertig ist, mach …')}
          value={text}
          maxLength={4000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') add()
          }}
          data-testid="queue-input"
          autoFocus
        />
        <button className="btn small primary" disabled={!text.trim()} onClick={add}>
          {t('Vormerken')}
        </button>
      </div>
    </div>
  )
}
