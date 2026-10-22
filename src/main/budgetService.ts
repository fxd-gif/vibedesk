// Verbrauch pro Projekt und Tag mitschreiben (aus dem StatsService) und vor dem Budget warnen.
import { cleanBudget, crossedLevel, periodDays, periodKey, type BudgetAlert, type BudgetUse } from '../shared/budget'
import { readJson, writeJsonAtomic } from './jsonFile'

const KEEP_DAYS = 14

interface Ledger {
  /** projectId → Datum → Verbrauch */
  days: Record<string, Record<string, { tokens: number; cost: number }>>
  /** projectId → „day:2026-10-22“ + höchste schon gemeldete Stufe */
  alerted: Record<string, { period: string; level: number }>
}

export class BudgetService {
  private l: Ledger

  constructor(
    private o: {
      file: string
      budgets(): Record<string, unknown>
      alert(a: BudgetAlert): void
      changed(list: BudgetUse[]): void
      today(): string
    }
  ) {
    const raw = readJson<Partial<Ledger>>(o.file, {})
    this.l = { days: raw.days ?? {}, alerted: raw.alerted ?? {} }
  }

  add(projectId: string, tokens: number, cost: number): void {
    if (!(tokens > 0) && !(cost > 0)) return
    const date = this.o.today()
    const p = (this.l.days[projectId] ??= {})
    const d = p[date] ?? { tokens: 0, cost: 0 }
    p[date] = { tokens: d.tokens + Math.max(0, tokens), cost: d.cost + Math.max(0, cost) }
    const keys = Object.keys(p).sort()
    for (const k of keys.slice(0, Math.max(0, keys.length - KEEP_DAYS))) delete p[k]
    this.check(projectId)
    this.save()
    this.o.changed(this.all())
  }

  /** Stand aller Projekte mit Budget */
  all(): BudgetUse[] {
    const out: BudgetUse[] = []
    for (const [projectId, raw] of Object.entries(this.o.budgets() ?? {})) {
      const u = this.use(projectId, raw)
      if (u) out.push(u)
    }
    return out
  }

  /** Budget geändert: alte Meldungen zurücksetzen, damit ein höheres Budget wieder warnen kann */
  reset(projectId: string): void {
    delete this.l.alerted[projectId]
    this.save()
    this.o.changed(this.all())
  }

  private use(projectId: string, raw: unknown): BudgetUse | null {
    const b = cleanBudget(raw)
    if (!b) return null
    const days = this.l.days[projectId] ?? {}
    let used = 0
    for (const date of periodDays(this.o.today(), b.period)) used += b.unit === 'usd' ? (days[date]?.cost ?? 0) : (days[date]?.tokens ?? 0)
    return { projectId, used, amount: b.amount, unit: b.unit, period: b.period }
  }

  private check(projectId: string): void {
    const u = this.use(projectId, this.o.budgets()?.[projectId])
    if (!u) return
    const key = periodKey(this.o.today(), u.period)
    const prev = this.l.alerted[projectId]
    const already = prev?.period === key ? prev.level : 0
    const level = crossedLevel(u.used, u.amount, already)
    if (!level) return
    this.l.alerted[projectId] = { period: key, level }
    this.o.alert({ ...u, level })
  }

  private save(): void {
    writeJsonAtomic(this.o.file, this.l)
  }
}
