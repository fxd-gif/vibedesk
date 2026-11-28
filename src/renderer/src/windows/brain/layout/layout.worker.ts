// Layout-Worker des Gehirns: rechnet das Kräfte-Layout außerhalb des Fenster-Threads, damit Zeichnen und Maus flüssig
// bleiben, während sich große Graphen (Tausende Knoten) einpendeln. Bevorzugt die Rust-Engine (WebAssembly), sonst d3-force.
import { layoutHost } from './host'
import type { ToWorker } from './protocol'

const scope = self as unknown as Worker
const handle = layoutHost((m, transfer) => scope.postMessage(m, transfer))
scope.onmessage = (ev: MessageEvent<ToWorker>) => void handle(ev.data)
