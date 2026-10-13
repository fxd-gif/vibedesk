// Führt das Blockly-JSON eines Addons direkt aus – kein Code-Generator, kein eval.
// Die App erreicht ein Addon ausschließlich über AddonActions (und AddonStorage für „Dauerhaft merken“).
import type { BlocklyBlock, BlocklyProgram } from '../../../shared/addonBlocks'
import type { StoredValue } from '../../../shared/types'

export type { StoredValue }

export interface AddonActions {
  setScene(v: string): void
  /** transient = nur anzeigen, nicht speichern (Zwischenschritte beim Überblenden) */
  setRain(v0to100: number, transient?: boolean): void
  getRain(): number
  setVolume(ch: 'music' | 'rain', v0to100: number, transient?: boolean): void
  getVolume(ch: 'music' | 'rain'): number
  setMusicOn(on: boolean): void
  playSound(v: string): void
  notice(text: string): void
  focus(cmd: 'start' | 'stop'): void
  copyText(text: string): void
  query(what: string): string | number
  /** Frage mit zwei Knöpfen; true = erster Knopf. Läuft nach einer Weile mit false ab. */
  ask(text: string, yes: string, no: string): Promise<boolean>
  /** Session im Projekt (Name; leer = Projekt der obersten Session) – laufende nehmen oder starten. Liefert die Session-ID. */
  claudeStart(project: string): Promise<string | null>
  /** Prompt an die Session (oder die oberste) schicken; liefert die benutzte Session-ID oder null */
  claudeSend(session: string | undefined, text: string): Promise<string | null>
  /** Wartet, bis die Session nicht mehr arbeitet (höchstens timeoutMs) */
  claudeWait(session: string, timeoutMs: number, signal: AbortSignal): Promise<void>
  /** working · waiting · done · idle · error · none */
  claudeStatus(session: string | undefined): string
}

/** Dauerhafter Speicher eines Addons (überlebt Neustarts). */
export interface AddonStorage {
  ready: Promise<void>
  get(key: string): StoredValue | undefined
  set(key: string, value: StoredValue): void
  /** Ausstehendes sofort schreiben (beim Stoppen) */
  flush?(): Promise<void>
}


export type AddonEvent =
  | { type: 'start' }
  | { type: 'session_waiting'; project?: string; session?: string }
  | { type: 'session_done'; project?: string; session?: string }
  | { type: 'focus'; phase: 'work' | 'break' | 'end' }
  | { type: 'time'; hour: number; minute: number }
  | { type: 'hotkey'; key: string }
  | { type: 'interval'; minutes: number }
  | { type: 'signal'; name: string }
  | { type: 'command'; name: string }

export interface Clock {
  now(): number
  sleep(ms: number, signal: AbortSignal): Promise<void>
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise((res, rej) => {
      if (signal.aborted) return rej(new Error('abgebrochen'))
      const onAbort = (): void => {
        clearTimeout(t)
        rej(new Error('abgebrochen'))
      }
      const t = setTimeout(() => {
        signal.removeEventListener('abort', onAbort)
        res()
      }, ms)
      signal.addEventListener('abort', onAbort, { once: true })
    })
}

export const LIMITS = {
  actionsPerSecond: 20,
  foreverMinMs: 100,
  maxScripts: 10,
  noticeEveryMs: 5000,
  clipboardEveryMs: 10_000,
  textLen: 5000,
  noticeLen: 140,
  maxWaitSec: 3600,
  maxRepeat: 1000,
  yieldEvery: 500,
  listLen: 500,
  /** Einträge über alle Listen eines Addons zusammen */
  listTotal: 20_000,
  listItemLen: 500,
  /** gleichzeitig laufende Zweige aus „Gleichzeitig“ – darüber laufen sie nacheinander */
  maxBranches: 32,
  storedTextLen: 2000,
  storedListLen: 100,
  fadeStepsPerSec: 4,
  pollMs: 250,
  /** Makros: Abstand zwischen zwei Prompts und Höchstzahl pro Stunde – gegen Endlosschleifen mit „Session fertig“ */
  claudeEveryMs: 3000,
  claudePerHour: 40,
  claudeWaitMin: 120
}

