// Terminal-Bedienung wie im Windows Terminal: Tastenkürzel, Datei-Links in der Ausgabe, Pfade einfügen.

export type TermAction = 'copy' | 'paste' | 'search' | 'zoomIn' | 'zoomOut' | 'zoomReset'

export interface KeyLike {
  key: string
  code?: string
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
}

/**
 * Was ein Tastendruck im Terminal bedeutet. null = normal ans Programm weitergeben.
 * Strg+C kopiert nur, wenn etwas markiert ist – sonst bleibt es der Abbruch für Claude bzw. die Shell.
 */
export function keyAction(e: KeyLike, hasSelection: boolean): TermAction | null {
  if (e.altKey || e.metaKey) return null
  const k = e.key.toLowerCase()
  if (e.shiftKey && !e.ctrlKey && k === 'insert') return 'paste'
  if (!e.ctrlKey) return null
  if (k === 'insert' && !e.shiftKey) return hasSelection ? 'copy' : null
  if (k === 'c') return e.shiftKey || hasSelection ? 'copy' : null
  if (k === 'v') return 'paste'
  if (k === 'f') return 'search'
  if (k === '+' || k === '=' || e.code === 'NumpadAdd') return 'zoomIn'
  if (k === '-' || e.code === 'NumpadSubtract') return 'zoomOut'
  if (k === '0' || e.code === 'Numpad0') return 'zoomReset'
  return null
}

export const FONT_MIN = 9
export const FONT_MAX = 28

export function zoomFont(size: number, action: 'zoomIn' | 'zoomOut' | 'zoomReset', base: number): number {
  if (action === 'zoomReset') return base
  return Math.min(FONT_MAX, Math.max(FONT_MIN, size + (action === 'zoomIn' ? 1 : -1)))
}

/** Pfade so einfügen, dass Shell und Claude sie als je ein Argument lesen */
export function quotePaths(paths: string[]): string {
  return paths
    .filter(Boolean)
    .map((p) => (/[\s&()[\]{}^=;!'+,`~]/.test(p) ? `"${p.replace(/"/g, '')}"` : p))
    .join(' ')
}

export interface FileLink {
  /** Spalte in der Zeile (0-basiert), Ende exklusiv */
  start: number
  end: number
  path: string
  line?: number
  col?: number
}

// Laufwerk (C:\) oder ./ ../ am Anfang, dann Ordner, dann Dateiname mit Endung; optional :Zeile(:Spalte) oder (Zeile,Spalte)
const FILE_RE = /(?:[A-Za-z]:[\\/]|\.{1,2}[\\/])?(?:[\w@.$-]+[\\/])*[\w@$-][\w@.$-]*\.[A-Za-z][\w]{0,9}(?::(\d+)(?::(\d+))?|\((\d+)(?:,\s?(\d+))?\))?/g

/**
 * Findet Datei-Pfade in einer Terminal-Zeile, z. B. `src/app.ts:42`, `C:\proj\main.py`, `./x.tsx(3,7)`.
 * Ein nackter Dateiname zählt nur mit Zeilennummer – sonst wären „Node.js“ oder „v0.17.2“ Links.
 */
export function findFileLinks(text: string): FileLink[] {
  const out: FileLink[] = []
  FILE_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = FILE_RE.exec(text))) {
    const raw = m[0]
    const start = m.index
    const before = text.slice(Math.max(0, start - 3), start)
    // mitten in einem Wort, Teil einer URL (https://…/datei.js) oder E-Mail – das macht der Web-Link
    if (/:\/\/?$|\/\/$|[\w@]$/.test(before)) continue
    const line = m[1] ?? m[3]
    const col = m[2] ?? m[4]
    const path = raw.replace(/(?::\d+(?::\d+)?|\(\d+(?:,\s?\d+)?\))$/, '')
    const hasDir = /[\\/]/.test(path)
    if (!hasDir && !line) continue
    out.push({ start, end: start + raw.length, path, ...(line ? { line: Number(line) } : {}), ...(col ? { col: Number(col) } : {}) })
  }
  return out
}

/** Absoluter Pfad für einen Link: relativ gilt zum Projektordner */
export function resolveLinkPath(path: string, cwd: string): string {
  if (/^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\')) return path.replace(/\//g, '\\')
  const parts = cwd.replace(/[\\/]+$/, '').split(/[\\/]/)
  for (const seg of path.split(/[\\/]/)) {
    if (!seg || seg === '.') continue
    if (seg === '..') {
      if (parts.length > 1) parts.pop()
    } else parts.push(seg)
  }
  return parts.join('\\')
}

/** localhost & Co. öffnen wir in der eingebauten Vorschau, alles andere im Browser */
export function isLocalUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?(\/|$)/i.test(url)
}
