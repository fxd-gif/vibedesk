// Terminal am Handy: liest den xterm-Puffer einer Session als Zeilen mit Farben und meldet Änderungen.
// Zeilen sind absolut nummeriert: Fällt oben etwas aus dem Verlauf (scrollback voll), zählt `trimmed` weiter.
import type { IBufferCell, IBufferLine, ITheme, Terminal } from '@xterm/xterm'
import { termRange, type TermChunk, type TermLine, type TermQuery, type TermRun } from '../../../shared/companion'

interface Meta {
  /** wechselt bei Größenänderung, Leeren oder Puffer-Wechsel */
  epoch: number
  v: number
  /** aus dem normalen Puffer gefallene Zeilen */
  trimmed: number
  /** zuletzt gesehenes Ende – wird es kleiner, wurde geleert */
  lastEnd: number
  waiters: Set<() => void>
}

const metas = new Map<string, Meta>()
const theme = new Map<string, () => ITheme | undefined>()

/** Gleich beim Anlegen des Terminals aufrufen, damit kein Ausfall aus dem Verlauf verpasst wird */
export function trackTerminal(id: string, term: Terminal, getTheme: () => ITheme | undefined): void {
  const m: Meta = { epoch: 1, v: 1, trimmed: 0, lastEnd: 0, waiters: new Set() }
  metas.set(id, m)
  theme.set(id, getTheme)
  const bump = (): void => {
    m.v++
    const w = [...m.waiters]
    m.waiters.clear()
    w.forEach((f) => f())
  }
  const reset = (): void => {
    m.epoch++
    bump()
  }
  term.onWriteParsed(bump)
  term.onResize(reset)
  term.buffer.onBufferChange(reset)
  // xterm meldet öffentlich nicht, wie viele Zeilen oben herausfallen – die interne Liste schon.
  // Fehlt sie (andere xterm-Version), stimmen die Nummern nach vollem Verlauf nicht mehr; die Prüfung in chunk() fängt das ab.
  try {
    const core = (term as unknown as { _core?: { buffers?: { normal?: { lines?: { onTrim?: (cb: (n: number) => void) => void } } } } })._core
    core?.buffers?.normal?.lines?.onTrim?.((n) => {
      m.trimmed += n
    })
  } catch {
    /* ohne Zähler weiter */
  }
}

export function untrackTerminal(id: string): void {
  const m = metas.get(id)
  m?.waiters.forEach((f) => f())
  metas.delete(id)
  theme.delete(id)
}

// ---------- Farben ----------

const ANSI = ['#000000', '#cd3131', '#0dbc79', '#e5e510', '#2472c8', '#bc3fbc', '#11a8cd', '#e5e5e5', '#666666', '#f14c4c', '#23d18b', '#f5f543', '#3b8eea', '#d670d6', '#29b8db', '#ffffff']
const NAMES: (keyof ITheme)[] = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite']

/** #rgb, #rrggbb oder #rrggbbaa → #rrggbb (alles andere fällt weg) */
export function hex6(c: string | undefined): string | undefined {
  if (!c) return undefined
  const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c)
  if (m3) return `#${m3[1]}${m3[1]}${m3[2]}${m3[2]}${m3[3]}${m3[3]}`.toLowerCase()
  const m6 = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(c)
  return m6 ? `#${m6[1]}`.toLowerCase() : undefined
}

const h2 = (n: number): string => n.toString(16).padStart(2, '0')

/** Farbe aus der 256er-Palette: 0–15 aus dem Theme, dann Würfel und Graustufen */
export function paletteColor(i: number, th?: ITheme): string {
  if (i < 16) return hex6(th?.[NAMES[i]] as string | undefined) ?? ANSI[i]
  if (i < 232) {
    const n = i - 16
    const step = (v: number): number => (v ? 55 + v * 40 : 0)
    return `#${h2(step(Math.floor(n / 36)))}${h2(step(Math.floor(n / 6) % 6))}${h2(step(n % 6))}`
  }
  const g = 8 + (i - 232) * 10
  return `#${h2(g)}${h2(g)}${h2(g)}`
}

