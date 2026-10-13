import type { Project } from '../../../shared/types'

const RECENT = 4

/** zuletzt geöffnete zuerst, nie geöffnete nach Anlagedatum */
export function recentProjects(list: Project[], n = RECENT): Project[] {
  return list
    .filter((p) => !p.missing)
    .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0) || b.createdAt - a.createdAt)
    .slice(0, n)
}
