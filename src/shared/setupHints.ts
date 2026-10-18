// Reine Logik für die Einrichtung: Anmeldung bei Claude erkennen, Fehlschläge erklären, Texte fürs Terminal.
import { getLang, t } from './i18n'

/** Seiten, auf die die Knöpfe „Anleitung“ und „Mehr zur Anmeldung“ verweisen */
export const SETUP_LINKS = {
  get node(): string {
    return `https://nodejs.org/${getLang()}/download`
  },
  get claude(): string {
    return `https://code.claude.com/docs/${getLang()}/troubleshoot-install`
  },
  get login(): string {
    return `https://code.claude.com/docs/${getLang()}/authentication`
  }
}

const filled = (v: unknown): boolean => typeof v === 'string' && v.trim().length > 0

/**
 * Ist Claude Code angemeldet? Schaut nur auf das, was Claude Code selbst ablegt – kein Netz, kein Kontingent.
 * - Umgebung: ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN, ANTHROPIC_AUTH_TOKEN oder Bedrock/Vertex/Foundry
 * - .credentials.json: { claudeAiOauth: { accessToken | refreshToken } } (Pro/Max-Anmeldung über den Browser)
 * - .claude.json: { oauthAccount: { accountUuid } } oder { primaryApiKey } (Console-Schlüssel)
 */
export function hasClaudeLogin(input: { env: Record<string, string | undefined>; credentials: unknown; config: unknown }): boolean {
  const { env } = input
  if (['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_AUTH_TOKEN'].some((k) => filled(env[k]))) return true
  if (['CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY'].some((k) => env[k] === '1' || env[k] === 'true')) return true
  const cred = input.credentials as { claudeAiOauth?: { accessToken?: unknown; refreshToken?: unknown } } | null
  if (cred && typeof cred === 'object' && cred.claudeAiOauth && (filled(cred.claudeAiOauth.accessToken) || filled(cred.claudeAiOauth.refreshToken))) return true
  const cfg = input.config as { oauthAccount?: { accountUuid?: unknown; emailAddress?: unknown }; primaryApiKey?: unknown } | null
  if (cfg && typeof cfg === 'object') {
    if (cfg.oauthAccount && (filled(cfg.oauthAccount.accountUuid) || filled(cfg.oauthAccount.emailAddress))) return true
    if (filled(cfg.primaryApiKey)) return true
  }
  return false
}

/** Ordner, in dem Claude Code seine Anmeldung ablegt, und die Datei .claude.json (beides hängt von CLAUDE_CONFIG_DIR ab) */
export function claudeLoginFiles(env: Record<string, string | undefined>, home: string, join: (...p: string[]) => string): { credentials: string; config: string } {
  const dir = env.CLAUDE_CONFIG_DIR?.trim()
  if (dir) return { credentials: join(dir, '.credentials.json'), config: join(dir, '.claude.json') }
  return { credentials: join(home, '.claude', '.credentials.json'), config: join(home, '.claude.json') }
}

/** Letzte Zeile, die installTool bei einem Fehlschlag ins Protokoll schreibt */
export const EXIT_MARK = 'Installer beendet mit Code '

/** Ein Satz, warum die Installation nicht geklappt hat – null, wenn die Ursache unklar ist. */
export function installFailReason(log: string[]): string | null {
  const text = log.join('\n')
  if (/spawn winget ENOENT/i.test(text))
    return t('Der Windows-Paketmanager (winget) fehlt auf diesem Rechner – lade Node.js über die Download-Seite.')
  if (/0x800704c7|2147943623|\b1223\b|\b1602\b|cancel+ed|abgebrochen|denied|verweigert/i.test(text))
    return t('Die Installation wurde abgebrochen – vermutlich wurde die Administrator-Abfrage nicht bestätigt. Versuch es nochmal und klick dort auf „Ja“.')
  if (/0x80072ee7|0x80072efd|0x80072f8f|not be resolved|could not resolve|nicht aufgelöst|remote name|Remotename|unable to connect|Verbindung (mit|zum|konnte)|network|Netzwerk|timed? ?out|Zeitüberschreitung|offline|internet/i.test(text))
    return t('Es gab keine Verbindung zum Internet. Prüf deine Verbindung und versuch es nochmal.')
  if (/ExecutionPolicy|Ausführungsrichtlinie|running scripts is disabled|Ausführung von Skripts/i.test(text))
    return t('Windows hat das Installationsskript blockiert. Folge der Anleitung, um Claude Code von Hand zu installieren.')
  return null
}

/** Text, wenn eine Claude-Session endet */
export function sessionExitText(code: number): string {
  return code === 0
    ? t('Claude wurde beendet.')
    : t('Claude ist unerwartet beendet (Code {code}). Neu starten – oder prüf unter Einrichtung, ob Claude Code installiert und angemeldet ist.', { code })
}

/** Fehlermeldung beim Sessionstart, wenn Claude Code fehlt – der Renderer erkennt sie und bietet die Einrichtung an */
export const claudeMissingMessage = (): string =>
  t('Claude Code ist auf diesem Rechner noch nicht installiert. Du kannst es in der Einrichtung mit einem Klick nachholen.')
