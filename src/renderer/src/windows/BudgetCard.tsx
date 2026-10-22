// Budget pro Projekt im Stats-Tab: Stand als Balken, Budget setzen oder entfernen.
import { useState } from 'react'
import { t } from '../../../shared/i18n'
import type { Budget, BudgetPeriod, BudgetUnit } from '../../../shared/budget'
import { fmtBudget, setBudget, useBudget } from '../store/budgetStore'

const level = (p: number): string => (p >= 1 ? 'crit' : p >= 0.75 ? 'warn' : 'ok')

export function BudgetCard({ projectId, name }: { projectId: string; name: string }): React.JSX.Element {
  const use = useBudget((s) => s.list.find((x) => x.projectId === projectId))
  const [edit, setEdit] = useState(false)
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState<BudgetUnit>('usd')
  const [period, setPeriod] = useState<BudgetPeriod>('day')

  const open = (): void => {
    setAmount(use ? String(use.unit === 'tokens' ? use.amount / 1000 : use.amount) : '')
    setUnit(use?.unit ?? 'usd')
    setPeriod(use?.period ?? 'day')
    setEdit(true)
  }
  const save = async (): Promise<void> => {
    const n = Number(amount.replace(',', '.'))
    if (!(n > 0)) return
    const b: Budget = { amount: unit === 'tokens' ? Math.round(n * 1000) : n, unit, period }
    await setBudget(projectId, b)
    setEdit(false)
  }

  if (edit)
    return (
      <div className="budget-edit" data-testid={`budget-edit-${name}`}>
        <input className="field small" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void save()} placeholder={unit === 'usd' ? '5' : '500'} aria-label={t('Betrag')} autoFocus data-testid="budget-amount" />
        <select className="field small" value={unit} onChange={(e) => setUnit(e.target.value as BudgetUnit)} aria-label={t('Einheit')} data-testid="budget-unit">
          <option value="usd">$</option>
          <option value="tokens">{t('Tsd. Tokens')}</option>
        </select>
        <select className="field small" value={period} onChange={(e) => setPeriod(e.target.value as BudgetPeriod)} aria-label={t('Zeitraum')} data-testid="budget-period">
          <option value="day">{t('pro Tag')}</option>
          <option value="week">{t('pro Woche')}</option>
        </select>
        <button className="btn small primary" onClick={() => void save()} data-testid="budget-save">
          {t('Speichern')}
        </button>
        {use && (
          <button className="btn small ghost" onClick={() => void setBudget(projectId, null).then(() => setEdit(false))}>
            {t('Entfernen')}
          </button>
        )}
        <button className="btn small ghost" onClick={() => setEdit(false)}>
          {t('Abbrechen')}
        </button>
      </div>
    )

  if (!use)
    return (
      <button className="btn small ghost budget-add" onClick={open} data-testid={`budget-add-${name}`}>
        {t('Budget für {name} festlegen …', { name })}
      </button>
    )

  const pct = use.used / use.amount
  return (
    <div className="budget" data-testid={`budget-${name}`}>
      <div className="row between small">
        <span>
          {t('Budget {name}', { name })} · <span className="dim">{use.period === 'day' ? t('heute') : t('diese Woche')}</span>
        </span>
        <button className="link-btn" onClick={open} title={t('Budget ändern')}>
          <span className={`ctx-num ${level(pct)}`} data-testid="budget-used">
            {fmtBudget(use.used, use.unit)} / {fmtBudget(use.amount, use.unit)}
          </span>
        </button>
      </div>
      <div className={`ctx-bar ${level(pct)}`}>
        <i style={{ width: `${Math.min(100, pct * 100)}%` }} />
      </div>
    </div>
  )
}
