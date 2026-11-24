// Zeichenraster auf einem Canvas – die Engine der Website (home.js, makeGrid) als typisiertes Modul.
// Ein Canvas pro Fläche, kein DOM-Element pro Zeichen. Jedes Zeichen wird einmal je Farbe in einen Glyphen-Atlas
// gemalt und danach per drawImage kopiert. Block- und Rahmenzeichen werden gezeichnet statt gesetzt,
// damit sie lückenlos aneinanderstoßen.

export const MONO = '"JetBrains Mono", ui-monospace, Consolas, monospace'

/** Zellmaß aus der Schriftgröße (wie auf der Website) */
export const CELL_W = 0.6
export const CELL_H = 1.36

/** Linien durch die Zellmitte: l/r/u/d einfach, L/R/U/D doppelt */
const BOX: Record<string, string> = {
  '─': 'lr',
  '│': 'ud',
  '┌': 'rd',
  '┐': 'ld',
  '└': 'ru',
  '┘': 'lu',
  '├': 'udr',
  '┤': 'udl',
  '┬': 'lrd',
  '┴': 'lru',
  '┼': 'udlr',
  '═': 'LR',
  '║': 'UD',
  '╔': 'RD',
  '╗': 'LD',
  '╚': 'RU',
  '╝': 'LU'
}

/** Glyphen je Atlas-Zeile */
const PER = 64

export interface GridOptions {
  /** höchstens so viele Gerätepixel je CSS-Pixel (Standard 2) */
  maxDpr?: number
  /** nach dem Nachladen der Schrift neu malen (Standbilder) */
  repaint?: () => void
}

export interface Grid {
  readonly canvas: HTMLCanvasElement
  cols: number
  rows: number
  /** Zellbreite/-höhe in Gerätepixeln */
  cw: number
  ch: number
  /** Schriftgröße in CSS-Pixeln */
  fs: number
  dpr: number
  W: number
  H: number
  /** Rand, damit das Raster mittig sitzt */
  ox: number
  oy: number
  chr: string[]
  col: string[]
  alp: Float32Array
  resize(): Grid
  /** Schrift ist nachgeladen: Glyphen neu zeichnen, Raster bleibt */
  invalidate(): void
  clear(): void
  set(x: number, y: number, c: string, color: string, a?: number): void
  text(x: number, y: number, s: string, color: string, a?: number, max?: number): void
  /** ein Zeichen frei positioniert (Gerätepixel) über dem Raster */
  blit(c: string, color: string, a: number, px: number, py: number): void
  /** Raster auf das Canvas bringen (löscht vorher) */
  paint(): void
  /** Zelle → Gerätepixel */
  px(x: number): number
  py(y: number): number
  dispose(): void
}

const live = new Set<Grid>()
const repaints = new Map<Grid, () => void>()
let fontsHooked = false

function hookFonts(): void {
  if (fontsHooked || typeof document === 'undefined' || !document.fonts) return
  fontsHooked = true
  const again = (): void => {
    for (const g of live) {
      g.invalidate()
      repaints.get(g)?.()
    }
  }
  document.fonts.load(`400 16px ${MONO}`).then(again, () => {})
  document.fonts.ready.then(again, () => {})
}