const EVENT_OF: Record<string, AddonEvent['type']> = {
  vd_on_start: 'start',
  vd_on_session_waiting: 'session_waiting',
  vd_on_session_done: 'session_done',
  vd_on_focus: 'focus',
  vd_on_time: 'time',
  vd_on_hotkey: 'hotkey',
  vd_on_interval: 'interval',
  vd_on_signal: 'signal',
  vd_on_command: 'command'
}

type Scalar = number | string | boolean
type Value = Scalar | Scalar[]

/** Pro Skriptlauf: das auslösende Ereignis (für „Ereignis-Info“) und die Claude-Session des Makros. */
interface Ctx {
  event: AddonEvent
  session?: string
}

class Aborted extends Error {}
/** Drossel geschlossen: dieser Ablauf endet still. */
class GateClosed extends Error {}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
const toNum = (v: Value | undefined): number => {
  if (Array.isArray(v)) return v.length
  const n = typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}
const str = (v: Value | undefined): string => (Array.isArray(v) ? v.map(String).join(', ') : String(v ?? '')).slice(0, LIMITS.textLen)
const isTrue = (v: unknown): boolean => v === true || v === 'TRUE'
const same = (a: Value, b: Value): boolean => {
  const x = str(a)
  const y = str(b)
  if (x === y) return true
  const p = parseFloat(x)
  const q = parseFloat(y)
  return x.trim() !== '' && y.trim() !== '' && Number.isFinite(p) && Number.isFinite(q) && p === q
}
const field = (b: BlocklyBlock, k: string): unknown => b.fields?.[k]
const input = (b: BlocklyBlock, k: string): BlocklyBlock | undefined => b.inputs?.[k]?.block ?? b.inputs?.[k]?.shadow
const varId = (b: BlocklyBlock): string => String((field(b, 'VAR') as { id?: string } | undefined)?.id ?? '')
const numbered = (keys: string[], prefix: string): number[] =>
  keys
    .map((k) => new RegExp(`^${prefix}(\\d+)$`).exec(k)?.[1])
    .filter((x): x is string => x !== undefined)
    .map(Number)
    .sort((a, c) => a - c)
const numberedInputs = (b: BlocklyBlock, prefix: string): number[] => numbered(Object.keys(b.inputs ?? {}), prefix)
const finite = (n: number): number => (Number.isFinite(n) ? n : 0)
const deg = Math.PI / 180

function toStored(v: Value): StoredValue {
  if (Array.isArray(v)) return v.slice(0, LIMITS.storedListLen).map((x) => (typeof x === 'string' ? x.slice(0, LIMITS.storedTextLen) : x))
  return typeof v === 'string' ? v.slice(0, LIMITS.storedTextLen) : v
}

/** Hauseigener Speicher, falls kein dauerhafter übergeben wurde (z. B. in Tests). */
function memoryStorage(): AddonStorage {
  const m = new Map<string, StoredValue>()
  return { ready: Promise.resolve(), get: (k) => m.get(k), set: (k, v) => void m.set(k, v) }
}

export class AddonRunner {
  private readonly ctrl = new AbortController()
  private readonly vars = new Map<string, Value>()
  private readonly recent: number[] = []
  private readonly gates = new Map<string, number>()
  private readonly storage: AddonStorage
  private readonly fadeTokens = new Map<string, number>()
  private branchesActive = 0
  private lastNotice = -Infinity
  private lastCopy = -Infinity
  private steps = 0
  private stopped = false
  private _running = 0

  constructor(
    private readonly opts: {
      program: BlocklyProgram
      prompts: Record<string, string>
      actions: AddonActions
      clock: Clock
      storage?: AddonStorage
      onError(msg: string): void
    }
  ) {
    this.storage = opts.storage ?? memoryStorage()
  }

  get running(): number {
    return this._running
  }
  /** gerade laufende Zweige aus „Gleichzeitig“ */
  get branches(): number {
    return this.branchesActive
  }
  /** Einträge über alle Listen */
  get listEntries(): number {
    let n = 0
    for (const v of this.vars.values()) if (Array.isArray(v)) n += v.length
    return n
  }

