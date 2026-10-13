// Strom: PC wach halten, solange der Handy-Begleiter läuft – und vom Handy aus herunterfahren oder schlafen legen.
import { SHUTDOWN_DELAY_S, type PowerAction } from '../shared/companion'
import type { Runner } from './gitService'

export interface PowerDeps {
  run: Runner
  /** Electron powerSaveBlocker (prevent-app-suspension: kein Standby, Bildschirm darf aus) */
  blocker: { start(): number; stop(id: number): void }
  onChange(action: PowerAction, at: number | null): void
  now?: () => number
}

const SLEEP_PS =
  "Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.Application]::SetSuspendState([System.Windows.Forms.PowerState]::Suspend, $false, $false)"

export class PowerControl {
  private block: number | null = null
  private at: number | null = null
  private clear: ReturnType<typeof setTimeout> | null = null

  constructor(private d: PowerDeps) {}

  get shutdownAt(): number | null {
    return this.at
  }

  keepAwake(on: boolean): void {
    if (on && this.block === null) this.block = this.d.blocker.start()
    if (!on && this.block !== null) {
      this.d.blocker.stop(this.block)
      this.block = null
    }
  }

  get awake(): boolean {
    return this.block !== null
  }

  async act(action: unknown): Promise<{ ok: true; at: number | null } | { ok: false; error: string }> {
    const now = this.d.now?.() ?? Date.now()
    const opts = { cwd: process.env.SystemRoot ?? 'C:\\Windows', timeout: 20_000 }
    if (action === 'shutdown') {
      if (this.at) return { ok: true, at: this.at }
      const r = await this.d.run('shutdown.exe', ['/s', '/t', String(SHUTDOWN_DELAY_S), '/c', 'VibeDesk: vom Handy ausgeschaltet. Abbrechen mit „shutdown /a“ oder in VibeDesk.'], opts)
      if (r.code !== 0) return { ok: false, error: 'Windows hat das Herunterfahren abgelehnt.' }
      this.at = now + SHUTDOWN_DELAY_S * 1000
      if (this.clear) clearTimeout(this.clear)
      this.clear = setTimeout(() => (this.at = null), SHUTDOWN_DELAY_S * 1000 + 5000)
      this.d.onChange('shutdown', this.at)
      return { ok: true, at: this.at }
    }
    if (action === 'cancel') {
      await this.d.run('shutdown.exe', ['/a'], opts)
      this.at = null
      if (this.clear) clearTimeout(this.clear)
      this.d.onChange('cancel', null)
      return { ok: true, at: null }
    }
    if (action === 'sleep') {
      // erst antworten, dann schlafen – sonst wartet das Handy ins Leere
      this.d.onChange('sleep', null)
      setTimeout(() => {
        // Der Wach-Halter würde den Standby verhindern
        this.keepAwake(false)
        void this.d.run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', SLEEP_PS], opts)
      }, 1500)
      return { ok: true, at: null }
    }
    return { ok: false, error: 'Unbekannte Aktion' }
  }
}
