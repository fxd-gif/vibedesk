// Weitere Agenten neben Claude Code (Beta): Namen, Befehle und Installationshinweise für Gemini CLI und Codex.
import { t } from './i18n'
import type { AgentKind } from './types'

export type OtherAgent = Exclude<AgentKind, 'claude'>

export const AGENT_KINDS: readonly AgentKind[] = ['claude', 'gemini', 'codex']
export const OTHER_AGENTS: readonly OtherAgent[] = ['gemini', 'codex']

/** Alte Sessions ohne Angabe sind Claude */
export const agentOf = (s: { agent?: AgentKind } | null | undefined): AgentKind => s?.agent ?? 'claude'
export const isClaude = (s: { agent?: AgentKind } | null | undefined): boolean => agentOf(s) === 'claude'

/** Eingabe aus dem Renderer prüfen – alles Unbekannte bleibt Claude */
export const parseAgent = (x: unknown): AgentKind => (x === 'gemini' || x === 'codex' ? x : 'claude')

const NAMES: Record<AgentKind, string> = { claude: 'Claude Code', gemini: 'Gemini CLI', codex: 'Codex' }
export const agentName = (a: AgentKind): string => NAMES[a]

/** Beschriftung in der Startauswahl: „Claude Code (Standard)“, „Gemini CLI (Beta)“ */
export const agentChoiceLabel = (a: AgentKind): string => (a === 'claude' ? t('{name} (Standard)', { name: NAMES.claude }) : `${NAMES[a]} (Beta)`)

/** Befehl ohne Überschreibung – nur dann prüft VibeDesk, ob er installiert ist */
export const AGENT_DEFAULT_CMD: Record<AgentKind, string> = { claude: 'claude', gemini: 'gemini', codex: 'codex' }

/** Befehl im Terminal – für Tests per Umgebung überschreibbar */
export function agentCommand(a: AgentKind, env: Record<string, string | undefined>): string {
  const own = a === 'gemini' ? env.VIBEDESK_GEMINI_CMD : a === 'codex' ? env.VIBEDESK_CODEX_CMD : env.VIBEDESK_CLAUDE_CMD
  return own || AGENT_DEFAULT_CMD[a]
}

export const AGENT_PACKAGES: Record<OtherAgent, string> = { gemini: '@google/gemini-cli', codex: '@openai/codex' }
export const AGENT_LINKS: Record<OtherAgent, string> = { gemini: 'https://github.com/google-gemini/gemini-cli', codex: 'https://github.com/openai/codex' }
export const agentInstallCommand = (a: OtherAgent): string => `npm install -g ${AGENT_PACKAGES[a]}`

/** Fehlermeldung beim Start, wenn der Befehl fehlt – der Renderer erkennt sie und bietet Anleitung und Befehl an */
export const agentMissingMessage = (a: OtherAgent): string =>
  t('{name} ist auf diesem Rechner noch nicht installiert. Installiere es einmal in einer PowerShell (Node.js nötig) mit: {command}', { name: NAMES[a], command: agentInstallCommand(a) })

/** Welcher Agent fehlt laut Fehlermeldung? */
export const missingAgentIn = (msg: string): OtherAgent | null => OTHER_AGENTS.find((a) => msg.includes(agentMissingMessage(a))) ?? null