  private get hats(): BlocklyBlock[] {
    return (this.opts.program.blocks?.blocks ?? []).filter((b) => Object.hasOwn(EVENT_OF, b.type))
  }

  listens(): AddonEvent['type'][] {
    return [...new Set(this.hats.map((b) => EVENT_OF[b.type]))]
  }
  hotkeys(): string[] {
    return this.hats.filter((b) => b.type === 'vd_on_hotkey').map((b) => String(field(b, 'KEY')))
  }
  /** Namen der Makro-Befehle (für die Befehls-Palette) */
  commands(): string[] {
    return this.hats.filter((b) => b.type === 'vd_on_command').map((b) => String(field(b, 'NAME') ?? '').trim()).filter(Boolean)
  }
  intervals(): number[] {
    return this.hats.filter((b) => b.type === 'vd_on_interval').map((b) => toNum(field(b, 'MINUTES') as Value))
  }
  times(): { hour: number; minute: number }[] {
    return this.hats.filter((b) => b.type === 'vd_on_time').map((b) => ({ hour: toNum(field(b, 'HOUR') as Value), minute: toNum(field(b, 'MINUTE') as Value) }))
  }

  private matches(b: BlocklyBlock, e: AddonEvent): boolean {
    if (EVENT_OF[b.type] !== e.type) return false
    switch (e.type) {
      case 'focus':
        return field(b, 'PHASE') === e.phase
      case 'time':
        return toNum(field(b, 'HOUR') as Value) === e.hour && toNum(field(b, 'MINUTE') as Value) === e.minute
      case 'hotkey':
        return String(field(b, 'KEY')).toUpperCase() === e.key.toUpperCase()
      case 'interval':
        return toNum(field(b, 'MINUTES') as Value) === e.minutes
      case 'signal':
        return String(field(b, 'NAME')) === e.name
      case 'command':
        return String(field(b, 'NAME') ?? '').trim() === e.name
      default:
        return true
    }
  }

  /** Startet alle passenden Abläufe; liefert ihre Promises (für „Signal senden und warten“). */
  private launch(e: AddonEvent): Promise<void>[] {
    if (this.stopped) return []
    const out: Promise<void>[] = []
    for (const hat of this.hats) {
      if (!this.matches(hat, e)) continue
      if (this._running >= LIMITS.maxScripts) break
      out.push(this.runScript(input(hat, 'DO'), { event: e, session: e.type === 'session_waiting' || e.type === 'session_done' ? e.session : undefined }))
    }
    return out
  }

  emit(e: AddonEvent): void {
    void this.launch(e)
  }

  stop(): void {
    this.stopped = true
    this.ctrl.abort()
    void this.storage.flush?.()
  }

  private async runScript(body: BlocklyBlock | undefined, ctx: Ctx): Promise<void> {
    this._running++
    try {
      await this.storage.ready
      await this.execStack(body, ctx)
    } catch (e) {
      if (!(e instanceof Aborted) && !(e instanceof GateClosed) && !this.ctrl.signal.aborted) this.opts.onError(e instanceof Error ? e.message : String(e))
    } finally {
      this._running--
    }
  }

  private async sleep(ms: number): Promise<void> {
    try {
      await this.opts.clock.sleep(ms, this.ctrl.signal)
    } catch {
      throw new Aborted()
    }
  }

  /** Wartet auf ein Promise, bricht aber beim Stoppen des Addons sofort ab. */
  private abortable<T>(p: Promise<T>): Promise<T> {
    const signal = this.ctrl.signal
    if (signal.aborted) return Promise.reject(new Aborted())
    return new Promise<T>((res, rej) => {
      const onAbort = (): void => rej(new Aborted())
      signal.addEventListener('abort', onAbort, { once: true })
      const done = (): void => signal.removeEventListener('abort', onAbort)
      p.then(
        (v) => {
          done()
          res(v)
        },
        (e) => {
          done()
          rej(e)
        }
      )
    })
  }

