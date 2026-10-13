// Handy-Begleiter: Koppeln per Einmal-Code und Geräte-Schlüssel.
// Der Code erscheint nur auf Knopfdruck am PC (wer koppeln will, muss davorsitzen), gilt einmal, kurz und mit
// wenigen Versuchen. Danach hat jedes Handy einen eigenen Schlüssel; gespeichert wird nur dessen Hash.
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto'
import { readJson, writeJsonAtomic } from './jsonFile'
import type { CompanionDevice } from '../shared/companion'

export const CODE_TTL_MS = 5 * 60_000
export const CODE_TRIES = 5
const MAX_DEVICES = 10

interface Stored extends CompanionDevice {
  hash: string
}

const sha = (s: string): Buffer => createHash('sha256').update(s).digest()

export type PairResult = { ok: true; token: string; device: CompanionDevice } | { ok: false; error: string }

export class CompanionAuth {
  private devices: Stored[]
  private code: { value: string; expiresAt: number; tries: number } | null = null

  constructor(
    private file: string,
    private onChange: () => void = () => {},
    private now: () => number = Date.now
  ) {
    const raw = readJson<unknown>(file, { devices: [] })
    const list = (raw as { devices?: unknown })?.devices
    this.devices = Array.isArray(list)
      ? list.filter((d): d is Stored => !!d && typeof d.id === 'string' && typeof d.hash === 'string' && /^[0-9a-f]{64}$/.test(d.hash))
      : []
  }

  list(): CompanionDevice[] {
    return this.devices.map(({ id, name, created }) => ({ id, name, created }))
  }

  /** Neuer 6-stelliger Code, ersetzt einen alten */
  startPairing(): { code: string; expiresAt: number } {
    const value = String(randomInt(0, 1_000_000)).padStart(6, '0')
    this.code = { value, expiresAt: this.now() + CODE_TTL_MS, tries: 0 }
    return { code: value, expiresAt: this.code.expiresAt }
  }

  cancelPairing(): void {
    this.code = null
  }

  get pairing(): { code: string; expiresAt: number } | null {
    if (!this.code || this.code.expiresAt <= this.now()) return null
    return { code: this.code.value, expiresAt: this.code.expiresAt }
  }

  pair(code: unknown, name: unknown): PairResult {
    const c = this.code
    if (!c || c.expiresAt <= this.now()) return { ok: false, error: 'Kein gültiger Code – tippe am PC auf „Handy koppeln“.' }
    const given = typeof code === 'string' ? code.replace(/\s+/g, '') : ''
    const ok = given.length === c.value.length && timingSafeEqual(Buffer.from(given), Buffer.from(c.value))
    if (!ok) {
      c.tries++
      if (c.tries >= CODE_TRIES) {
        this.code = null
        return { ok: false, error: 'Zu viele falsche Versuche – lass dir am PC einen neuen Code zeigen.' }
      }
      return { ok: false, error: `Falscher Code – noch ${CODE_TRIES - c.tries} Versuche.` }
    }
    this.code = null
    const token = randomBytes(32).toString('hex')
    const device: Stored = {
      id: randomBytes(6).toString('hex'),
      name: (typeof name === 'string' ? name.replace(/[\u0000-\u001f]/g, '').trim() : '').slice(0, 40) || 'Handy',
      created: this.now(),
      hash: sha(token).toString('hex')
    }
    // ältestes Gerät fliegt raus, wenn es zu viele werden
    this.devices = [...this.devices, device].slice(-MAX_DEVICES)
    this.save()
    const { hash: _h, ...pub } = device
    return { ok: true, token, device: pub }
  }

  /** Gerät zum Schlüssel (oder null) */
  verify(token: string): CompanionDevice | null {
    if (!/^[0-9a-f]{64}$/.test(token)) return null
    const h = sha(token)
    let hit: Stored | null = null
    // alle vergleichen, damit die Laufzeit nichts verrät
    for (const d of this.devices) if (timingSafeEqual(h, Buffer.from(d.hash, 'hex'))) hit = d
    return hit ? { id: hit.id, name: hit.name, created: hit.created } : null
  }

  revoke(id: string): boolean {
    const before = this.devices.length
    this.devices = this.devices.filter((d) => d.id !== id)
    if (this.devices.length === before) return false
    this.save()
    return true
  }

  revokeAll(): void {
    this.devices = []
    this.code = null
    this.save()
  }

  private save(): void {
    writeJsonAtomic(this.file, { devices: this.devices })
    this.onChange()
  }
}
