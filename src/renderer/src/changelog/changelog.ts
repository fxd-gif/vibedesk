export interface ChangelogSection {
  title: string
  items: string[]
}

export interface ChangelogEntry {
  version: string
  sections: ChangelogSection[]
}

export const UNRELEASED = 'Unveröffentlicht'

/** Liest CHANGELOG.md: „## 1.2.3“ je Version, „### Neu|Verbessert|Entfernt“ je Abschnitt, „- “ je Punkt. */
export function parseChangelog(md: string): ChangelogEntry[] {
  const out: ChangelogEntry[] = []
  let entry: ChangelogEntry | null = null
  let section: ChangelogSection | null = null
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd()
    const v = /^##\s+\[?v?([^\]\s]+)\]?/.exec(line)
    if (v && !line.startsWith('###')) {
      entry = { version: v[1], sections: [] }
      section = null
      out.push(entry)
      continue
    }
    const h = /^###\s+(.+)/.exec(line)
    if (h && entry) {
      section = { title: h[1].trim(), items: [] }
      entry.sections.push(section)
      continue
    }
    const item = /^\s*[-*]\s+(.+)/.exec(line)
    if (item && section) {
      section.items.push(item[1].trim())
      continue
    }
    // eingerückte Fortsetzungszeile gehört zum letzten Punkt
    if (section?.items.length && /^\s{2,}\S/.test(raw)) section.items[section.items.length - 1] += ' ' + raw.trim()
  }
  return out.filter((e) => e.sections.some((s) => s.items.length))
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0)
  const pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d
  }
  return 0
}

/**
 * Welche Einträge nach einem Update zeigen? Neueste zuerst.
 * lastSeen leer = Version vor Einführung des Changelogs → nur die aktuelle Version.
 */
export function entriesSince(all: ChangelogEntry[], lastSeen: string, current: string): ChangelogEntry[] {
  return all
    .filter((e) => e.version !== UNRELEASED && /^\d/.test(e.version))
    .filter((e) => compareVersions(e.version, current) <= 0 && (lastSeen ? compareVersions(e.version, lastSeen) > 0 : compareVersions(e.version, current) === 0))
    .sort((a, b) => compareVersions(b.version, a.version))
}

/** Beim Start: Changelog zeigen? (Neuinstallation → nein, Update → ja) */
export function shouldShowChangelog(lastSeen: string, current: string, onboarded: boolean): boolean {
  if (!current) return false
  if (!lastSeen) return onboarded // bestehende Installation vor diesem Feature
  return compareVersions(current, lastSeen) > 0
}