  /** Gleitendes Fenster: höchstens LIMITS.actionsPerSecond Aktionen in jeder Sekunde. */
  private claudeSent: number[] = []
  /** Makro-Bremse: Abstand zwischen Prompts und Höchstzahl pro Stunde */
  private async claudeBudget(): Promise<void> {
    const now = this.opts.clock.now()
    this.claudeSent = this.claudeSent.filter((t) => now - t < 3_600_000)
    if (this.claudeSent.length >= LIMITS.claudePerHour) throw new Error(`Mehr als ${LIMITS.claudePerHour} Prompts in einer Stunde – Makro angehalten.`)
    const last = this.claudeSent[this.claudeSent.length - 1]
    if (last !== undefined && now - last < LIMITS.claudeEveryMs) await this.sleep(LIMITS.claudeEveryMs - (now - last))
    this.claudeSent.push(this.opts.clock.now())
  }

  private async throttle(): Promise<void> {
    for (;;) {
      const now = this.opts.clock.now()
      while (this.recent.length && now - this.recent[0] >= 1000) this.recent.shift()
      if (this.recent.length < LIMITS.actionsPerSecond) {
        this.recent.push(now)
        return
      }
      await this.sleep(1000 - (now - this.recent[0]))
    }
  }

  private async execStack(start: BlocklyBlock | undefined, ctx: Ctx): Promise<void> {
    for (let b = start; b; b = b.next?.block) {
      if (this.ctrl.signal.aborted) throw new Aborted()
      // Alle paar hundert Schritte die Kontrolle an die App zurückgeben, damit nichts einfriert
      if (++this.steps % LIMITS.yieldEvery === 0) await this.sleep(0)
      await this.exec(b, ctx)
    }
  }

  private fadeChannel(ch: string): { get(): number; set(v: number, transient: boolean): void } {
    const a = this.opts.actions
    if (ch === 'music') return { get: () => a.getVolume('music'), set: (v, t) => a.setVolume('music', v, t) }
    if (ch === 'rain_volume') return { get: () => a.getVolume('rain'), set: (v, t) => a.setVolume('rain', v, t) }
    return { get: () => a.getRain(), set: (v, t) => a.setRain(v, t) }
  }

