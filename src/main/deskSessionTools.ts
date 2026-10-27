// Weitere MCP-Werkzeuge: Claude sieht die anderen Sessions, schickt ihnen Aufträge, kennt Verbrauch und Budget
// und kann sich erinnern lassen.
import { agentName, agentOf } from '../shared/agents'
import { cleanBudget, type BudgetUse } from '../shared/budget'
import { handoffRequest, type SessionHandoff } from '../shared/handoff'
import type { PlanLimits } from '../shared/limits'
import type { TraySession } from '../shared/tray'
import type { DayStats, SessionInfo } from '../shared/types'
import type { ToolResult } from './livingTools'

interface Deps {
  sessions(): SessionInfo[]
  /** Status je Session (vom Renderer, wie fürs Tray) */
  states(): TraySession[]
  projectName(projectId: string): string
  /** Prompt in eine Session tippen (über den Renderer); handoff: Übergabe der schickenden Session anhängen */
  prompt(sessionId: string, text: string, from: string, handoff: SessionHandoff | null): void
  days(n: number): DayStats[]
  limits(): PlanLimits | null
  budgets(): BudgetUse[]
  setBudget(projectId: string, raw: unknown): BudgetUse[]
  notify(title: string, body: string): void
}

const STATUS: Record<string, string> = { waiting: 'wartet auf den User', working: 'arbeitet', done: 'fertig', error: 'Fehler', idle: 'bereit' }
const PROMPT_MAX = 8000
const REMIND_MAX_MIN = 24 * 60
const REMIND_MAX = 20

const usd = (n: number): string => `${n.toFixed(2)} $`
const tok = (n: number): string => (n >= 1e6 ? `${(n / 1e6).toFixed(2)} M` : n >= 1e3 ? `${Math.round(n / 1e3)} k` : String(n))
const until = (ms: number): string => {
  const m = Math.max(0, Math.round((ms - Date.now()) / 60000))
  return m >= 60 ? `${Math.floor(m / 60)} Std. ${m % 60} Min.` : `${m} Min.`
}

