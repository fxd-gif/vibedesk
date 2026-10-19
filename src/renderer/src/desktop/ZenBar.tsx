// Zen-Modus: schmale Leiste oben – jede Session als Pille mit Status, Klick wechselt, rechts geht es zurück.
import { termWin, useSessions } from '../store/sessionStore'
import { useUi } from '../store/uiStore'
import { useWorkflow } from '../store/workflowStore'
import { toggleZen } from './calm'
import { t } from '../../../shared/i18n'

export function ZenBar(): React.JSX.Element | null {
  const zen = useUi((s) => s.zen)
  const sessions = useSessions((s) => s.sessions)
  const statusKey = useWorkflow((w) => sessions.map((s) => w.sessions[s.id]?.status ?? 'idle').join(','))
  if (!zen) return null
  const statuses = statusKey.split(',')
  return (
    <div className="zen-bar" data-testid="zen-bar">
      {sessions.map((s, i) => {
        const id = termWin(s.id)
        return (
          <button key={s.id} className={`zen-pill${zen === id ? ' on' : ''}`} onClick={() => useUi.getState().setZen(id)} title={s.name} data-testid={`zen-${s.name}`}>
            <span className={`dot ${statuses[i] || 'idle'}`} />
            {s.name}
          </button>
        )
      })}
      <button className="zen-pill exit" onClick={() => toggleZen()} title={t('Zen-Modus beenden (Strg+.)')} data-testid="zen-exit">
        {t('Alles zeigen')}
      </button>
    </div>
  )
}
