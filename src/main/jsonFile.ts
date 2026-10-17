import fs from 'fs'
import path from 'path'

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

export function writeJsonAtomic(file: string, data: unknown, compact = false): void {
  writeFileAtomic(file, compact ? JSON.stringify(data) : JSON.stringify(data, null, 2))
}

/**
 * Erst in eine Temp-Datei, dann umbenennen. Unter Windows sperren Virenscanner, Indexer oder OneDrive
 * die Zieldatei manchmal kurz (EPERM/EBUSY) – dann direkt schreiben statt mit einem Fehler abzubrechen.
 */
export function writeFileAtomic(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, text, 'utf8')
  try {
    fs.renameSync(tmp, file)
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') throw e
    fs.writeFileSync(file, text, 'utf8')
    fs.rmSync(tmp, { force: true })
  }
}
