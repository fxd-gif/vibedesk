// Szene „Zeichenregen“: der Regen der Website als Hintergrund hinter der Scheibe – neben Stadt, Wald und Tokio.
// Tropfen mit Tiefe (nah | · mittel ¦ · fern :), unten eine ruhige Wasserlinie mit Ringen, die Maus ist ein Schirm.
// Jede Session ist ein kleines Terminal aus Zeichen an ihrem Platz der „Lichter gegenüber“ – Rahmenfarbe = Status,
// wie die drei Terminals im Hero der Website. Dichte = Regen-Regler. 30 Bilder/s, im Sparmodus 15 und gröber,
// nur solange VibeDesk vorn liegt; reduzierte Bewegung = Standbild.
import { useEffect, useRef } from 'react'
import { makeGrid } from './grid'
import { asciiColors, type AsciiColors } from './palette'
import { fit, paneRects, type PaneRect } from './panes'
import { lampLook, lampsAnimate, type Lamp } from '../ambience/lights'
import { lampStatusText } from '../ambience/lampText'
import { subscribeLamps, useLights } from '../store/lightsStore'
import type { SessionStatus } from '../../../shared/types'
import { t as tr } from '../../../shared/i18n'
import { waitedFor } from '../../../shared/waiting'
import { reducedMotion, runner, type Runner } from './runner'
import { saverActive } from '../ambience/framePolicy'
import { useOnBattery } from '../ambience/RainCanvas'
import { useSettings } from '../store/settingsStore'

interface Drop {
  x: number
  y: number
  z: number
  v: number
  dead?: boolean
}
interface Ring {
  x: number
  y?: number
  t: number
  /** am Schirm abgeprallt */
  u?: boolean
  dead?: boolean
}

