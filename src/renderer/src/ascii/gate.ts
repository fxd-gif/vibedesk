// Wann dürfen Zeichen sich bewegen? Nie im Zen- oder Sparmodus und nie bei reduzierter Bewegung (dann Standbild).
// Hintergrund und Sichtbarkeit prüft der Läufer selbst.
import { useEffect, useRef } from 'react'
import { saverActive } from '../ambience/framePolicy'
import { useOnBattery } from '../ambience/RainCanvas'
import { useSettings } from '../store/settingsStore'
import { useUi } from '../store/uiStore'
import { reducedMotion } from './runner'

export interface GateOptions {
  /** im Zen-Modus weiterlaufen (die Regen-Szene gehört zum Zen-Modus dazu) */
  inZen?: boolean
}

/** Ref statt State: der Läufer fragt bei jedem Bild nach, ohne dass React neu rendert. wake wird bei Änderungen gerufen. */
export function useMotionGate(wake: () => void, opts: GateOptions = {}): React.RefObject<boolean> {
  const zen = useUi((s) => !!s.zen)
  const saver = saverActive(
    useSettings((s) => s.s?.energySaver),
    useOnBattery()
  )
  const ok = !saver && !reducedMotion() && (opts.inZen || !zen)
  const ref = useRef(ok)
  ref.current = ok
  const wakeRef = useRef(wake)
  wakeRef.current = wake
  useEffect(() => {
    if (ok) wakeRef.current()
  }, [ok])
  return ref
}
