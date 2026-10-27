// Hotspots im Gehirn: welche Dateien laut git log am häufigsten geändert werden – reine Logik (Zählen, Farbskala, Graph).
import { fileId, type BrainGraph, type GraphNode } from './brain'

export interface Hotspot {
  path: string
  commits: number
}

/** Zeitraum und Obergrenze für git log – das Kleinere gewinnt */
export const HOTSPOT_DAYS = 90
export const HOTSPOT_MAX_COMMITS = 500
/** so viele Dateien liefert der Main-Prozess */
export const HOTSPOT_TOP = 60
/** Trenner vor jedem Commit in der git-log-Ausgabe (--format=%x01) */
export const COMMIT_MARK = '\x01'

/** Argumente für git log: Dateinamen je Commit, NUL-getrennt, relativ zum Projektordner */
export const hotspotArgs = (): string[] => [
  '-c',
  'core.quotepath=off',
  'log',
  `--since=${HOTSPOT_DAYS}.days.ago`,
  `--max-count=${HOTSPOT_MAX_COMMITS}`,
  '--no-merges',
  '--relative',
  '--name-only',
  '-z',
  '--format=%x01'
]

// Lockfiles ändern sich ständig, Wissen steckt dort keins
const NOISE = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|composer\.lock|Gemfile\.lock|go\.sum|uv\.lock)$/i

/** git-log-Ausgabe (hotspotArgs) → Commits je Datei; jede Datei zählt pro Commit einmal */
export function countCommits(out: string): Map<string, number> {
  const counts = new Map<string, number>()
  let seen = new Set<string>()
  for (const raw of out.split('\0')) {
    let tok = raw.replace(/^[\r\n]+/, '')
    // Commit-Marke – je nach git-Version auch direkt vor dem ersten Dateinamen
    if (tok.startsWith(COMMIT_MARK)) {
      seen = new Set()
      tok = tok.slice(1).replace(/^[\r\n]+/, '')
    }
    const f = tok.replace(/\\/g, '/')
    if (!f || seen.has(f) || NOISE.test(f)) continue
    seen.add(f)
    counts.set(f, (counts.get(f) ?? 0) + 1)
  }
  return counts
}

/** Die meistgeänderten Dateien, absteigend (bei Gleichstand alphabetisch) */
export function topHotspots(counts: Map<string, number>, n = HOTSPOT_TOP, keep: (path: string) => boolean = () => true): Hotspot[] {
  const out: Hotspot[] = []
  const sorted = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  for (const [path, commits] of sorted) {
    if (out.length >= n) break
    if (keep(path)) out.push({ path, commits })
  }
  return out
}

/** 0 … 1: wie „heiß“ eine Datei im Vergleich zur heißesten ist (logarithmisch, damit die Skala ruhig bleibt) */
export function heat(commits: number, max: number): number {
  if (commits <= 0 || max <= 0) return 0
  if (max <= 1) return 1
  return Math.min(1, Math.log1p(commits) / Math.log1p(max))
}

const COOL = [111, 143, 179] // #6f8fb3
const WARM = [232, 163, 90] // #e8a35a

/** Farbe für eine Hitze 0 … 1: von kühlem Blaugrau zu warmem Orange */
export function heatColor(h: number): string {
  const x = Math.max(0, Math.min(1, h))
  const [r, g, b] = COOL.map((c, i) => Math.round(c + (WARM[i] - c) * x))
  const a = (0.6 + 0.35 * x).toFixed(2)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

/** Datei-Knoten mit Hotspot-Angaben */
export interface HotNode extends GraphNode {
  commits?: number
  heat?: number
  /** Hotspot, zu dem noch keine Notiz verlinkt */
  unlinked?: boolean
}

export interface HotspotOpts {
  /** so viele Hotspots ohne Notiz kommen höchstens neu in den Graph */
  add?: number
  /** nur die obersten so vielen gelten als markierungswürdige Hotspots */
  mark?: number
  /** ab so vielen Commits ist eine Datei ein Hotspot */
  minCommits?: number
}

/**
 * Graph mit Hotspots anreichern: Datei-Knoten bekommen Commits und Hitze, Hotspots ohne
 * Notiz eine Markierung, und die heißesten davon kommen als Knoten dazu (begrenzt).
 */
export function withHotspots(graph: BrainGraph, hot: Hotspot[], opts: HotspotOpts = {}): BrainGraph {
  const { add = 10, mark = 20, minCommits = 3 } = opts
  if (!hot.length) return graph
  const max = Math.max(...hot.map((h) => h.commits))
  const byPath = new Map(hot.map((h) => [h.path, h.commits]))
  const marked = new Set(
    hot
      .filter((h) => h.commits >= minCommits)
      .slice(0, mark)
      .map((h) => h.path)
  )
  // Dateien, zu denen eine Notiz verlinkt
  const noted = new Set(graph.edges.filter((e) => e.kind === 'file').map((e) => e.target))
  const nodes: HotNode[] = graph.nodes.map((n) => {
    if (n.kind !== 'file') return n
    const commits = byPath.get(n.label)
    if (!commits) return n
    return { ...n, commits, heat: heat(commits, max), unlinked: marked.has(n.label) && !noted.has(n.id) }
  })
  const have = new Set(nodes.map((n) => n.id))
  let added = 0
  for (const h of hot) {
    if (added >= add) break
    const id = fileId(h.path)
    if (have.has(id) || !marked.has(h.path)) continue
    nodes.push({ id, label: h.path, kind: 'file', weight: 1 + Math.log2(1 + h.commits) * 0.6, commits: h.commits, heat: heat(h.commits, max), unlinked: true })
    have.add(id)
    added++
  }
  return { nodes, edges: graph.edges }
}
