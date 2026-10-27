// Status ohne Hooks (Gemini CLI, Codex): „arbeitet“, solange Ausgabe fließt – nach kurzer Ruhe „wartet auf dich“.

export type ActivityStatus = 'idle' | 'working' | 'waiting'

/** so lange Ruhe im Terminal, dann wartet der Agent vermutlich auf dich */
export const QUIET_MS = 4000
/** Ausgabe so kurz nach einer Eingabe ist das Echo der Tastatur (oder Neuzeichnen nach Größenänderung) */
export const ECHO_MS = 300

// Steuerfolgen (Farben, Cursor, Fenstertitel) zählen nicht als Ausgabe
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?|\x1b[()*+][0-9A-Za-z]|\x1b[0-9=>@-Z\\-_]/g

/** Steht nach dem Entfernen der Steuerzeichen noch sichtbarer Text da? */
export function hasVisibleText(data: string): boolean {
  return /[^\s\x00-\x1f\x7f]/.test(data.replace(ANSI, ''))
}

/** Merkt sich Ein- und Ausgaben einer Session; jede Methode liefert den neuen Status, wenn er sich ändert */
export class AgentActivity {
  status: ActivityStatus = 'idle'
  private lastOutput = 0
  private lastInput = Number.NEGATIVE_INFINITY

  /** Tastendruck, Einfügen oder Größenänderung */
  input(now: number): void {
    this.lastInput = now
  }

  output(now: number, data: string): ActivityStatus | null {
    if (!hasVisibleText(data)) return null
    // Echo vom Tippen weckt keine ruhende Session auf
    if (this.status !== 'working' && now - this.lastInput < ECHO_MS) return null
    this.lastOutput = now
    return this.set('working')
  }

  tick(now: number): ActivityStatus | null {
    if (this.status === 'working' && now - this.lastOutput >= QUIET_MS) return this.set('waiting')
    return null
  }

  private set(s: ActivityStatus): ActivityStatus | null {
    if (s === this.status) return null
    this.status = s
    return s
  }
}