export function createDeskSessionTools(d: Deps) {
  const reminders = new Set<ReturnType<typeof setTimeout>>()

  /** Ziel per id oder Name (ohne Groß/klein); null = nicht eindeutig */
  function find(q: unknown): SessionInfo | null {
    if (typeof q !== 'string' || !q.trim()) return null
    const list = d.sessions().filter((s) => !s.external)
    const byId = list.find((s) => s.id === q)
    if (byId) return byId
    const named = list.filter((s) => s.name.toLowerCase() === q.trim().toLowerCase())
    return named.length === 1 ? named[0] : null
  }

  return function deskSessionTool(tool: string, a: Record<string, unknown>, self: string): ToolResult | null {
    switch (tool) {
      case 'desk_sessions': {
        const states = new Map(d.states().map((s) => [s.id, s.status]))
        const list = d.sessions().filter((s) => !s.external)
        if (!list.length) return { text: 'Keine Sessions offen.' }
        return {
          text: list
            .map((s) => `- ${s.name}${s.id === self ? ' (das bist du)' : ''}${agentOf(s) === 'claude' ? '' : ` · ${agentName(agentOf(s))} (Beta)`} · ${STATUS[states.get(s.id) ?? 'idle']} · Projekt ${d.projectName(s.projectId)} · ${s.cwd} · id ${s.id}`)
            .join('\n')
        }
      }
      case 'desk_session_send': {
        const target = find(a.session)
        if (!target) return { text: 'Session nicht gefunden oder nicht eindeutig – nimm die id aus desk_sessions.', isError: true }
        if (target.id === self) return { text: 'Das bist du selbst – schick den Auftrag an eine andere Session.', isError: true }
        const text = typeof a.prompt === 'string' ? a.prompt.replace(/\r\n?/g, '\n').trim() : ''
        if (!text) return { text: 'prompt fehlt.', isError: true }
        if (text.length > PROMPT_MAX) return { text: `prompt ist zu lang (höchstens ${PROMPT_MAX} Zeichen).`, isError: true }
        const from = d.sessions().find((s) => s.id === self)?.name ?? 'Claude'
        const h = handoffRequest(a)
        d.prompt(target.id, text, from, h ? { fromId: self, ...h } : null)
        const st = d.states().find((s) => s.id === target.id)?.status
        return {
          text: `An „${target.name}“ geschickt${h ? ' – mit Übergabe (deine Zusammenfassung und die in dieser Runde geänderten Dateien)' : ''}.${st === 'working' ? ' Die Session arbeitet gerade – Claude Code nimmt den Auftrag danach dran.' : ''} Mit desk_sessions siehst du, wann sie fertig ist.`
        }
      }
      case 'desk_usage': {
        const days = d.days(7)
        const today = days[days.length - 1]
        const week = days.reduce((s, x) => ({ tokens: s.tokens + x.tokens, cost: s.cost + x.costUsd }), { tokens: 0, cost: 0 })
        const lines = [`Heute: ${tok(today?.tokens ?? 0)} Tokens · ≈ ${usd(today?.costUsd ?? 0)} (Schätzung zu API-Preisen)`, `Letzte 7 Tage: ${tok(week.tokens)} Tokens · ≈ ${usd(week.cost)}`]
        const l = d.limits()
        if (l?.fiveHour) lines.push(`Abo 5-Stunden-Fenster: ${Math.round(l.fiveHour.pct)} % verbraucht, zurückgesetzt in ${until(l.fiveHour.resetsAt)}`)
        if (l?.sevenDay) lines.push(`Abo Wochenlimit: ${Math.round(l.sevenDay.pct)} % verbraucht, zurückgesetzt in ${until(l.sevenDay.resetsAt)}`)
        for (const b of d.budgets()) {
          const f = b.unit === 'usd' ? usd : tok
          lines.push(`Budget ${d.projectName(b.projectId)} (${b.period === 'day' ? 'heute' : 'diese Woche'}): ${f(b.used)} von ${f(b.amount)} · ${Math.round((b.used / b.amount) * 100)} %`)
        }
        return { text: lines.join('\n') }
      }
      case 'desk_budget': {
        const me = d.sessions().find((s) => s.id === self)
        if (!me) return { text: 'Unbekannte Session – Budgets gelten pro Projekt.', isError: true }
        if (a.remove === true) {
          d.setBudget(me.projectId, null)
          return { text: `Budget für ${d.projectName(me.projectId)} entfernt.` }
        }
        const b = cleanBudget({ amount: a.amount, unit: a.unit, period: a.period ?? 'day' })
        if (!b) return { text: 'amount (> 0) und unit ("usd" oder "tokens") angeben, period "day" oder "week".', isError: true }
        const use = d.setBudget(me.projectId, b).find((x) => x.projectId === me.projectId)
        const f = b.unit === 'usd' ? usd : tok
        return { text: `Budget für ${d.projectName(me.projectId)}: ${f(b.amount)} pro ${b.period === 'day' ? 'Tag' : 'Woche'}. Bisher ${f(use?.used ?? 0)}. VibeDesk warnt bei 75 % und 100 %, hält aber nichts an.` }
      }
      case 'desk_remind': {
        const min = typeof a.minutes === 'number' && Number.isFinite(a.minutes) ? a.minutes : NaN
        const text = typeof a.text === 'string' ? a.text.replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, 200) : ''
        if (!(min > 0) || min > REMIND_MAX_MIN) return { text: `minutes zwischen 0 und ${REMIND_MAX_MIN} angeben.`, isError: true }
        if (!text) return { text: 'text fehlt.', isError: true }
        if (reminders.size >= REMIND_MAX) return { text: 'Zu viele offene Erinnerungen.', isError: true }
        const from = d.sessions().find((s) => s.id === self)?.name ?? 'Claude'
        const timer = setTimeout(() => {
          reminders.delete(timer)
          d.notify(`Erinnerung von ${from}`, text)
        }, min * 60_000)
        reminders.add(timer)
        return { text: `Erinnerung in ${min} Min. gesetzt (geht verloren, wenn VibeDesk vorher beendet wird).` }
      }
      default:
        return null
    }
  }
}
