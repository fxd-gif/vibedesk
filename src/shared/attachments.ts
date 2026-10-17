// Anhänge im Claude-Terminal: welche Dateien eingefügt, abgeschickt und von Claude gelesen wurden.

export type AttachStatus = 'pending' | 'sent' | 'read'

export interface Attachment {
  path: string
  name: string
  image: boolean
  size?: number
  status: AttachStatus
  addedAt: number
}

export const ATTACH_MAX = 50
const IMAGE_RE = /\.(png|jpe?g|gif|webp)$/i

/** Vergleichbare Form eines Windows-Pfads: Kleinbuchstaben, Schrägstriche vereinheitlicht */
export const normPath = (p: string): string => p.replace(/^"|"$/g, '').replace(/\\/g, '/').toLowerCase()

export const baseName = (p: string): string => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p

export const isImagePath = (p: string): boolean => IMAGE_RE.test(p)

/** Neue Dateien vorn anhängen; schon bekannte rutschen nach vorn und gelten wieder als „eingefügt“ */
export function addAttachments(list: Attachment[], files: { path: string; size?: number }[], now: number): Attachment[] {
  const fresh = files
    .filter((f) => f.path)
    .map<Attachment>((f) => ({ path: f.path, name: baseName(f.path), image: isImagePath(f.path), size: f.size, status: 'pending', addedAt: now }))
  const keys = new Set(fresh.map((f) => normPath(f.path)))
  return [...fresh, ...list.filter((a) => !keys.has(normPath(a.path)))].slice(0, ATTACH_MAX)
}

/**
 * Prompt wurde abgeschickt: Was darin vorkommt, gilt als gesendet. Bilder ersetzt Claude Code
 * beim Einfügen durch „[Image #1]“ – pro Platzhalter zählt das älteste noch offene Bild als gesendet.
 */
export function markPromptSent(list: Attachment[], prompt: string): Attachment[] {
  const text = normPath(prompt)
  const named = (a: Attachment): boolean => a.status === 'pending' && text.includes(normPath(a.path))
  const images = (prompt.match(/\[Image #\d+\]/g) ?? []).length
  // die Liste ist neu → alt sortiert, die ältesten offenen Bilder stehen hinten
  const viaPlaceholder = new Set(
    list
      .filter((a) => a.status === 'pending' && a.image && !named(a))
      .reverse()
      .slice(0, images)
      .map((a) => a.path)
  )
  return list.map((a) => (named(a) || viaPlaceholder.has(a.path) ? { ...a, status: 'sent' } : a))
}

/** Pfade, die ein Werkzeug-Aufruf von Claude anfasst (Read, Glob, Grep, Bash …) */
export function toolPaths(input: unknown): string[] {
  if (!input || typeof input !== 'object') return []
  const i = input as Record<string, unknown>
  return ['file_path', 'path', 'notebook_path', 'command', 'pattern'].map((k) => i[k]).filter((v): v is string => typeof v === 'string')
}

/** Claude hat eine angehängte Datei geöffnet – dann ist sie sicher angekommen */
export function markToolUse(list: Attachment[], toolInput: unknown): Attachment[] {
  const touched = toolPaths(toolInput).map(normPath)
  if (!touched.length) return list
  let changed = false
  const next = list.map((a) => {
    if (a.status === 'read') return a
    const p = normPath(a.path)
    if (!touched.some((t) => t === p || t.includes(p))) return a
    changed = true
    return { ...a, status: 'read' as const }
  })
  return changed ? next : list
}

export function fmtSize(bytes?: number): string {
  if (bytes === undefined) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}
