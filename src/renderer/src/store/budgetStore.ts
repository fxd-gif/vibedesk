// Budget pro Projekt: Stand für den Stats-Tab und die Warnungen bei 75 % und 100 %.
import { create } from 'zustand'
import { t } from '../../../shared/i18n'
import type { Budget, BudgetAlert, BudgetUse } from '../../../shared/budget'
import { api } from '../api'
import { inform, notify } from './notifyStore'
import { fmtTokens, fmtUsd } from './statsStore'

export const useBudget = create<{ list: BudgetUse[] }>(() => ({ list: [] }))

export const fmtBudget = (n: number, unit: Budget['unit']): string => (unit === 'usd' ? fmtUsd(n) : fmtTokens(n))

export async function setBudget(projectId: string, b: Budget | null): Promise<void> {
  useBudget.setState({ list: await api.budget.set(projectId, b) })
}

async function projectName(id: string): Promise<string> {
  return (await api.projects.list()).find((p) => p.id === id)?.name ?? t('Projekt')
}

async function onAlert(a: BudgetAlert): Promise<void> {
  const name = await projectName(a.projectId)
  const period = a.period === 'day' ? t('heute') : t('diese Woche')
  const body = t('{used} von {amount} {period}', { used: fmtBudget(a.used, a.unit), amount: fmtBudget(a.amount, a.unit), period })
  // 75 %: leise Karte; 100 %: Mitteilung mit Verlauf – Claude arbeitet trotzdem weiter
  if (a.level === 75) inform(t('{name}: 75 % vom Budget', { name }), body, undefined, `budget:${a.projectId}`)
  else notify({ kind: 'watch', title: t('{name}: Budget erreicht', { name }), body: `${body} · ${t('Claude arbeitet weiter – du entscheidest.')}`, key: `budget:${a.projectId}` })
}

let wired = false
export function wireBudget(): void {
  if (wired) return
  wired = true
  void api.budget.all().then((list) => useBudget.setState({ list }))
  api.on.budgetUsage((list) => useBudget.setState({ list }))
  api.on.budgetAlert((a) => void onAlert(a))
}
