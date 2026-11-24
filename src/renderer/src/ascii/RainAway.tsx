// Session-Abschluss: die Ausgabe-Zeilen der Runde regnen ab, die Zusammenfassung bleibt (unter 1,5 s).
// Läuft nur, wenn es zu sehen ist – sonst (Sparmodus, Zen, reduzierte Bewegung, VibeDesk im Hintergrund) gleich fertig.
import { useEffect, useRef } from 'react'
import { clamp, hash, makeGrid } from './grid'
import { asciiColors } from './palette'
import { reducedMotion, runner } from './runner'
import { useMotionGate } from './gate'

interface Part {
  x: number
  y0: number
  c: string
  color: string
  a: number
  t0: number
  /** verblasst an Ort und Stelle statt zu fallen */
  stay: boolean
  dead?: boolean
}

/** Zeit, in der die Zeilen still stehen, bevor sie fallen */
const HOLD = 0.22
/** spätestens dann ist alles weg */
export const RAIN_AWAY_S = 1.35
const G = 64

export function RainAway({ lines, onDone }: { lines: string[]; onDone(): void }): React.JSX.Element | null {
  const ref = useRef<HTMLCanvasElement>(null)
  const done = useRef(onDone)
  done.current = onDone
  const gate = useMotionGate(() => {})

  useEffect(() => {
    const canvas = ref.current!
    if (!gate.current || reducedMotion() || !document.hasFocus() || document.hidden || !lines.length) {
      done.current()
      return
    }
    const C = asciiColors()
    const g = makeGrid(canvas, () => 12)
    g.resize()
    const tone = (l: string): string => (l.includes('✓') ? C.green : l.startsWith('●') ? C.ink2 : l.startsWith('>') ? C.ink : C.ink3)
    g.clear()
    // die letzten Zeilen, die in die Fläche passen
    lines.slice(-g.rows).forEach((l, y) => {
      const color = tone(l)
      g.text(1, y, l, color, color === C.ink3 ? 0.85 : 1, g.cols - 2)
      if (l.startsWith('●')) g.set(1, y, '●', C.ink3)
    })
    g.paint()
    const parts: Part[] = []
    for (let y = 0; y < g.rows; y++) {
      for (let x = 0; x < g.cols; x++) {
        const i = y * g.cols + x
        const c = g.chr[i]
        if (!c || c === ' ' || g.alp[i] < 0.05) continue
        parts.push({ x, y0: y, c, color: g.col[i], a: g.alp[i], t0: HOLD + hash(i) * 0.35 + (x / g.cols) * 0.15, stay: hash(i + 7919) > 0.6 })
      }
    }
    let finished = false
    const finish = (): void => {
      if (finished) return
      finished = true
      done.current()
    }
    const run = runner(
      canvas,
      (t) => {
        g.clear()
        g.paint()
        const top = g.py(0)
        let alive = 0
        for (const p of parts) {
          if (p.dead) continue
          const d = t - p.t0
          if (d < 0) {
            alive++
            g.blit(p.c, p.color, p.a, g.px(p.x), top + p.y0 * g.ch)
            continue
          }
          if (p.stay) {
            if (d > 0.3) p.dead = true
            else {
              alive++
              g.blit(p.c, p.color, p.a * (1 - d / 0.3), g.px(p.x), top + p.y0 * g.ch)
            }
            continue
          }
          const y = p.y0 + 0.5 * G * d * d + 3 * d
          if (y > g.rows) {
            p.dead = true
            continue
          }
          alive++
          const fade = clamp((g.rows - y) / 3)
          g.blit(d < 0.07 ? p.c : G * d > 12 ? '|' : ':', d < 0.07 ? p.color : C.ink2, (d < 0.07 ? p.a : 0.6) * fade, g.px(p.x), top + y * g.ch)
        }
        if (!alive || t > RAIN_AWAY_S) {
          finish()
          return false
        }
      },
      { fps: 30, allowed: () => gate.current }
    )
    // Sicherheitsnetz: steht der Läufer (Fenster verliert den Fokus), trotzdem nach kurzer Zeit fertig
    const safety = setTimeout(finish, RAIN_AWAY_S * 1000 + 400)
    return () => {
      clearTimeout(safety)
      run.dispose()
      g.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <canvas ref={ref} className="rain-away" aria-hidden />
}