export function makeGrid(canvas: HTMLCanvasElement, sizeFor: (w: number, h: number) => number, opts: GridOptions = {}): Grid {
  const ctx = canvas.getContext('2d')!
  const atlas = document.createElement('canvas')
  const ac = atlas.getContext('2d')!
  const slots = new Map<string, number>()
  let used = 0
  const maxDpr = opts.maxDpr ?? 2

  const g: Grid = {
    canvas,
    cols: 0,
    rows: 0,
    cw: 6,
    ch: 12,
    fs: 12,
    dpr: 1,
    W: 0,
    H: 0,
    ox: 0,
    oy: 0,
    chr: [],
    col: [],
    alp: new Float32Array(0),
    resize,
    invalidate,
    clear,
    set,
    text,
    blit,
    paint,
    px: (x) => g.ox + x * g.cw,
    py: (y) => g.oy + y * g.ch,
    dispose
  }

  function draw(c: string, x: number, y: number, color: string): void {
    const w = g.cw
    const h = g.ch
    ac.fillStyle = color
    if (c === '█') {
      ac.fillRect(x, y, w, h)
      return
    }
    const b = BOX[c]
    if (b) {
      const lw = Math.max(1, Math.round(w * 0.12))
      const cx = x + Math.round((w - lw) / 2)
      const cy = y + Math.round((h - lw) / 2)
      if (b === b.toLowerCase()) {
        if (b.includes('l')) ac.fillRect(x, cy, cx - x + lw, lw)
        if (b.includes('r')) ac.fillRect(cx, cy, x + w - cx, lw)
        if (b.includes('u')) ac.fillRect(cx, y, lw, cy - y + lw)
        if (b.includes('d')) ac.fillRect(cx, cy, lw, y + h - cy)
        return
      }
      // Doppellinien (Schriftzug)
      const d = Math.max(lw + 1, Math.round(w * 0.2))
      const x1 = cx - d
      const x2 = cx + d
      const y1 = cy - d
      const y2 = cy + d
      const L = b.includes('L')
      const R = b.includes('R')
      const U = b.includes('U')
      const D = b.includes('D')
      if (L && R) {
        ac.fillRect(x, y1, w, lw)
        ac.fillRect(x, y2, w, lw)
      } else if (U && D) {
        ac.fillRect(x1, y, lw, h)
        ac.fillRect(x2, y, lw, h)
      } else if (R && D) {
        ac.fillRect(x1, y1, x + w - x1, lw)
        ac.fillRect(x1, y1, lw, y + h - y1)
        ac.fillRect(x2, y2, x + w - x2, lw)
        ac.fillRect(x2, y2, lw, y + h - y2)
      } else if (L && D) {
        ac.fillRect(x, y1, x2 - x + lw, lw)
        ac.fillRect(x2, y1, lw, y + h - y1)
        ac.fillRect(x, y2, x1 - x + lw, lw)
        ac.fillRect(x1, y2, lw, y + h - y2)
      } else if (R && U) {
        ac.fillRect(x1, y, lw, y2 - y + lw)
        ac.fillRect(x1, y2, x + w - x1, lw)
        ac.fillRect(x2, y, lw, y1 - y + lw)
        ac.fillRect(x2, y1, x + w - x2, lw)
      } else if (L && U) {
        ac.fillRect(x2, y, lw, y2 - y + lw)
        ac.fillRect(x, y2, x2 - x + lw, lw)
        ac.fillRect(x1, y, lw, y1 - y + lw)
        ac.fillRect(x, y1, x1 - x + lw, lw)
      }
      return
    }
    ac.save()
    ac.beginPath()
    ac.rect(x, y, w, h)
    ac.clip()
    ac.font = `400 ${(g.fs * g.dpr).toFixed(2)}px ${MONO}`
    ac.textAlign = 'center'
    ac.textBaseline = 'middle'
    ac.fillText(c, x + w / 2, y + h * 0.54)
    ac.restore()
  }

  function slot(c: string, color: string): number {
    const k = color + c
    const hit = slots.get(k)
    if (hit !== undefined) return hit
    const s = used++
    const sy = Math.floor(s / PER) * g.ch
    if (sy + g.ch > atlas.height) {
      const keep = document.createElement('canvas')
      keep.width = atlas.width
      keep.height = atlas.height
      keep.getContext('2d')!.drawImage(atlas, 0, 0)
      atlas.height *= 2
      ac.drawImage(keep, 0, 0)
    }
    draw(c, (s % PER) * g.cw, sy, color)
    slots.set(k, s)
    return s
  }

  function resize(): Grid {
    const r = canvas.getBoundingClientRect()
    const dpr = Math.min(maxDpr, window.devicePixelRatio || 1)
    g.fs = sizeFor(r.width, r.height)
    g.dpr = dpr
    g.cw = Math.max(3, Math.round(g.fs * CELL_W * dpr))
    g.ch = Math.max(6, Math.round(g.fs * CELL_H * dpr))
    g.W = canvas.width = Math.max(1, Math.round(r.width * dpr))
    g.H = canvas.height = Math.max(1, Math.round(r.height * dpr))
    g.cols = Math.max(1, Math.floor(g.W / g.cw))
    g.rows = Math.max(1, Math.floor(g.H / g.ch))
    g.ox = Math.floor((g.W - g.cols * g.cw) / 2)
    g.oy = Math.floor((g.H - g.rows * g.ch) / 2)
    atlas.width = PER * g.cw
    atlas.height = g.ch * 4
    slots.clear()
    used = 0
    const n = g.cols * g.rows
    g.chr = new Array<string>(n).fill('')
    g.col = new Array<string>(n).fill('')
    g.alp = new Float32Array(n)
    return g
  }

  function invalidate(): void {
    slots.clear()
    used = 0
    ac.clearRect(0, 0, atlas.width, atlas.height)
  }

  function clear(): void {
    g.chr.fill('')
    g.alp.fill(0)
  }

  function set(x: number, y: number, c: string, color: string, a = 1): void {
    if (x < 0 || y < 0 || x >= g.cols || y >= g.rows) return
    const i = y * g.cols + x
    g.chr[i] = c
    g.col[i] = color
    g.alp[i] = a
  }

  function text(x: number, y: number, s: string, color: string, a = 1, max = 1e9): void {
    const n = Math.min(s.length, max)
    for (let k = 0; k < n; k++) set(x + k, y, s[k], color, a)
  }

  function blit(c: string, color: string, a: number, px: number, py: number): void {
    if (a <= 0.01 || c === ' ') return
    const s = slot(c, color)
    ctx.globalAlpha = a > 1 ? 1 : a
    ctx.drawImage(atlas, (s % PER) * g.cw, Math.floor(s / PER) * g.ch, g.cw, g.ch, Math.round(px), Math.round(py), g.cw, g.ch)
  }

  function paint(): void {
    ctx.globalAlpha = 1
    ctx.clearRect(0, 0, g.W, g.H)
    const { cols, rows, cw, ch, ox, oy, chr, col, alp } = g
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x
        const a = alp[i]
        if (a <= 0.01) continue
        const c = chr[i]
        if (!c || c === ' ') continue
        const s = slot(c, col[i])
        ctx.globalAlpha = a > 1 ? 1 : a
        ctx.drawImage(atlas, (s % PER) * cw, Math.floor(s / PER) * ch, cw, ch, ox + x * cw, oy + y * ch, cw, ch)
      }
    }
    ctx.globalAlpha = 1
  }

  function dispose(): void {
    live.delete(g)
    repaints.delete(g)
  }

  live.add(g)
  if (opts.repaint) repaints.set(g, opts.repaint)
  hookFonts()
  return g
}

/** schneller, deterministischer Zufall je Zelle (gleich wie auf der Website) */
export function hash(i: number): number {
  let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b)
  x ^= x >>> 13
  x = Math.imul(x, 0xc2b2ae35)
  x ^= x >>> 16
  return (x >>> 0) / 4294967296
}

export const clamp = (v: number, a = 0, b = 1): number => (v < a ? a : v > b ? b : v)
