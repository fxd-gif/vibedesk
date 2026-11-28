// Fenster-Seite des Layouts: startet den Worker (oder, falls das nicht geht, denselben Ablauf im Fenster-Thread)
// und reicht Positionen weiter. Alte Positionen eines vorigen Graphen werden über die Generation verworfen.
import { layoutHost } from './host'
import type { FromWorker, ToWorker } from './protocol'

export interface LayoutClient {
  send(m: ToWorker): void
  dispose(): void
}

export function layoutClient(onPos: (m: FromWorker) => void): LayoutClient {
  try {
    const w = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' })
    let fallback: ((m: ToWorker) => Promise<void>) | null = null
    let last: ToWorker | null = null
    w.onmessage = (ev: MessageEvent<FromWorker>) => onPos(ev.data)
    // Worker lädt nicht (z. B. Pfad gesperrt): ab da im Fenster-Thread weiter, den letzten Graphen nachreichen
    w.onerror = () => {
      w.terminate()
      fallback = layoutHost((m) => onPos(m))
      if (last) void fallback(last)
    }
    return {
      send(m) {
        if (m.type === 'set') last = m
        if (fallback) void fallback(m)
        else w.postMessage(m)
      },
      dispose() {
        w.terminate()
        void fallback?.({ type: 'stop' })
      }
    }
  } catch {
    const host = layoutHost((m) => onPos(m))
    return { send: (m) => void host(m), dispose: () => void host({ type: 'stop' }) }
  }
}
