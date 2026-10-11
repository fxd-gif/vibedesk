import { execFile } from 'child_process'
import path from 'path'

export const RUN_ALIAS_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\vibe.exe'

/** reg.exe-Aufrufe, die "vibe" im Ausführen-Dialog (Win + R) auf die App zeigen lassen. */
export function runAliasCommands(exePath: string): string[][] {
  return [
    ['add', RUN_ALIAS_KEY, '/ve', '/d', exePath, '/f'],
    ['add', RUN_ALIAS_KEY, '/v', 'Path', '/d', path.dirname(exePath), '/f']
  ]
}

export function registerRunAlias(exePath: string): void {
  for (const args of runAliasCommands(exePath)) execFile('reg', args, { windowsHide: true }, () => {})
}
