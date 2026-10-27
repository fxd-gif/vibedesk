// Gehirn beim ersten Mal füllen, ohne Claude: CLAUDE.md, AGENTS.md und README werden zu Startnotizen.
// Abschnitte (## …) werden einzelne Notizen, damit Claude später gezielt findet, was es braucht.
import { cleanTitle } from './brain'
import { t } from './i18n'

/** Dateien im Projektordner, die als Startwissen taugen (in dieser Reihenfolge) */
export const IMPORT_FILES = ['CLAUDE.md', '.claude/CLAUDE.md', 'AGENTS.md', 'README.md']
/** größere Dateien liest VibeDesk nicht */
export const IMPORT_FILE_MAX = 200 * 1024
/** höchstens so viele Notizen – der Rest wächst mit Claude */
export const IMPORT_NOTES_MAX = 12
/** pro Notiz – lange Abschnitte werden gekürzt */
export const IMPORT_BODY_MAX = 1500
/** Aus der README nur Abschnitte, die beim Bauen helfen */
const README_USEFUL = /install|setup|einricht|getting started|loslegen|entwickl|develop|build|bauen|architekt|architecture|aufbau|struktur|structure|konvention|convention|contribut|mitmachen|test|deploy|konfig|config|usage|verwendung|befehle|commands|scripts/i

export interface ImportSource {
  /** wie in IMPORT_FILES */
  name: string
  text: string
}

export interface ImportNote {
  title: string
  type: 'module' | 'convention' | 'fact'
  body: string
  tags: string[]
}

interface Section {
  heading: string
  body: string
}

/** Text in Einleitung (vor dem ersten ##) und ##-Abschnitte zerlegen; Code-Blöcke bleiben unangetastet */
export function sections(md: string): { intro: string; parts: Section[] } {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const parts: Section[] = []
  let intro: string[] = []
  let cur: Section | null = null
  let buf: string[] = []
  let fence = false
  const flush = (): void => {
    if (cur) parts.push({ heading: cur.heading, body: buf.join('\n').trim() })
    buf = []
  }
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence
    const h = !fence && /^##\s+(.+?)\s*#*\s*$/.exec(line)
    if (h) {
      if (!cur) intro = buf
      flush()
      cur = { heading: h[1], body: '' }
      continue
    }
    buf.push(line)
  }
  if (!cur) intro = buf
  else flush()
  return { intro: intro.join('\n').trim(), parts: parts.filter((p) => p.body) }
}

/** Markdown-Deko aus Überschriften entfernen (Emojis, Links, Hervorhebung) */
function headingTitle(h: string): string {
  return cleanTitle(
    h
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`~]/g, '')
      .replace(/^[^\p{L}\p{N}]+/u, '')
  )
}

/** HTML-Blöcke (Banner, Badges) und Bilder fliegen raus – im Gehirn zählt Text */
function plain(md: string): string {
  return md
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(div|p|picture|table)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/^\s*\[!\[.*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function clip(s: string): string {
  if (s.length <= IMPORT_BODY_MAX) return s
  const cut = s.slice(0, IMPORT_BODY_MAX)
  const nl = cut.lastIndexOf('\n')
  return (nl > IMPORT_BODY_MAX * 0.6 ? cut.slice(0, nl) : cut).trimEnd() + '\n\n…'
}

const source = (name: string): string => '\n\n' + t('Quelle: {file} (beim ersten Öffnen übernommen)', { file: name })

/** Startnotizen aus den gefundenen Dateien; schon vorhandene Titel bleiben unberührt */
export function importNotes(sources: ImportSource[], existing: string[] = []): ImportNote[] {
  const taken = new Set(existing.map((x) => x.toLowerCase()))
  const out: ImportNote[] = []
  const add = (n: ImportNote): void => {
    const title = cleanTitle(n.title)
    if (!title || taken.has(title.toLowerCase()) || out.length >= IMPORT_NOTES_MAX) return
    taken.add(title.toLowerCase())
    out.push({ ...n, title })
  }
  for (const src of sources) {
    const isReadme = /readme\.md$/i.test(src.name)
    const tag = isReadme ? 'readme' : 'claude-md'
    const { intro, parts } = sections(src.text)
    if (isReadme) {
      const overview = plain(intro.replace(/^#\s+.*$/m, ''))
      const useful = parts.filter((p) => README_USEFUL.test(p.heading)).slice(0, 5)
      const titles = useful.map((p) => headingTitle(p.heading)).filter(Boolean)
      if (overview || titles.length) {
        const see = titles.length ? '\n\n' + t('Siehe auch: {links}', { links: titles.map((x) => `[[${x}]]`).join(', ') }) : ''
        add({ title: t('Projekt-Überblick'), type: 'module', body: clip(overview || t('(Die README hat keine Einleitung.)')) + see + source(src.name), tags: ['import', tag] })
      }
      for (const p of useful) add({ title: headingTitle(p.heading), type: 'fact', body: clip(plain(p.body)) + source(src.name), tags: ['import', tag] })
    } else {
      const file = src.name.replace(/^.*\//, '')
      if (!parts.length) {
        const body = plain(src.text)
        if (body) add({ title: t('Regeln aus {file}', { file }), type: 'convention', body: clip(body) + source(src.name), tags: ['import', tag] })
        continue
      }
      if (intro && plain(intro.replace(/^#\s+.*$/m, ''))) add({ title: t('Regeln aus {file}', { file }), type: 'convention', body: clip(plain(intro.replace(/^#\s+.*$/m, ''))) + source(src.name), tags: ['import', tag] })
      for (const p of parts) add({ title: headingTitle(p.heading), type: 'convention', body: clip(plain(p.body)) + source(src.name), tags: ['import', tag] })
    }
  }
  return out
}
