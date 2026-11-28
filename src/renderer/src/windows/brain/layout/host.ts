// Ablauf der Layout-Rechnung: Nachrichten annehmen, Schritte takten, Positionen zurückschicken.
// Läuft im Worker (layout.worker.ts); kann der Worker nicht starten, läuft derselbe Ablauf im Fenster-Thread.
import { ALPHA_DECAY, ALPHA_MIN, jsEngine, wasmEngine, type LayoutEngine } from './engine'
import type { FromWorker, ToWorker } from './protocol'

// native/layout als base64, beim Bauen von native/build.mjs erzeugt; fehlt die Datei (kein Rust), gibt es nur die JS-Engine
const embedded = import.meta.glob('./wasm.gen.ts', { eager: true, import: 'default' }) as Record<string, string>

let modP: Promise<WebAssembly.Module | null> | null = null
function wasmModule(): Promise<WebAssembly.Module | null> {
  modP ??= (async () => {
    const b64 = Object.values(embedded)[0]
    if (!b64 || typeof WebAssembly === 'undefined') return null
    try {
      const bin = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return await WebAssembly.compile(bytes)
    } catch {
      // z. B. Content-Security-Policy ohne wasm-unsafe-eval
      return null
    }
  })()
  return modP
}

export function layoutHost(send: (m: FromWorker, transfer: Transferable[]) => void): (m: ToWorker) => Promise<void> {
  let engine: LayoutEngine | null = null
  let gen = 0
  let n = 0
  let alpha = 0
  let target = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastMs = 0

  const post = (still: boolean): void => {
    if (!engine) return
    const x = new Float32Array(n)
    const y = new Float32Array(n)
    engine.read(x, y)
    send({ type: 'pos', gen, x, y, engine: engine.kind, ms: lastMs, still }, [x.buffer, y.buffer])
  }
  const step = (): void => {
    alpha += (target - alpha) * ALPHA_DECAY
    const t0 = performance.now()
    engine!.tick(alpha)
    lastMs = performance.now() - t0
  }
  // höchstens 60 Schritte je Sekunde; in Ruhe (alpha klein, kein Ziel) hört der Takt auf
  const loop = (): void => {
    timer = undefined
    if (!engine) return
    const t0 = performance.now()
    step()
    const still = alpha < ALPHA_MIN && target <= 0
    post(still)
    if (!still) timer = setTimeout(loop, Math.max(0, 16 - (performance.now() - t0)))
  }
  const wake = (): void => {
    if (timer === undefined && engine) timer = setTimeout(loop, 0)
  }
  const drop = (): void => {
    clearTimeout(timer)
    timer = undefined
    engine?.dispose()
    engine = null
  }

  return async (m) => {
    switch (m.type) {
      case 'set': {
        drop()
        gen = m.gen
        const mod = m.engine === 'js' ? null : await wasmModule()
        // während des Kompilierens kam schon ein neuerer Graph
        if (m.gen !== gen) return
        n = m.input.x.length
        try {
          engine = mod ? wasmEngine(mod, m.input) : jsEngine(m.input)
        } catch {
          engine = jsEngine(m.input)
        }
        // erst einpendeln, dann zeigen – kein wildes Auseinanderfliegen beim Öffnen
        if (m.warm > 0) {
          alpha = 1
          target = 0
          for (let k = 0; k < m.warm; k++) step()
        }
        alpha = m.alpha
        target = 0
        post(false)
        wake()
        break
      }
      case 'alpha':
        if (m.alpha !== undefined) alpha = Math.max(alpha, m.alpha)
        if (m.target !== undefined) target = m.target
        wake()
        break
      case 'fix':
        engine?.fix(m.i, m.x, m.y)
        wake()
        break
      case 'free':
        engine?.free(m.i)
        break
      case 'stop':
        drop()
        break
    }
  }
}
