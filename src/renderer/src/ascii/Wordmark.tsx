// Der Schriftzug VIBEDESK aus Zeichen, auf dessen Oberkanten Regen fällt und spritzt (wie am Ende der Website).
// Mit `intro` regnen die Buchstaben beim ersten Erscheinen zusammen – der große Moment im Willkommen.
import { useEffect, useRef } from 'react'
import { banner, bannerWidth, BANNER_ROWS, surfaceOf } from './letters'
import { CELL_H, CELL_W, clamp, hash, makeGrid } from './grid'
import { asciiColors } from './palette'
import { reducedMotion, runner, type Runner } from './runner'
import { useMotionGate } from './gate'

interface Props {
  /** größte Schriftgröße in CSS-Pixeln */
  size?: number
  /** Zeilen Himmel über dem Schriftzug, in denen es regnet */
  sky?: number
  /** Tropfen je Spalte und Sekunde */
  density?: number
  /** Buchstaben regnen beim Erscheinen zusammen */
  intro?: boolean
  /** beim Tippen kurz anhalten */
  quietOnTyping?: boolean
  /** leiser Schriftzug (gedämpfte Farben) – für Flächen, die nicht der große Moment sind */
  quiet?: boolean
  className?: string
  label?: string
}

interface Drop {
  x: number
  y: number
  v: number
  z: number
  dead?: boolean
}
interface Splash {
  x: number
  y: number
  t: number
  dead?: boolean
}

const TYPING_PAUSE_MS = 2500

