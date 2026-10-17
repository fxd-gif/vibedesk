// Bildausschnitte aus der Vorschau („Zeig drauf“) als PNG ablegen, damit Claude sie per Pfad lesen kann.
import fs from 'fs'
import path from 'path'

const PREFIX = 'data:image/png;base64,'
export const SHOT_MAX_BYTES = 8 * 1024 * 1024
export const SHOTS_KEEP = 30

/** Speichert ein PNG (Data-URL) und räumt alte Bilder weg. Liefert den Pfad oder null. */
export function saveShot(dir: string, dataUrl: unknown, now = Date.now()): string | null {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(PREFIX)) return null
  const buf = Buffer.from(dataUrl.slice(PREFIX.length), 'base64')
  // PNG-Signatur prüfen – es geht nur um Bilder
  if (buf.length < 8 || buf.length > SHOT_MAX_BYTES || buf.readUInt32BE(0) !== 0x89504e47) return null
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `vorschau-${now}.png`)
  fs.writeFileSync(file, buf)
  prune(dir)
  return file
}

function prune(dir: string): void {
  const shots = fs
    .readdirSync(dir)
    .filter((f) => /^vorschau-\d+\.png$/.test(f))
    .sort()
  for (const f of shots.slice(0, Math.max(0, shots.length - SHOTS_KEEP))) fs.rmSync(path.join(dir, f), { force: true })
}
