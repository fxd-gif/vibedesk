// Führt das Blockly-JSON eines Addons direkt aus – kein Code-Generator, kein eval.
// Die App erreicht ein Addon ausschließlich über AddonActions.
import type { BlocklyBlock, BlocklyProgram } from '../../../shared/addonBlocks'

export interface AddonActions {
  setScene(v: string): void
  setRain(v0to100: number): void
  getRain(): number
  setVolume(ch: 'music' | 'rain', v0to100: number): void
  getVolume(ch: 'music' | 'rain'): number
  setMusicOn(on: boolean): void
  playSound(v: string): void
  notice(text: string): void
  focus(cmd: 'start' | 'stop'): void
  copyText(text: string): void
  query(what: string): string | number
}

export type AddonEvent =
  | { type: 'start' }
  | { type: 'session_waiting' }
  | { type: 'session_done' }
  | { type: 'focus'; phase: 'work' | 'break' | 'end' }
  | { type: 'time'; hour: number; minute: number }
  | { type: 'hotkey'; key: string }
  | { type: 'interval'; minutes: number }

export interface Clock {
  now(): number
  sleep(ms: number, signal: AbortSignal): Promise<void>
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise((res, rej) => {
      if (signal.aborted) return rej(new Error('abgebrochen'))
      const t = setTimeout(res, ms)
      signal.addEventListener('abort', () => {
        clearTimeout(t)
        rej(new Error('abgebrochen'))
      })
    })
}

export const LIMITS = {
  actionsPerSecond: 20,
  foreverMinMs: 100,
  maxScripts: 10,
  noticeEveryMs: 5000,
  noticeLen: 140,
  maxWaitSec: 3600,
  maxRepeat: 1000,
  yieldEvery: 500
}

const EVENT_OF: Record<string, AddonEvent['type']> = {
  vd_on_start: 'start',
  vd_on_session_waiting: 'session_waiting',
  vd_on_session_done: 'session_done',
  vd_on_focus: 'focus',
  vd_on_time: 'time',
  vd_on_hotkey: 'hotkey',
  vd_on_interval: 'interval'
}

type Value = number | string | boolean

class Aborted extends Error {}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
const toNum = (v: Value): number => {
  const n = typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : parseFloat(v)
  return Number.isFinite(n) ? n : 0
}
const isTrue = (v: unknown): boolean => v === true || v === 'TRUE'
const field = (b: BlocklyBlock, k: string): unknown => b.fields?.[k]
const input = (b: BlocklyBlock, k: string): BlocklyBlock | undefined => b.inputs?.[k]?.block ?? b.inputs?.[k]?.shadow
const varId = (b: BlocklyBlock): string => String((field(b, 'VAR') as { id?: string } | undefined)?.id ?? '')
const numberedInputs = (b: BlocklyBlock, prefix: string): number[] =>
  Object.keys(b.inputs ?? {})
    .map((k) => new RegExp(`^${prefix}(\\d+)$`).exec(k)?.[1])
    .filter((x): x is string => x !== undefined)
    .map(Number)
    .sort((a, c) => a - c)

export class AddonRunner {
  private readonly ctrl = new AbortController()
  private readonly vars = new Map<string, Value>()
  private readonly recent: number[] = []
  private lastNotice = -Infinity
  private steps = 0
  private stopped = false
  private _running = 0

  constructor(
    private readonly opts: {
      program: BlocklyProgram
      prompts: Record<string, string>
      actions: AddonActions
      clock: Clock
      onError(msg: string): void
    }
  ) {}

  get running(): number {
    return this._running
  }

  private get hats(): BlocklyBlock[] {
    return (this.opts.program.blocks?.blocks ?? []).filter((b) => b.type in EVENT_OF)
  }