export function Wordmark({ size = 14, sky = 6, density = 0.35, intro = false, quietOnTyping = false, quiet = false, className, label = 'VibeDesk' }: Props): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const ref = useRef<HTMLCanvasElement>(null)
  const run = useRef<Runner | null>(null)
  const gate = useMotionGate(() => run.current?.wake())

  useEffect(() => {
    const el = box.current!
    const canvas = ref.current!
    const C = asciiColors()
    let lines: string[] = []
    let fs = size
    let left = 0
    let top = 0
    let surface: number[] = []
    let drops: Drop[] = []
    let splashes: Splash[] = []
    // Ziele der Buchstaben-Zellen für das Zusammenregnen
    let cells: { x: number; y: number; c: string; d0: number; fd: number; y0: number }[] = []
    let introEnd = 0
    let pausedUntil = 0
    let wasRunning = false
    let playIntro = intro

    const g = makeGrid(canvas, () => fs, { repaint: () => still() })

    function layout(): void {
      const w = el.getBoundingClientRect().width
      const one = banner('VIBEDESK')
      const cols1 = bannerWidth(one)
      const wide = w / (cols1 * CELL_W) >= 7
      lines = wide ? one : [...banner('VIBE'), '', ...banner('DESK')]
      const cols = bannerWidth(lines)
      fs = Math.max(6, Math.min(size, (w * 0.96) / (cols * CELL_W)))
      canvas.style.height = Math.round((lines.length + sky + 1) * fs * CELL_H) + 'px'
      g.resize()
      left = Math.floor((g.cols - cols) / 2)
      top = g.rows - lines.length - 1
      surface = surfaceOf(lines, g.cols, g.rows, left, top)
      drops = []
      splashes = []
      cells = []
      lines.forEach((l, y) => {
        for (let x = 0; x < l.length; x++) {
          if (l[x] === ' ') continue
          const i = y * 97 + x
          // erst kurz warten, bis die Fläche eingeblendet ist – dann fallen die Zeichen gestaffelt von links
          const d0 = 0.45 + hash(i) * 0.7 + (x / cols) * 0.25
          const fd = 0.32 + hash(i + 5) * 0.26
          cells.push({ x: left + x, y: top + y, c: l[x], d0, fd, y0: -1 - hash(i + 3) * 6 })
        }
      })
      introEnd = Math.max(0, ...cells.map((c) => c.d0 + c.fd)) + 0.2
    }

    // Blöcke hell, Schatten-Linien leise (wie auf der Website); leise Fassung eine Stufe dunkler
    const tone = (c: string): [string, number] => (c === '█' ? (quiet ? [C.ink3, 0.9] : [C.ink, 0.94]) : quiet ? [C.ink4, 0.9] : [C.ink3, 0.85])

    function paintWord(): void {
      g.clear()
      for (const c of cells) {
        const [color, a] = tone(c.c)
        g.set(c.x, c.y, c.c, color, a)
      }
    }

    /** Endzustand ohne Bewegung */
    function still(): void {
      paintWord()
      g.paint()
    }

    const spawn = (dt: number, rate: number): void => {
      let want = g.cols * rate * dt
      while (want > 0) {
        if (Math.random() < want) {
          const z = Math.random()
          drops.push({ x: Math.floor(Math.random() * g.cols), y: -1, v: 10 + z * 16, z })
        }
        want -= 1
      }
    }

    function frame(t: number, dt: number): void {
      const y0 = g.py(0)
      const assembling = playIntro && t < introEnd
      g.clear()
      if (assembling) {
        // Buchstaben regnen zusammen: jede Zelle fällt als Strich und wird beim Aufkommen zum Zeichen
        for (const c of cells) {
          const p = clamp((t - c.d0) / c.fd)
          if (p >= 1) {
            const [color, a] = tone(c.c)
            g.set(c.x, c.y, c.c, color, a * clamp((t - c.d0 - c.fd) / 0.18))
          }
        }
      } else paintWord()
      // Spritzer auf den Oberkanten
      for (const s of splashes) {
        const age = t - s.t
        if (age > 0.32) {
          s.dead = true
          continue
        }
        const a = 0.8 * (1 - age / 0.32)
        if (age < 0.1) g.set(s.x, s.y, '.', C.ink, a)
        else {
          g.set(s.x - 1, s.y, '·', C.ink2, a)
          g.set(s.x + 1, s.y, '·', C.ink2, a)
        }
      }
      g.paint()
      if (assembling) {
        for (const c of cells) {
          const p = clamp((t - c.d0) / c.fd)
          if (p <= 0 || p >= 1) continue
          const y = c.y0 + (c.y - c.y0) * p * p
          g.blit(p > 0.5 ? '|' : ':', C.ink2, 0.65, g.px(c.x), y0 + y * g.ch)
        }
      }
      // danach leiser Regen, der langsam einsetzt
      spawn(dt, density * (playIntro ? clamp((t - introEnd) / 1.2) : 1))
      for (const d of drops) {
        if (d.dead) continue
        d.y += d.v * dt
        const stop = surface[d.x] - 1
        if (d.y >= stop) {
          d.dead = true
          if (surface[d.x] < g.rows) splashes.push({ x: d.x, y: stop, t })
          continue
        }
        g.blit(d.z > 0.55 ? '|' : ':', C.ink2, 0.2 + d.z * 0.45, g.px(d.x), y0 + d.y * g.ch)
      }
      if (drops.length > 300 || splashes.length > 200) {
        drops = drops.filter((d) => !d.dead)
        splashes = splashes.filter((s) => !s.dead)
      }
    }

    layout()
    const motion = (): boolean => gate.current && performance.now() >= pausedUntil
    // Zusammenregnen nur, wenn es jetzt auch zu sehen ist – sonst (Sparmodus, Zen, reduzierte Bewegung,
    // VibeDesk im Hintergrund) gleich der fertige Schriftzug
    if (playIntro && motion() && !reducedMotion() && document.hasFocus() && !document.hidden) {
      g.clear()
      g.paint()
    } else {
      playIntro = false
      still()
    }
    run.current = runner(
      el,
      (t, dt) => {
        wasRunning = true
        frame(t, dt)
      },
      { fps: 30, allowed: motion }
    )

    let resumeTimer: ReturnType<typeof setTimeout> | undefined
    const onKey = (): void => {
      pausedUntil = performance.now() + TYPING_PAUSE_MS
      clearTimeout(resumeTimer)
      resumeTimer = setTimeout(() => run.current?.wake(), TYPING_PAUSE_MS + 30)
    }
    if (quietOnTyping) window.addEventListener('keydown', onKey, true)

    let w = el.getBoundingClientRect().width
    let q: ReturnType<typeof setTimeout> | undefined
    const ro = new ResizeObserver(() => {
      clearTimeout(q)
      q = setTimeout(() => {
        const nw = el.getBoundingClientRect().width
        if (Math.abs(nw - w) < 2) return
        w = nw
        layout()
        // nach einer Größenänderung nicht noch einmal von vorn
        if (wasRunning) playIntro = false
        still()
        run.current?.wake()
      }, 160)
    })
    ro.observe(el)

    return () => {
      run.current?.dispose()
      run.current = null
      ro.disconnect()
      clearTimeout(q)
      clearTimeout(resumeTimer)
      if (quietOnTyping) window.removeEventListener('keydown', onKey, true)
      g.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, sky, density, quietOnTyping, quiet])

  return (
    <div ref={box} className={`ascii-word${className ? ' ' + className : ''}`} role="img" aria-label={label}>
      <canvas ref={ref} aria-hidden />
    </div>
  )
}

/** Höhe des Schriftzugs in Zeilen inkl. Himmel – für Platzhalter */
export const wordmarkRows = (sky: number): number => BANNER_ROWS + sky + 1
