// Leistungsanzeige: kleine Pille unten links mit Bildrate, Arbeitsspeicher und CPU – an/aus über die Befehlspalette.
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { api } from '../api'
import { t } from '../../../shared/i18n'

const KEY = 'vibedesk.perfMeter'
/** so oft fragt die Anzeige Main nach Speicher und CPU */
const METRICS_MS = 2000

const stored = (): boolean => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export const usePerf = create<{ on: boolean }>(() => ({ on: stored() }))

export function togglePerfMeter(): void {
  const on = !usePerf.getState().on
  usePerf.setState({ on })
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    // ohne Speicher gilt es nur bis zum Neustart
  }
}

/** Bilder pro Sekunde, gemittelt über eine Sekunde – läuft nur, solange die Anzeige sichtbar ist */
function useFps(): number {
  const [fps, setFps] = useState(0)
  useEffect(() => {
    let frames = 0
    let since = performance.now()
    let raf = requestAnimationFrame(function tick(now) {
      frames++
      if (now - since >= 1000) {
        setFps(Math.round((frames * 1000) / (now - since)))
        frames = 0
        since = now
      }
      raf = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(raf)
  }, [])
  return fps
}

function Meter(): React.JSX.Element {
  const fps = useFps()
  const [m, setM] = useState<{ memMb: number; cpu: number } | null>(null)
  useEffect(() => {
    let live = true
    const load = (): void => void api.app.metrics().then((x) => live && setM(x), () => undefined)
    load()
    const iv = setInterval(load, METRICS_MS)
    return () => {
      live = false
      clearInterval(iv)
    }
  }, [])
  return (
    <button className="perf-meter mono" onClick={togglePerfMeter} title={t('Leistungsanzeige – Klick blendet sie aus')} data-testid="perf-meter">
      <span className={fps && fps < 30 ? 'warn' : ''}>{fps} fps</span>
      {m && (
        <>
          <span>{m.memMb} MB</span>
          <span>{m.cpu} % CPU</span>
        </>
      )}
    </button>
  )
}

export function PerfMeter(): React.JSX.Element | null {
  const on = usePerf((s) => s.on)
  return on ? <Meter /> : null
}