export function CharRainScene({ intensity }: { intensity: number }): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const run = useRef<Runner | null>(null)
  const density = useRef(intensity)
  const saver = saverActive(
    useSettings((s) => s.s?.energySaver),
    useOnBattery()
  )
  const still = useRef<() => void>(() => {})
  // auch im Sparmodus regnet es – nur langsamer und gröber, wie beim Regen-auf-Glas
  const motionOk = useRef(true)
  motionOk.current = !reducedMotion()

  // Regler bewegt → neue Dichte; im Standbild einmal neu zeichnen
  useEffect(() => {
    density.current = intensity
    // war der Regen auf 0 und alles gefallen, steht der Läufer – dann ohne Zeitsprung wieder anwerfen
    if (motionOk.current) run.current?.restart(false)
    else still.current()
  }, [intensity])

  useEffect(() => {
    const canvas = ref.current!
    const C = asciiColors()
    // Sparmodus: weniger Pixel; sonst wie der Regen-Shader höchstens 1,5-fach
    const g = makeGrid(canvas, () => 13, { maxDpr: saver ? 1 : 1.5, repaint: () => still.current() })
    let drops: Drop[] = []
    let rings: Ring[] = []
    let umbrella: [number, number] | null = null
    let t0 = 0
    let lamps: Lamp[] = []
    let panes: PaneRect[] = []
    const placePanes = (): void => {
      panes = useLights.getState().outlook ? [] : paneRects(lamps, g.cols, g.rows)
    }

    const drop = (y = -1 - Math.random() * 2): Drop => {
      const z = Math.random()
      return { x: Math.floor(Math.random() * g.cols), y, z, v: 9 + z * 20 }
    }

    function layout(): void {
      g.resize()
      placePanes()
      drops = []
      rings = []
      // gleich zu Beginn schon Regen in der Luft
      const n = Math.round(density.current * g.cols * 1.6)
      for (let k = 0; k < n; k++) drops.push(drop(Math.random() * (g.rows - 2)))
    }

    function frame(t: number, dt: number): boolean | void {
      t0 = t
      const { cols, rows } = g
      const water = rows - 2
      const dens = density.current
      let want = dens * cols * 1.1 * dt
      while (want > 0) {
        if (Math.random() < want) drops.push(drop())
        want -= 1
      }
      g.clear()
      // ruhige Wasserlinie, die sich kaum bewegt
      for (let x = 0; x < cols; x++) {
        const v = Math.sin(x * 0.21 + t * 0.9) + Math.sin(x * 0.067 - t * 0.5)
        g.set(x, water, v > 1.3 ? '~' : '_', C.ink3, v > 1.3 ? 0.3 : 0.16)
      }
      // Ringe, wo Tropfen ins Wasser fallen oder am Schirm abprallen
      for (const r of rings) {
        const age = t - r.t
        if (age > 0.55) {
          r.dead = true
          continue
        }
        const s = Math.floor(age * 12)
        const a = 0.7 * (1 - age / 0.55)
        if (r.u) {
          g.set(r.x - 1 - s, r.y ?? 0, '·', C.ink2, a)
          g.set(r.x + 1 + s, r.y ?? 0, '·', C.ink2, a)
          continue
        }
        g.set(r.x - s, water, '~', C.ink2, a)
        g.set(r.x + s, water, '~', C.ink2, a)
        if (age < 0.14) g.set(r.x, water - 1, age < 0.07 ? "'" : '.', C.ink2, a)
      }
      const animate = motionOk.current
      for (const p of panes) drawPane(p, C, t, animate)
      g.paint()
      const top = g.py(0)
      let alive = 0
      for (const d of drops) {
        if (d.dead) continue
        d.y += d.v * dt
        if (umbrella) {
          const dx = d.x - umbrella[0]
          const R = 6
          if (Math.abs(dx) <= R) {
            const dome = umbrella[1] - 1.6 * (1 - (dx / R) ** 2)
            if (d.y >= dome && d.y < umbrella[1] + 2) {
              d.dead = true
              rings.push({ x: d.x, y: Math.round(dome), t, u: true })
              continue
            }
          }
        }
        if (d.y >= water) {
          d.dead = true
          rings.push({ x: d.x, t })
          continue
        }
        alive++
        // vor den Fenstern nur ein Hauch Regen, damit Name und Status lesbar bleiben
        const behind = panes.some((p) => d.x >= p.x && d.x < p.x + p.w && d.y >= p.y - 0.5 && d.y < p.y + p.h)
        const c = d.z > 0.62 ? '|' : d.z > 0.3 ? '¦' : ':'
        g.blit(c, d.z > 0.5 ? C.ink2 : C.ink3, (0.16 + d.z * 0.56) * (behind ? 0.22 : 1), g.px(d.x), top + d.y * g.ch)
      }
      if (drops.length > 900 || rings.length > 400) {
        drops = drops.filter((d) => !d.dead)
        rings = rings.filter((r) => !r.dead)
      }
      // Regen auf 0 und alles gefallen → Standbild, kein Takt mehr (außer ein Fenster flackert oder atmet)
      if (dens <= 0 && !alive && rings.every((r) => r.dead) && !(panes.length && lampsAnimate(lamps))) return false
    }

    /** ein Terminal aus Zeichen: Name oben im Rahmen, Status in der Mitte, Licht in Statusfarbe */
    function drawPane(p: PaneRect, C: AsciiColors, t: number, animate: boolean): void {
      const { x, y, w, h, lamp } = p
      const color = statusColor(lamp.status, C)
      const look = lampLook(lamp.status, t, animate, lamp.slot * 1.7)
      const edge = 0.3 + 0.65 * look.intensity
      // Scheibe: Fläche leeren (Regen dahinter verschwindet) und ganz leicht in Statusfarbe tönen
      for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) g.set(x + i, y + j, (i + j) % 2 ? ' ' : '·', color, 0.05 + 0.12 * look.intensity)
      g.set(x, y, '┌', color, edge)
      g.set(x + w - 1, y, '┐', color, edge)
      g.set(x, y + h - 1, '└', color, edge)
      g.set(x + w - 1, y + h - 1, '┘', color, edge)
      for (let i = 1; i < w - 1; i++) {
        g.set(x + i, y, '─', color, edge)
        g.set(x + i, y + h - 1, '─', color, edge)
      }
      for (let j = 1; j < h - 1; j++) {
        g.set(x, y + j, '│', color, edge)
        g.set(x + w - 1, y + j, '│', color, edge)
      }
      // ● Name im oberen Rahmen, wie in den Terminals der Website
      const name = ' ' + fit(lamp.name, w - 7) + ' '
      g.set(x + 2, y, ' ', color)
      g.set(x + 3, y, '●', color, 0.5 + 0.5 * look.intensity)
      g.text(x + 4, y, name, C.ink, 0.95)
      // Status mittig, in Statusfarbe; Wartende: „wartet“ und darunter die Dauer (oder in einer Zeile, wenn sie passt)
      const max = w - 4
      const inner = h - 2
      let lines = [lampStatusText(lamp)]
      if (lamp.status === 'waiting' && lamp.waitingSince) {
        const long = tr('wartet auf dich')
        const [head, dur] = [long.length <= max ? long : tr('wartet'), waitedFor(lamp.waitingSince)]
        const one = `${head} · ${dur}`
        lines = inner >= 3 ? [head, dur] : one.length <= max ? [one] : [head]
      }
      const sy0 = y + 1 + Math.floor((inner - lines.length) / 2)
      lines.forEach((l, k) => {
        const st = fit(l, max)
        const sx = x + Math.floor((w - st.length) / 2)
        for (let i = -1; i <= st.length; i++) g.set(sx + i, sy0 + k, ' ', color)
        g.text(sx, sy0 + k, st, color, lamp.status === 'idle' ? 0.6 : k ? 0.7 : 0.95)
      })
    }

    still.current = () => {
      // ein Moment Regen, ohne dass die Zeit weiterläuft
      if (!drops.length && density.current > 0) layout()
      frame(t0 || 1, 0)
    }

    layout()
    still.current()
    run.current = runner(canvas, frame, { fps: saver ? 15 : 30, allowed: () => motionOk.current, needsFocus: true })

    // Sessions kommen und gehen, wechseln den Status, der Ausblick öffnet: Fenster neu setzen
    const onLamps = (next: Lamp[]): void => {
      lamps = next
      placePanes()
      if (motionOk.current) run.current?.restart(false)
      else still.current()
    }
    const offLamps = subscribeLamps(onLamps)
    // im Ausblick zeichnet Outlook.tsx die Fenster selbst (beschriftet, anklickbar)
    const offOutlook = useLights.subscribe((s, prev) => s.outlook !== prev.outlook && onLamps(lamps))

    // die Maus ist ein Schirm – aber nur über freier Fläche, nicht über Fenstern
    const onMove = (e: PointerEvent): void => {
      const target = e.target as Element | null
      if (!target || !(target === canvas || target.classList?.contains('app'))) {
        umbrella = null
        return
      }
      const r = canvas.getBoundingClientRect()
      umbrella = [((e.clientX - r.left) * g.dpr - g.ox) / g.cw, ((e.clientY - r.top) * g.dpr - g.oy) / g.ch]
    }
    const onLeave = (): void => {
      umbrella = null
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    let q: ReturnType<typeof setTimeout> | undefined
    const onResize = (): void => {
      clearTimeout(q)
      q = setTimeout(() => {
        layout()
        still.current()
        run.current?.restart()
      }, 160)
    }
    window.addEventListener('resize', onResize)
    return () => {
      run.current?.dispose()
      run.current = null
      offLamps()
      offOutlook()
      clearTimeout(q)
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('resize', onResize)
      g.dispose()
      still.current = () => {}
    }
  }, [saver])

  return <canvas ref={ref} className="rain-canvas ascii-scene" data-testid="ascii-scene" aria-hidden />
}