  private async exec(b: BlocklyBlock, ctx: Ctx): Promise<void> {
    const a = this.opts.actions
    const val = (k: string): Promise<Value> => this.eval(input(b, k), ctx)
    const act = async (fn: () => void): Promise<void> => {
      await this.throttle()
      fn()
    }
    switch (b.type) {
      case 'vd_set_scene':
        return act(() => a.setScene(String(field(b, 'SCENE'))))
      case 'vd_set_rain': {
        const v = clamp(toNum(await val('VALUE')), 0, 100)
        return act(() => a.setRain(v))
      }
      case 'vd_change_rain': {
        const d = toNum(await val('DELTA'))
        return act(() => a.setRain(clamp(a.getRain() + d, 0, 100)))
      }
      case 'vd_set_volume': {
        const v = clamp(toNum(await val('VALUE')), 0, 100)
        const ch = field(b, 'CHANNEL') === 'rain' ? 'rain' : 'music'
        return act(() => a.setVolume(ch, v))
      }
      case 'vd_music_onoff':
        return act(() => a.setMusicOn(isTrue(field(b, 'ON'))))
      case 'vd_play_sound':
        return act(() => a.playSound(String(field(b, 'SOUND'))))
      case 'vd_show_notice': {
        const text = str(await val('TEXT')).slice(0, LIMITS.noticeLen)
        const now = this.opts.clock.now()
        if (now - this.lastNotice < LIMITS.noticeEveryMs) return
        this.lastNotice = now
        return act(() => a.notice(text))
      }
      case 'vd_focus':
        return act(() => a.focus(field(b, 'CMD') === 'stop' ? 'stop' : 'start'))
      case 'vd_copy_text': {
        const text = str(await val('TEXT'))
        // Zwischenablage nur selten überschreiben – sonst könnte ein Addon Kopiertes heimlich austauschen
        const now = this.opts.clock.now()
        if (now - this.lastCopy < LIMITS.clipboardEveryMs) return
        this.lastCopy = now
        return act(() => a.copyText(text))
      }
      case 'vd_wait':
        return this.sleep(clamp(toNum(await val('SECONDS')), 0, LIMITS.maxWaitSec) * 1000)
      case 'vd_forever':
        for (;;) {
          const started = this.opts.clock.now()
          await this.execStack(input(b, 'DO'), ctx)
          await this.sleep(Math.max(0, LIMITS.foreverMinMs - (this.opts.clock.now() - started)))
        }
      case 'controls_repeat_ext': {
        const n = clamp(Math.floor(toNum(await val('TIMES'))), 0, LIMITS.maxRepeat)
        for (let i = 0; i < n; i++) await this.execStack(input(b, 'DO'), ctx)
        return
      }
      case 'controls_if': {
        for (const i of numberedInputs(b, 'IF')) {
          if (isTrue(await val(`IF${i}`))) return this.execStack(input(b, `DO${i}`), ctx)
        }
        return this.execStack(input(b, 'ELSE'), ctx)
      }
      case 'variables_set':
        this.vars.set(varId(b), await val('VALUE'))
        return
      case 'math_change':
        this.vars.set(varId(b), toNum(this.vars.get(varId(b)) ?? 0) + toNum(await val('DELTA')))
        return

      // ---------- Standard-Erweiterungen ----------
      case 'vd_switch': {
        const v = await val('VALUE')
        for (const i of numbered(Object.keys(b.fields ?? {}), 'V')) {
          if (same(v, String(field(b, `V${i}`) ?? ''))) return this.execStack(input(b, `CASE${i}`), ctx)
        }
        return this.execStack(input(b, 'DEFAULT'), ctx)
      }
      case 'vd_store_set': {
        const v = await val('VALUE')
        return act(() => this.storage.set(String(field(b, 'KEY')), toStored(v)))
      }
      case 'vd_fade': {
        const key = String(field(b, 'CHANNEL'))
        const ch = this.fadeChannel(key)
        const to = clamp(toNum(await val('VALUE')), 0, 100)
        const secs = clamp(toNum(await val('SECONDS')), 0, LIMITS.maxWaitSec)
        await this.throttle()
        // Eine neue Überblendung auf demselben Kanal löst die laufende ab
        const token = (this.fadeTokens.get(key) ?? 0) + 1
        this.fadeTokens.set(key, token)
        const from = ch.get()
        const steps = clamp(Math.round(secs * LIMITS.fadeStepsPerSec), 1, 400)
        for (let i = 1; i <= steps; i++) {
          if (this.ctrl.signal.aborted) throw new Aborted()
          if (this.fadeTokens.get(key) !== token) return
          // Zwischenschritte nur anzeigen, erst der Endwert wird gespeichert
          ch.set(Math.round((from + ((to - from) * i) / steps) * 10) / 10, i < steps)
          if (i < steps) await this.sleep((secs * 1000) / steps)
        }
        return
      }
      case 'vd_ask': {
        const text = str(await val('TEXT')).slice(0, LIMITS.noticeLen)
        const now = this.opts.clock.now()
        if (now - this.lastNotice < LIMITS.noticeEveryMs) return
        this.lastNotice = now
        await this.throttle()
        const yes = String(field(b, 'YES_LABEL') ?? 'Ja').slice(0, 24) || 'Ja'
        const no = String(field(b, 'NO_LABEL') ?? 'Nein').slice(0, 24) || 'Nein'
        const ok = await this.abortable(a.ask(text, yes, no))
        return this.execStack(input(b, ok ? 'DO_YES' : 'DO_NO'), ctx)
      }

      // ---------- Claude ----------
      case 'vd_claude_start': {
        await this.throttle()
        const sid = await this.abortable(a.claudeStart(String(field(b, 'PROJECT') ?? '').trim()))
        if (!sid) throw new Error('Session konnte nicht geöffnet werden – gibt es das Projekt?')
        ctx.session = sid
        return
      }
      case 'vd_claude_send': {
        const text = str(await val('TEXT')).trim()
        if (!text) return
        await this.claudeBudget()
        const sid = await this.abortable(a.claudeSend(ctx.session, text))
        if (!sid) throw new Error('Keine Claude-Session offen – öffne eine oder nutze „Session öffnen“.')
        ctx.session = sid
        if (isTrue(field(b, 'AWAIT'))) await this.abortable(a.claudeWait(sid, LIMITS.claudeWaitMin * 60_000, this.ctrl.signal))
        return
      }
      case 'vd_claude_wait': {
        const sid = ctx.session
        if (!sid) return
        const min = clamp(toNum(await val('TIMEOUT')), 0, LIMITS.claudeWaitMin)
        return this.abortable(a.claudeWait(sid, min * 60_000, this.ctrl.signal))
      }

      // ---------- Erweitert ----------
      case 'vd_emit': {
        await this.throttle()
        const runs = this.launch({ type: 'signal', name: String(field(b, 'NAME')) })
        if (isTrue(field(b, 'WAIT'))) await this.abortable(Promise.all(runs))
        return
      }
      case 'vd_parallel': {
        const runA = (): Promise<void> => this.execStack(input(b, 'A'), ctx)
        const runB = (): Promise<void> => this.execStack(input(b, 'B'), ctx)
        // Über dem Budget laufen die Zweige nacheinander – so kann „Gleichzeitig“ nicht unbegrenzt auffächern
        if (this.branchesActive + 2 > LIMITS.maxBranches) {
          await runA()
          await runB()
          return
        }
        this.branchesActive += 2
        try {
          // allSettled: der Ablauf bleibt gezählt, bis beide Zweige wirklich fertig sind
          const results = await Promise.allSettled([runA(), runB()])
          const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
          if (failed) throw failed.reason
        } finally {
          this.branchesActive -= 2
        }
        return
      }
      case 'vd_wait_until': {
        const limit = clamp(toNum(await val('TIMEOUT')), 0, LIMITS.maxWaitSec) * 1000
        const start = this.opts.clock.now()
        for (;;) {
          if (isTrue(await val('COND'))) return
          if (this.opts.clock.now() - start >= limit) return
          await this.sleep(Math.min(LIMITS.pollMs, Math.max(0, limit - (this.opts.clock.now() - start))))
        }
      }
      case 'vd_gate': {
        const key = b.id ?? JSON.stringify(b.inputs ?? {})
        const gap = clamp(toNum(await val('SECONDS')), 0, 86_400) * 1000
        const now = this.opts.clock.now()
        const last = this.gates.get(key)
        if (last !== undefined && now - last < gap) throw new GateClosed()
        this.gates.set(key, now)
        return
      }
      case 'vd_list_add': {
        const v = await val('VALUE')
        const cur = this.vars.get(varId(b))
        const list = Array.isArray(cur) ? [...cur] : []
        if (this.listEntries >= LIMITS.listTotal) throw new Error('Listen-Speicher voll (max. 20.000 Einträge über alle Listen)')
        const item = Array.isArray(v) ? str(v) : v
        if (list.length < LIMITS.listLen) list.push(typeof item === 'string' ? item.slice(0, LIMITS.listItemLen) : item)
        this.vars.set(varId(b), list)
        return
      }
      case 'vd_list_clear':
        this.vars.set(varId(b), [])
        return
      default:
        // Werte-Blöcke als Anweisung oder unbekannte Typen: nichts tun
        return
    }
  }

