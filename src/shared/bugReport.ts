// „Fehler melden“: vorausgefülltes GitHub-Issue – der Nutzer sieht alles, bevor er es abschickt.

export const REPO_URL = 'https://github.com/fxd-gif/vibedesk'

export interface BugInfo {
  version: string
  os: string
  claude: string | null
  summary?: string
  log: string
}

/** GitHub nimmt keine beliebig langen URLs – das Protokoll wird vom Anfang her gekürzt */
const MAX_LOG = 1500

/** Benutzername in Pfaden unkenntlich machen (C:\Users\tom\… → C:\Users\…\…) */
export function scrubPaths(text: string): string {
  return text.replace(/([A-Za-z]:[\\/]+Users[\\/]+)[^\\/\r\n"']+/gi, '$1…')
}

export function bugReportUrl(i: BugInfo): string {
  const log = scrubPaths(i.log).slice(-MAX_LOG).trim()
  const body = [
    '**Was ist passiert?**',
    i.summary ? scrubPaths(i.summary) : '',
    '',
    '**Was hast du erwartet?**',
    '',
    '',
    '---',
    `VibeDesk ${i.version} · ${i.os} · Claude Code ${i.claude ?? 'nicht gefunden'}`,
    log ? '\n<details><summary>Fehlerprotokoll</summary>\n\n```\n' + log + '\n```\n</details>' : ''
  ].join('\n')
  const title = i.summary ? scrubPaths(i.summary).slice(0, 80) : ''
  return `${REPO_URL}/issues/new?labels=bug&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`
}
