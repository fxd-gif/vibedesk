// Testmodus im Maker: Protokoll „Ablauf“ unten auf der Fläche und der Kontext für „▶ Auslösen“ an den Auslöser-Knoten.
import { createContext, useState } from 'react'
import { clockTime, type DebugEntry } from '../../../addons/flowDebug'
import { FlowIcon } from './FlowIcon'
import { t } from '../../../../../shared/i18n'

/** null = kein Test läuft; sonst schickt fire(id) ein Beispiel-Ereignis an diesen Auslöser */
export const FlowTest = createContext<{ fire(id: string): void } | null>(null)

export function DebugLog({ log, testing, onPick, onClear }: { log: DebugEntry[]; testing: boolean; onPick(nodeId: string): void; onClear(): void }): React.JSX.Element {
  const [open, setOpen] = useState(true)
  return (
    <div className={`fdebug${open ? ' open' : ''}`} data-testid="maker-debug">
      <div className="fdebug-head">
        <button className="fdebug-toggle" onClick={() => setOpen((o) => !o)} title={open ? t('Ablauf einklappen') : t('Ablauf aufklappen')}>
          {testing && <i className="fdebug-live" />}
          {t('Ablauf')}
          <span className="fdebug-count">{log.length}</span>
          <span className={`fdebug-chev${open ? ' open' : ''}`}>
            <FlowIcon name="chevron" size={14} />
          </span>
        </button>
        {open && log.length > 0 && (
          <button className="ficon-btn" onClick={onClear} title={t('Ablauf leeren')}>
            <FlowIcon name="trash" size={13} />
          </button>
        )}
      </div>
      {open && (
        <ol className="fdebug-list">
          {log.length === 0 && <li className="fdebug-empty">{t('Noch nichts gelaufen. Löse einen Auslöser mit „▶ Auslösen“ aus oder warte auf das Ereignis.')}</li>}
          {log.map((e) => (
            <li key={e.seq}>
              <button className={`fdebug-row tone-${e.tone}`} onClick={() => onPick(e.nodeId)} title={t('Knoten auswählen')}>
                <time>{clockTime(e.at)}</time>
                <b>{e.label}</b>
                <span>{e.result}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
