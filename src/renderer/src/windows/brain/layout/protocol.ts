// Nachrichten zwischen Gehirn-Fenster und Layout-Worker
import type { LayoutInput } from './engine'

export type ToWorker =
  /** neuer Graph: Engine neu, `warm` Schritte vorab (erst einpendeln, dann zeigen), danach mit `alpha` weiter */
  | { type: 'set'; gen: number; input: LayoutInput; warm: number; alpha: number; engine?: 'js' }
  | { type: 'alpha'; alpha?: number; target?: number }
  | { type: 'fix'; i: number; x: number; y: number }
  | { type: 'free'; i: number }
  | { type: 'stop' }

export interface FromWorker {
  type: 'pos'
  gen: number
  x: Float32Array
  y: Float32Array
  engine: 'rust' | 'js'
  /** Dauer des letzten Schritts in ms */
  ms: number
  /** in Ruhe – bis zur nächsten Änderung kommen keine Positionen mehr */
  still: boolean
}
