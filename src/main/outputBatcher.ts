// Bündelt PTY-Ausgabe je Session, damit nicht jeder kleine Chunk einzeln per IPC zum Renderer geht.

export class OutputBatcher {
  private buf = new Map<string, string>()
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private out: (id: string, data: string) => void,
    private delayMs = 8,
    private maxBytes = 256 * 1024
  ) {}

  push(id: string, data: string): void {
    const next = (this.buf.get(id) ?? '') + data
    this.buf.set(id, next)
    if (next.length >= this.maxBytes) this.flush(id)
    else if (!this.timer) this.timer = setTimeout(() => this.flushAll(), this.delayMs)
  }

  /** Sendet den Puffer einer Session sofort (z. B. bevor ihr Exit gemeldet wird). */
  flush(id: string): void {
    const d = this.buf.get(id)
    if (d === undefined) return
    this.buf.delete(id)
    if (!this.buf.size && this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.out(id, d)
  }

  private flushAll(): void {
    this.timer = null
    const all = [...this.buf]
    this.buf.clear()
    all.forEach(([id, d]) => this.out(id, d))
  }
}
