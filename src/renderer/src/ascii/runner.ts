// Läufer für Zeichenszenen: rAF nur, solange die Fläche sichtbar ist, VibeDesk vorn liegt und nichts dagegen spricht
// (Zen, Sparmodus, Tippen …). Höchstens `fps` Bilder je Sekunde – 30 reichen für Zeichen.
// Steht der Läufer, bleibt das letzte Bild als Standbild stehen.

export interface RunnerOptions {
  /** Bilder je Sekunde (Standard 30) */
  fps?: number
  /** darf die Szene gerade laufen? Wird bei jedem Bild gefragt; ändert sich die Antwort, wake() aufrufen */
  allowed?: () => boolean
  /** anhalten, solange VibeDesk nicht das aktive Fenster ist (Standard: ja) */
  needsFocus?: boolean
  /** Anteil der Fläche, der beim allerersten Start sichtbar sein muss (0 = egal) */
  first?: number
}

export interface Runner {
  /** neu prüfen und ggf. weiterlaufen */
  wake(): void
  /** wieder anwerfen, auch wenn die Szene fertig war – mit fromZero von vorn (t = 0) */
  restart(fromZero?: boolean): void
  /** läuft gerade ein Bild-Takt? */
  readonly running: boolean
  dispose(): void
}

/** frame(t, dt) zeichnet ein Bild; gibt es false zurück, ist die Szene fertig */
export type Frame = (t: number, dt: number) => boolean | void

export function runner(el: Element, frame: Frame, opts: RunnerOptions = {}): Runner {
  const step = 1 / (opts.fps ?? 30)
  const needsFocus = opts.needsFocus ?? true
  const first = opts.first ?? 0
  const io = typeof IntersectionObserver !== 'undefined'
  let raf = 0
  let visible = !io
  let begun = !first
  let last = 0
  let acc = 0
  let t = 0
  let done = false
  let gone = false

  const may = (): boolean =>
    !gone && !done && visible && !document.hidden && (!needsFocus || document.hasFocus()) && (opts.allowed?.() ?? true)

  const tick = (now: number): void => {
    raf = 0
    if (!may()) return
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0
    last = now
    acc += dt
    if (acc + 0.004 < step && dt) {
      raf = requestAnimationFrame(tick)
      return
    }
    const d = Math.min(0.1, acc)
    acc = 0
    t += d
    if (frame(t, d) === false) {
      done = true
      return
    }
    raf = requestAnimationFrame(tick)
  }

  const wake = (): void => {
    if (!raf && may()) {
      last = 0
      raf = requestAnimationFrame(tick)
    }
  }

  let obs: IntersectionObserver | null = null
  if (io) {
    obs = new IntersectionObserver(
      (es) => {
        const e = es[es.length - 1]
        if (!begun && e.intersectionRatio >= first) begun = true
        visible = begun && e.isIntersecting
        wake()
      },
      { threshold: first ? [0, first] : 0 }
    )
    obs.observe(el)
  }
  document.addEventListener('visibilitychange', wake)
  window.addEventListener('focus', wake)
  wake()

  return {
    wake,
    restart(fromZero = true) {
      if (fromZero) t = 0
      done = false
      wake()
    },
    get running() {
      return raf !== 0
    },
    dispose() {
      gone = true
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      obs?.disconnect()
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('focus', wake)
    }
  }
}

/** Reduzierte Bewegung gewünscht? Dann gibt es nur Standbilder. */
export const reducedMotion = (): boolean => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
