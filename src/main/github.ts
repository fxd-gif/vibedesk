import { t } from '../shared/i18n'
import { unzipSync, zipSync } from 'fflate'
import { candidatesFromZip, type SkillCandidate } from './skillStore'

export interface GithubRef {
  owner: string
  repo: string
  ref: string | null
  subdir: string
}

export function parseGithubUrl(url: string): GithubRef | null {
  let u: URL
  try {
    u = new URL(/^https?:\/\//.test(url.trim()) ? url.trim() : 'https://' + url.trim())
  } catch {
    return null
  }
  if (u.hostname !== 'github.com' && u.hostname !== 'www.github.com') return null
  const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  if (parts.length < 2) return null
  const [owner, rawRepo, kind, ref, ...rest] = parts
  const repo = rawRepo.replace(/\.git$/, '')
  if ((kind === 'tree' || kind === 'blob') && ref) {
    let sub = rest.join('/')
    if (kind === 'blob') sub = rest.slice(0, -1).join('/')
    return { owner, repo, ref, subdir: sub }
  }
  return { owner, repo, ref: null, subdir: '' }
}

/** Lädt das Repo-Archiv von GitHub und liefert die darin enthaltenen Skills (optional nur im Unterordner). */
export async function fetchGithubCandidates(url: string, fetchImpl: typeof fetch = fetch): Promise<SkillCandidate[]> {
  const g = parseGithubUrl(url)
  if (!g) throw new Error(t('Keine gültige GitHub-URL (z. B. https://github.com/owner/repo)'))
  const res = await fetchImpl(`https://codeload.github.com/${g.owner}/${g.repo}/zip/${g.ref ?? 'HEAD'}`)
  if (res.status === 404) throw new Error(t('Repository nicht gefunden (oder privat)'))
  if (!res.ok) throw new Error(t('GitHub-Download fehlgeschlagen ({status})', { status: res.status }))
  const zip = new Uint8Array(await res.arrayBuffer())
  return candidatesFromZip(stripRoot(zip, g.subdir))
}


/** GitHub-Archive haben einen Wurzelordner "<repo>-<ref>/" – den und alles außerhalb von subdir wegschneiden. */
function stripRoot(zip: Uint8Array, subdir = ''): Uint8Array {
  const raw = unzipSync(zip)
  const out: Record<string, Uint8Array> = {}
  const prefix = subdir ? subdir.replace(/^\/+|\/+$/g, '') + '/' : ''
  for (const [name, data] of Object.entries(raw)) {
    const rest = name.slice(name.indexOf('/') + 1)
    if (!rest || !rest.startsWith(prefix)) continue
    out[rest] = data
  }
  return zipSync(out, { level: 0 })
}
