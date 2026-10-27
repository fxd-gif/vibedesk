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

/**
 * Private Angaben unkenntlich machen, bevor etwas in ein öffentliches Issue geht: von Pfaden bleibt nur der
 * Dateiname (Benutzer-, Projekt- und Firmennamen stecken in den Ordnern), Zugangsdaten in URLs und E-Mail-Adressen fliegen raus.
 */
export function scrubPaths(text: string): string {
  return (
    text
      // C:\Users\tom\Projekte\kunde\x.ts → C:\…\x.ts (auch mit /)
      .replace(/(?<![\w])([A-Za-z]:)([\\/])+(?:[^\\/\r\n"'<>|:*?]+[\\/]+)+/g, (_m, drive: string, sep: string) => `${drive}${sep}…${sep}`)
      // \\server\freigabe\… → \\…\
      .replace(/\\\\[^\\\s"']+(?:\\[^\\\r\n"'<>|:*?]+)*\\/g, '\\\\…\\')
      // /c/Users/tom/… (Git-Bash) und /home/tom/… → /…/
      .replace(/(^|[\s"'(=])\/(?:[a-z]|home|Users|mnt)\/(?:[^/\s"']+\/)+/g, '$1/…/')
      // https://user:token@host → https://…@host
      .replace(/([a-z][\w+.-]*:\/\/)[^@\s/]+@/gi, '$1…@')
      .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '…@…')
  )
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
