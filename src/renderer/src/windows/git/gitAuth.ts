// GitHub-Anmeldung über gh: Code anzeigen, Browser öffnet sich, danach ist Push/Pull eingerichtet.
import { create } from 'zustand'
import { api, errorText } from '../../api'
import { AUTH_MARK, type GitTools } from '../../../../shared/git'
import { alert, confirm } from '../../store/dialogStore'
import { inform } from '../../store/notifyStore'
import { t } from '../../../../shared/i18n'

interface AuthState {
  tools: GitTools | null
  /** läuft gerade eine Anmeldung? Code + Link, sobald gh sie liefert */
  login: { code: string | null; url: string } | null
  install: { tool: 'git' | 'gh'; lines: string[] } | null
}

export const useGitAuth = create<AuthState>(() => ({ tools: null, login: null, install: null }))

export async function refreshTools(): Promise<GitTools> {
  const t = await api.git.tools()
  useGitAuth.setState({ tools: t })
  return t
}

let wired = false
function wire(): void {
  if (wired) return
  wired = true
  api.on.gitLoginCode((code, url) => useGitAuth.setState({ login: { code, url } }))
  api.on.gitInstallLog((tool, line) =>
    useGitAuth.setState((s) => (s.install?.tool === tool ? { install: { tool, lines: [...s.install.lines, line].slice(-6) } } : s))
  )
}

export async function githubLogin(): Promise<boolean> {
  wire()
  useGitAuth.setState({ login: { code: null, url: 'https://github.com/login/device' } })
  try {
    await api.git.login()
    const tools = await refreshTools()
    inform(t('Bei GitHub angemeldet'), tools.ghUser ? t('als {user} – Push und Pull nutzen jetzt diese Anmeldung.', { user: tools.ghUser }) : undefined)
    return true
  } catch (err) {
    const msg = errorText(err)
    if (!/abgebrochen|cancel/i.test(msg)) await alert(t('Anmeldung fehlgeschlagen'), msg)
    return false
  } finally {
    useGitAuth.setState({ login: null })
  }
}

export function cancelLogin(): void {
  api.git.cancelLogin()
}

export async function installTool(tool: 'git' | 'gh'): Promise<boolean> {
  wire()
  useGitAuth.setState({ install: { tool, lines: [] } })
  try {
    const ok = await api.git.install(tool)
    await refreshTools()
    if (!ok) await alert(t('{tool} konnte nicht installiert werden', { tool: tool === 'git' ? 'Git' : 'GitHub CLI' }), useGitAuth.getState().install?.lines.slice(-3).join('\n'))
    return ok
  } finally {
    useGitAuth.setState({ install: null })
  }
}

/**
 * Führt eine Git-Aktion aus. Scheitert sie an der Anmeldung, bietet VibeDesk den GitHub-Login an
 * (und installiert gh vorher auf Wunsch) und versucht es danach noch einmal.
 */
export async function withAuth<T>(title: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn()
  } catch (err) {
    const msg = errorText(err)
    if (!msg.startsWith(AUTH_MARK)) {
      await alert(title, msg)
      return undefined
    }
    const tools = useGitAuth.getState().tools ?? (await refreshTools())
    if (tools.gh === 'missing') {
      if (!tools.winget || !(await confirm({ title: t('GitHub-Anmeldung nötig'), message: t('Für Push und Pull zu GitHub braucht VibeDesk die GitHub-CLI (gh). Jetzt installieren?'), confirmLabel: t('Installieren') }))) return undefined
      if (!(await installTool('gh'))) return undefined
      await refreshTools()
    }
    if (!(await confirm({ title: t('Bei GitHub anmelden?'), message: `${msg.slice(AUTH_MARK.length)}\n\n${t('GitHub braucht eine Anmeldung. Dein Browser öffnet sich, du gibst einen Code ein – fertig.')}`, confirmLabel: t('Anmelden') })))
      return undefined
    if (!(await githubLogin())) return undefined
    try {
      return await fn()
    } catch (again) {
      await alert(title, errorText(again).replace(AUTH_MARK, ''))
      return undefined
    }
  }
}