  private async eval(b: BlocklyBlock | undefined, ctx: Ctx): Promise<Value> {
    if (!b) return 0
    const val = (k: string): Promise<Value> => this.eval(input(b, k), ctx)
    switch (b.type) {
      case 'math_number':
        return toNum(field(b, 'NUM') as Value)
      case 'text':
        return String(field(b, 'TEXT') ?? '')
      case 'logic_boolean':
        return isTrue(field(b, 'BOOL'))
      case 'logic_negate':
        return !isTrue(await val('BOOL'))
      case 'logic_operation': {
        const x = isTrue(await val('A'))
        if (field(b, 'OP') === 'AND') return x && isTrue(await val('B'))
        return x || isTrue(await val('B'))
      }
      case 'logic_compare': {
        const x = await val('A')
        const y = await val('B')
        const [p, q] = typeof x === 'string' && typeof y === 'string' ? [x, y] : [toNum(x), toNum(y)]
        switch (field(b, 'OP')) {
          case 'EQ':
            return p === q
          case 'NEQ':
            return p !== q
          case 'LT':
            return p < q
          case 'LTE':
            return p <= q
          case 'GT':
            return p > q
          case 'GTE':
            return p >= q
        }
        return false
      }
      case 'math_arithmetic': {
        const x = toNum(await val('A'))
        const y = toNum(await val('B'))
        const r = { ADD: x + y, MINUS: x - y, MULTIPLY: x * y, DIVIDE: y === 0 ? 0 : x / y, POWER: x ** y }[String(field(b, 'OP'))] ?? 0
        return finite(r)
      }
      case 'math_random_int': {
        const lo = Math.ceil(toNum(await val('FROM')))
        const hi = Math.floor(toNum(await val('TO')))
        const [min, max] = lo <= hi ? [lo, hi] : [hi, lo]
        return min + Math.floor(Math.random() * (max - min + 1))
      }
      case 'text_join': {
        let s = ''
        for (const i of numberedInputs(b, 'ADD')) {
          if (s.length >= LIMITS.textLen) break
          s += str(await val(`ADD${i}`))
        }
        return s.slice(0, LIMITS.textLen)
      }
      case 'variables_get':
        return this.vars.get(varId(b)) ?? 0
      case 'vd_get': {
        const what = String(field(b, 'WHAT'))
        if (what === 'event_project') {
          const e = ctx.event
          return e.type === 'session_waiting' || e.type === 'session_done' ? (e.project ?? '') : ''
        }
        if (what === 'claude_status') return this.opts.actions.claudeStatus(ctx.session)
        return this.opts.actions.query(what)
      }
      case 'vd_prompt_text':
        return this.opts.prompts[String(field(b, 'NAME'))] ?? ''
      case 'vd_store_get':
        return this.storage.get(String(field(b, 'KEY'))) ?? 0
      case 'vd_list_get': {
        const cur = this.vars.get(varId(b))
        const list = Array.isArray(cur) ? cur : []
        switch (field(b, 'OP')) {
          case 'length':
            return list.length
          case 'random':
            return list.length ? list[Math.floor(Math.random() * list.length)] : ''
          case 'first':
            return list[0] ?? ''
          case 'last':
            return list.at(-1) ?? ''
          case 'item':
            return list[Math.floor(toNum(await val('ARG'))) - 1] ?? ''
          case 'contains': {
            const x = await val('ARG')
            return list.some((v) => same(v, x))
          }
          case 'join':
            return str(list)
        }
        return 0
      }
      case 'vd_calc':
        return this.calc(String(field(b, 'OP')), await val('A'), input(b, 'B') ? await val('B') : undefined)
      default:
        return 0
    }
  }