  listens(): AddonEvent['type'][] {
    return [...new Set(this.hats.map((b) => EVENT_OF[b.type]))]
  }
  hotkeys(): string[] {
    return this.hats.filter((b) => b.type === 'vd_on_hotkey').map((b) => String(field(b, 'KEY')))
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
      default:
        return true
    }
  }

  emit(e: AddonEvent): void {
    if (this.stopped) return
    for (const hat of this.hats) {
      if (!this.matches(hat, e)) continue
      if (this._running >= LIMITS.maxScripts) return
      void this.runScript(input(hat, 'DO'))
    }
  }

  stop(): void {
    this.stopped = true
    this.ctrl.abort()
  }

  private async runScript(body: BlocklyBlock | undefined): Promise<void> {
    this._running++
    try {
      await this.execStack(body)
    } catch (e) {
      if (!(e instanceof Aborted) && !this.ctrl.signal.aborted) this.opts.onError(e instanceof Error ? e.message : String(e))
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

  /** Gleitendes Fenster: höchstens LIMITS.actionsPerSecond Aktionen in jeder Sekunde. */
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

  private async execStack(start: BlocklyBlock | undefined): Promise<void> {
    for (let b = start; b; b = b.next?.block) {
      if (this.ctrl.signal.aborted) throw new Aborted()
      // Alle paar hundert Schritte die Kontrolle an die App zurückgeben, damit nichts einfriert
      if (++this.steps % LIMITS.yieldEvery === 0) await this.sleep(0)
      await this.exec(b)
    }
  }

  private async exec(b: BlocklyBlock): Promise<void> {
    const a = this.opts.actions
    const act = async (fn: () => void): Promise<void> => {
      await this.throttle()
      fn()
    }
    switch (b.type) {
      case 'vd_set_scene':
        return act(() => a.setScene(String(field(b, 'SCENE'))))
      case 'vd_set_rain': {
        const v = clamp(toNum(await this.eval(input(b, 'VALUE'))), 0, 100)
        return act(() => a.setRain(v))
      }
      case 'vd_change_rain': {
        const d = toNum(await this.eval(input(b, 'DELTA')))
        return act(() => a.setRain(clamp(a.getRain() + d, 0, 100)))
      }
      case 'vd_set_volume': {
        const v = clamp(toNum(await this.eval(input(b, 'VALUE'))), 0, 100)
        const ch = field(b, 'CHANNEL') === 'rain' ? 'rain' : 'music'
        return act(() => a.setVolume(ch, v))
      }
      case 'vd_music_onoff':
        return act(() => a.setMusicOn(isTrue(field(b, 'ON'))))
      case 'vd_play_sound':
        return act(() => a.playSound(String(field(b, 'SOUND'))))
      case 'vd_show_notice': {
        const text = String(await this.eval(input(b, 'TEXT'))).slice(0, LIMITS.noticeLen)
        const now = this.opts.clock.now()
        if (now - this.lastNotice < LIMITS.noticeEveryMs) return
        this.lastNotice = now
        return act(() => a.notice(text))
      }
      case 'vd_focus':
        return act(() => a.focus(field(b, 'CMD') === 'stop' ? 'stop' : 'start'))
      case 'vd_copy_text': {
        const text = String(await this.eval(input(b, 'TEXT')))
        return act(() => a.copyText(text))
      }
      case 'vd_wait':
        return this.sleep(clamp(toNum(await this.eval(input(b, 'SECONDS'))), 0, LIMITS.maxWaitSec) * 1000)
      case 'vd_forever':
        for (;;) {
          const started = this.opts.clock.now()
          await this.execStack(input(b, 'DO'))
          await this.sleep(Math.max(0, LIMITS.foreverMinMs - (this.opts.clock.now() - started)))
        }
      case 'controls_repeat_ext': {
        const n = clamp(Math.floor(toNum(await this.eval(input(b, 'TIMES')))), 0, LIMITS.maxRepeat)
        for (let i = 0; i < n; i++) {
          await this.execStack(input(b, 'DO'))
        }
        return
      }
      case 'controls_if': {
        for (const i of numberedInputs(b, 'IF')) {
          if (isTrue(await this.eval(input(b, `IF${i}`)))) return this.execStack(input(b, `DO${i}`))
        }
        return this.execStack(input(b, 'ELSE'))
      }
      case 'variables_set':
        this.vars.set(varId(b), await this.eval(input(b, 'VALUE')))
        return
      case 'math_change':
        this.vars.set(varId(b), toNum(this.vars.get(varId(b)) ?? 0) + toNum(await this.eval(input(b, 'DELTA'))))
        return
      default:
        // Werte-Blöcke als Anweisung oder unbekannte Typen: nichts tun
        return
    }
  }

  private async eval(b: BlocklyBlock | undefined): Promise<Value> {
    if (!b) return 0
    switch (b.type) {
      case 'math_number':
        return toNum(field(b, 'NUM') as Value)
      case 'text':
        return String(field(b, 'TEXT') ?? '')
      case 'logic_boolean':
        return isTrue(field(b, 'BOOL'))
      case 'logic_negate':
        return !isTrue(await this.eval(input(b, 'BOOL')))
      case 'logic_operation': {
        const x = isTrue(await this.eval(input(b, 'A')))
        if (field(b, 'OP') === 'AND') return x && isTrue(await this.eval(input(b, 'B')))
        return x || isTrue(await this.eval(input(b, 'B')))
      }
      case 'logic_compare': {
        const x = await this.eval(input(b, 'A'))
        const y = await this.eval(input(b, 'B'))
        const numeric = typeof x !== 'string' || typeof y !== 'string' ? [toNum(x), toNum(y)] : [x, y]
        const [p, q] = numeric
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
        const x = toNum(await this.eval(input(b, 'A')))
        const y = toNum(await this.eval(input(b, 'B')))
        const r = { ADD: x + y, MINUS: x - y, MULTIPLY: x * y, DIVIDE: y === 0 ? 0 : x / y, POWER: x ** y }[String(field(b, 'OP'))] ?? 0
        return Number.isFinite(r) ? r : 0
      }
      case 'math_random_int': {
        const lo = Math.ceil(toNum(await this.eval(input(b, 'FROM'))))
        const hi = Math.floor(toNum(await this.eval(input(b, 'TO'))))
        const [min, max] = lo <= hi ? [lo, hi] : [hi, lo]
        return min + Math.floor(Math.random() * (max - min + 1))
      }
      case 'text_join': {
        let s = ''
        for (const i of numberedInputs(b, 'ADD')) s += String(await this.eval(input(b, `ADD${i}`)))
        return s.slice(0, 5000)
      }
      case 'variables_get':
        return this.vars.get(varId(b)) ?? 0
      case 'vd_get':
        return this.opts.actions.query(String(field(b, 'WHAT')))
      case 'vd_prompt_text':
        return this.opts.prompts[String(field(b, 'NAME'))] ?? ''
      default:
        return 0
    }
  }
}
