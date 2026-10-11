// Token-Verbrauch aus Claude-Code-Protokollen (JSONL) – reine Logik + inkrementelles Lesen.
import fs from 'fs'

export interface Usage {
  input: number
  output: number
  cacheRead: number
  cacheWrite5m: number
  cacheWrite1h: number
}

export interface UsageAgg {
  model: string | null
  total: Usage
  last: Usage | null
  responses: number
  seen: Set<string>
  firstTs: number | null
  lastTs: number | null
}

const zero = (): Usage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 })
export const emptyAgg = (): UsageAgg => ({ model: null, total: zero(), last: null, responses: 0, seen: new Set(), firstTs: null, lastTs: null })

const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0)

function toUsage(u: Record<string, unknown>): Usage {
  const creation = num(u.cache_creation_input_tokens)
  const detail = u.cache_creation as Record<string, unknown> | undefined
  const w1h = detail ? num(detail.ephemeral_1h_input_tokens) : 0
  const w5m = detail ? num(detail.ephemeral_5m_input_tokens) : creation
  return { input: num(u.input_tokens), output: num(u.output_tokens), cacheRead: num(u.cache_read_input_tokens), cacheWrite5m: w5m, cacheWrite1h: w1h }
}

/** minTs: nur Einträge ab diesem Zeitpunkt zählen (z. B. ab Übernahme einer fortgesetzten Session) */
export function applyTranscriptLines(agg: UsageAgg, lines: string[], minTs = -Infinity): UsageAgg {
  for (const line of lines) {
    if (!line.includes('"usage"')) continue
    let e: Record<string, any>
    try {
      e = JSON.parse(line)
    } catch {
      continue
    }
    if (e?.type !== 'assistant' || e.isSidechain || !e.message?.usage) continue
    const ts = Date.parse(e.timestamp)
    if (minTs > -Infinity && !(ts >= minTs)) continue
    const key = String(e.message.id ?? e.requestId ?? e.uuid ?? '')
    if (key && agg.seen.has(key)) continue
    if (key) agg.seen.add(key)
    const u = toUsage(e.message.usage)
    const t = agg.total
    t.input += u.input
    t.output += u.output
    t.cacheRead += u.cacheRead
    t.cacheWrite5m += u.cacheWrite5m
    t.cacheWrite1h += u.cacheWrite1h
    agg.responses++
    const model = e.message.model
    if (typeof model === 'string' && !model.startsWith('<')) {
      agg.model = model
      agg.last = u
    }
    if (Number.isFinite(ts)) {
      agg.firstTs ??= ts
      agg.lastTs = ts
    }
  }
  return agg
}

// ---------- Modelle: Context-Fenster und Preise ($ pro 1M Tokens) ----------

const ONE_M_PREFIXES = ['claude-fable-5', 'claude-mythos-5', 'claude-opus-5', 'claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6', 'claude-sonnet-5', 'claude-sonnet-4-6', 'claude-haiku-5']

export function contextWindow(model: string | null): number {
  if (!model) return 200_000
  if (/\[1m\]$/i.test(model)) return 1_000_000
  return ONE_M_PREFIXES.some((p) => model.startsWith(p)) ? 1_000_000 : 200_000
}

export function contextUsed(last: Usage | null): number {
  return last ? last.input + last.cacheRead + last.cacheWrite5m + last.cacheWrite1h + last.output : 0
}

interface Price {
  input: number
  output: number
  cacheRead?: number
}

// Längster passender Präfix gewinnt (Quelle: claude-api-Referenz, Stand 2026-10-06)
const PRICES: Record<string, Price> = {
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-mythos-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-fable-5': { input: 10, output: 50 },
  'claude-mythos-5': { input: 10, output: 50 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-opus-4-5': { input: 5, output: 25 },
  'claude-opus-4': { input: 15, output: 75 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-haiku-3-5': { input: 0.8, output: 4 }
}
const PRICE_KEYS = Object.keys(PRICES).sort((a, b) => b.length - a.length)
const FALLBACK = PRICES['claude-opus-5-5']

export function costUsd(model: string | null, u: Usage): { usd: number; estimated: boolean } {
  const base = (model ?? '').replace(/\[.*\]$/, '')
  const key = PRICE_KEYS.find((k) => base.startsWith(k))
  const p = key ? PRICES[key] : FALLBACK
  const read = p.cacheRead ?? p.input * 0.1
  const usd = (u.input * p.input + u.output * p.output + u.cacheRead * read + u.cacheWrite5m * p.input * 1.25 + u.cacheWrite1h * p.input * 2) / 1_000_000
  return { usd, estimated: !key }
}

// ---------- Inkrementelles Lesen ----------

export class TranscriptTail {
  private offset = 0
  /** Bytes nach dem letzten Zeilenumbruch – als Buffer, damit Multibyte-Zeichen nicht zerbrechen */
  private carry: Buffer = Buffer.alloc(0)

  constructor(private file: string) {}

  readNew(): string[] {
    let size: number
    try {
      size = fs.statSync(this.file).size
    } catch {
      return []
    }
    if (size < this.offset) {
      this.offset = 0
      this.carry = Buffer.alloc(0)
    }
    if (size === this.offset) return []
    const fd = fs.openSync(this.file, 'r')
    try {
      const buf = Buffer.alloc(size - this.offset)
      fs.readSync(fd, buf, 0, buf.length, this.offset)
      this.offset = size
      const all = Buffer.concat([this.carry, buf])
      const nl = all.lastIndexOf(0x0a)
      if (nl < 0) {
        this.carry = all
        return []
      }
      this.carry = all.subarray(nl + 1)
      return all
        .subarray(0, nl)
        .toString('utf8')
        .split('\n')
        .map((l) => l.replace(/\r$/, ''))
        .filter(Boolean)
    } finally {
      fs.closeSync(fd)
    }
  }
}
