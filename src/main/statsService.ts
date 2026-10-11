import type { DayStats, HookEvent, SessionStats } from '../shared/types'

export type { DayStats, SessionStats }
import { readJson, writeJsonAtomic } from './jsonFile'
import { applyTranscriptLines, contextUsed, contextWindow, costUsd, emptyAgg, TranscriptTail, type Usage, type UsageAgg } from './usage'


const KEEP_DAYS = 30

export function localDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export class StatsHistory {
  private days: Record<string, Omit<DayStats, 'date'>>

  constructor(private file: string) {
    this.days = readJson(file, {})
  }

  add(date: string, tokens: number, cacheRead: number, costUsd: number): void {
    const d = this.days[date] ?? { tokens: 0, cacheRead: 0, costUsd: 0 }
    this.days[date] = { tokens: d.tokens + tokens, cacheRead: d.cacheRead + cacheRead, costUsd: d.costUsd + costUsd }
    const keys = Object.keys(this.days).sort()
    for (const k of keys.slice(0, Math.max(0, keys.length - KEEP_DAYS))) delete this.days[k]
    writeJsonAtomic(this.file, this.days)
  }

  lastDays(n: number, today: string): DayStats[] {
    const [y, m, d] = today.split('-').map(Number)
    const out: DayStats[] = []
    for (let i = n - 1; i >= 0; i--) {
      const date = localDate(new Date(y, m - 1, d - i, 12).getTime())
      out.push({ date, ...(this.days[date] ?? { tokens: 0, cacheRead: 0, costUsd: 0 }) })
    }
    return out
  }
}

interface Tracked {
  path: string
  tail: TranscriptTail
  /** gesamtes Protokoll – für die Anzeige */
  agg: UsageAgg
  /** nur Einträge ab Übernahme – für den Tagesverlauf */
  fresh: UsageAgg
  since: number
  recorded: { tokens: number; cacheRead: number; cost: number }
  timer: ReturnType<typeof setTimeout> | null
}

const counted = (u: Usage): number => u.input + u.output + u.cacheWrite5m + u.cacheWrite1h

/** Verfolgt pro Session das Claude-Protokoll und meldet Token-/Kosten-Stand. */
export class StatsService {
  private sessions = new Map<string, Tracked>()
  private now: () => number
  private throttleMs: number

  constructor(private o: { history: StatsHistory; emit(s: SessionStats): void; now?: () => number; throttleMs?: number }) {
    this.now = o.now ?? Date.now
    this.throttleMs = o.throttleMs ?? 750
  }

  onHook(e: HookEvent): void {
    const p = e.payload.transcript_path
    if (typeof p !== 'string' || !p) return
    let t = this.sessions.get(e.sessionId)
    if (!t || t.path !== p) {
      if (t?.timer) clearTimeout(t.timer)
      t = { path: p, tail: new TranscriptTail(p), agg: emptyAgg(), fresh: emptyAgg(), since: this.now(), recorded: { tokens: 0, cacheRead: 0, cost: 0 }, timer: null }
      this.sessions.set(e.sessionId, t)
    }
    if (e.name === 'Stop' || e.name === 'SessionEnd' || e.name === 'SubagentStop') return this.flush(e.sessionId)
    if (!t.timer) t.timer = setTimeout(() => this.flush(e.sessionId), this.throttleMs)
  }

  flush(sessionId: string): void {
    const t = this.sessions.get(sessionId)
    if (!t) return
    if (t.timer) clearTimeout(t.timer)
    t.timer = null
    const lines = t.tail.readNew()
    applyTranscriptLines(t.agg, lines)
    applyTranscriptLines(t.fresh, lines, t.since)
    const { usd, estimated } = costUsd(t.agg.model, t.agg.total)
    const f = { tokens: counted(t.fresh.total), cacheRead: t.fresh.total.cacheRead, cost: costUsd(t.fresh.model ?? t.agg.model, t.fresh.total).usd }
    if (f.tokens > t.recorded.tokens || f.cacheRead > t.recorded.cacheRead) {
      this.o.history.add(localDate(this.now()), f.tokens - t.recorded.tokens, f.cacheRead - t.recorded.cacheRead, f.cost - t.recorded.cost)
      t.recorded = f
    }
    this.o.emit({
      sessionId,
      model: t.agg.model,
      total: { ...t.agg.total },
      contextUsed: contextUsed(t.agg.last),
      contextWindow: contextWindow(t.agg.model),
      costUsd: usd,
      estimated,
      responses: t.agg.responses,
      startedAt: t.agg.firstTs
    })
  }

  remove(sessionId: string): void {
    const t = this.sessions.get(sessionId)
    if (t?.timer) clearTimeout(t.timer)
    this.sessions.delete(sessionId)
  }
}