  private calc(op: string, a: Value, b: Value | undefined): Value {
    const x = toNum(a)
    const y = toNum(b)
    switch (op) {
      case 'add':
        return finite(x + y)
      case 'sub':
        return finite(x - y)
      case 'mul':
        return finite(x * y)
      case 'div':
        return y === 0 ? 0 : finite(x / y)
      case 'mod':
        return y === 0 ? 0 : finite(((x % y) + y) % y)
      case 'pow':
        return finite(x ** y)
      case 'min':
        return Math.min(x, y)
      case 'max':
        return Math.max(x, y)
      case 'round':
        return Math.round(x)
      case 'floor':
        return Math.floor(x)
      case 'ceil':
        return Math.ceil(x)
      case 'abs':
        return Math.abs(x)
      case 'sqrt':
        return x < 0 ? 0 : Math.sqrt(x)
      case 'sin':
        return finite(Math.round(Math.sin(x * deg) * 1e6) / 1e6)
      case 'cos':
        return finite(Math.round(Math.cos(x * deg) * 1e6) / 1e6)
      case 'join':
        return (str(a) + str(b)).slice(0, LIMITS.textLen)
      case 'upper':
        return str(a).toUpperCase()
      case 'lower':
        return str(a).toLowerCase()
      case 'length':
        return Array.isArray(a) ? a.length : str(a).length
      case 'contains':
        return str(a).toLowerCase().includes(str(b).toLowerCase())
      case 'trim':
        return str(a).trim()
    }
    return 0
  }
}