const statusColor = (s: SessionStatus, C: AsciiColors): string =>
  s === 'working' ? C.green : s === 'waiting' ? C.amber : s === 'done' ? C.blue : s === 'error' ? C.red : C.ink2

/** kleines Vorschaubild für die Szenenwahl: ein Moment Zeichenregen auf Nacht-Blau */
export function charRainThumb(w = 192, h = 108): string {
  const C = asciiColors()
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, w, h)
  ctx.font = `400 9px "JetBrains Mono", ui-monospace, Consolas, monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const cw = 5.4
  const chh = 12.2
  const cols = Math.floor(w / cw)
  const rows = Math.floor(h / chh)
  let seed = 7
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let k = 0; k < cols * 1.4; k++) {
    const z = rnd()
    ctx.globalAlpha = 0.16 + z * 0.56
    ctx.fillStyle = z > 0.5 ? C.ink2 : C.ink3
    ctx.fillText(z > 0.62 ? '|' : z > 0.3 ? '¦' : ':', Math.floor(rnd() * cols) * cw + cw / 2, rnd() * (rows - 2) * chh)
  }
  ctx.globalAlpha = 0.24
  ctx.fillStyle = C.ink3
  for (let x = 0; x < cols; x++) ctx.fillText(Math.sin(x * 0.7) > 0.6 ? '~' : '_', x * cw + cw / 2, (rows - 1.5) * chh)
  ctx.globalAlpha = 1
  return c.toDataURL('image/png')
}