function fg(cell: IBufferCell, th?: ITheme): string | undefined {
  if (cell.isFgRGB()) return `#${cell.getFgColor().toString(16).padStart(6, '0')}`
  if (cell.isFgPalette()) return paletteColor(cell.getFgColor(), th)
  return undefined
}
function bg(cell: IBufferCell, th?: ITheme): string | undefined {
  if (cell.isBgRGB()) return `#${cell.getBgColor().toString(16).padStart(6, '0')}`
  if (cell.isBgPalette()) return paletteColor(cell.getBgColor(), th)
  return undefined
}

/** Eine Pufferzeile → Läufe gleicher Optik. Leerraum ohne Hintergrund am Ende fällt weg. */
export function lineRuns(line: IBufferLine, cols: number, cell: IBufferCell, th?: ITheme): TermRun[] {
  const runs: TermRun[] = []
  for (let x = 0; x < cols; x++) {
    if (!line.getCell(x, cell)) break
    // zweite Hälfte eines breiten Zeichens
    if (cell.getWidth() === 0) continue
    const text = cell.isInvisible() ? ' ' : cell.getChars() || ' '
    let f = fg(cell, th)
    let b = bg(cell, th)
    if (cell.isInverse()) {
      const dfg = hex6(th?.foreground) ?? '#e7ecf5'
      const dbg = hex6(th?.background) ?? '#0b0e17'
      ;[f, b] = [b ?? dbg, f ?? dfg]
    }
    const s = (cell.isBold() ? 1 : 0) | (cell.isItalic() ? 2 : 0) | (cell.isUnderline() ? 4 : 0) | (cell.isDim() ? 8 : 0)
    const last = runs[runs.length - 1]
    if (last && last.f === f && last.b === b && (last.s ?? 0) === s) last.t += text
    else {
      const r: TermRun = { t: text }
      if (f) r.f = f
      if (b) r.b = b
      if (s) r.s = s
      runs.push(r)
    }
  }
  // Ende ohne Hintergrund kürzen
  while (runs.length) {
    const r = runs[runs.length - 1]
    if (r.b) break
    const trimmed = r.t.replace(/\s+$/, '')
    if (trimmed) {
      r.t = trimmed
      break
    }
    runs.pop()
  }
  return runs
}

// ---------- Abfrage ----------

/** Zeilen fürs Handy – wartet bei `wait` bis zur nächsten Änderung (höchstens `maxWaitMs`) */
export async function readTerminal(term: Terminal | undefined, id: string, q: TermQuery, maxWaitMs = 20_000): Promise<TermChunk | null> {
  const m = metas.get(id)
  if (!term || !m) return null
  if (q.wait && q.before === undefined && q.v === m.v && q.epoch === m.epoch) {
    await new Promise<void>((resolve) => {
      const done = (): void => {
        clearTimeout(timer)
        m.waiters.delete(done)
        // kurze Ausgabe-Schübe zusammenfassen
        setTimeout(resolve, 60)
      }
      const timer = setTimeout(() => {
        m.waiters.delete(done)
        resolve()
      }, maxWaitMs)
      m.waiters.add(done)
    })
    if (!metas.has(id)) return null
  }
  return chunk(term, m, q, theme.get(id)?.())
}

function chunk(term: Terminal, m: Meta, q: TermQuery, th?: ITheme): TermChunk {
  const buf = term.buffer.active
  const normal = buf.type === 'normal'
  const first = normal ? m.trimmed : 0
  const end = first + buf.length
  // geleert oder Zähler fehlt: Nummern passen nicht mehr → neu aufbauen
  if (end < m.lastEnd) m.epoch++
  m.lastEnd = end
  const head = { epoch: m.epoch, v: m.v, cols: term.cols, rows: term.rows, first, end }
  if (q.wait && q.before === undefined && q.v === m.v && q.epoch === m.epoch) return { ...head, start: end, lines: [], same: true }
  // anderer Stand am Handy → alles ab dem Anfang des Fensters
  const have = q.epoch === m.epoch ? q.have : 0
  const { start, stop } = termRange({ have, before: q.epoch === m.epoch ? q.before : undefined }, first, end, term.rows)
  const cell = buf.getNullCell()
  const lines: TermLine[] = []
  for (let abs = start; abs < stop; abs++) {
    const line = buf.getLine(abs - first)
    if (!line) continue
    const l: TermLine = { r: lineRuns(line, term.cols, cell, th) }
    if (line.isWrapped) l.w = 1
    lines.push(l)
  }
  return { ...head, start, lines }
}
