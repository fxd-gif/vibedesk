// Dev-Server per Klick: passendes Skript aus package.json und der Paketmanager aus der Lock-Datei.

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

export interface DevScript {
  /** Name des Skripts in package.json */
  script: string
  manager: PackageManager
  /** so zeigen wir es an, z. B. „npm run dev“ */
  command: string
  /**
   * was wirklich in die Shell geht: npm.cmd statt npm – in Windows PowerShell sind .ps1-Skripte (npm.ps1)
   * standardmäßig gesperrt, die .cmd-Varianten laufen immer (auch in cmd)
   */
  shellCommand: string
}

/** Vorrang: dev vor serve vor start (start ist bei manchen Projekten der Produktionsserver – aber besser als nichts) */
const PREFERRED = ['dev', 'serve', 'start']

export function managerFor(files: readonly string[]): PackageManager {
  const has = (f: string): boolean => files.includes(f)
  if (has('pnpm-lock.yaml')) return 'pnpm'
  if (has('yarn.lock')) return 'yarn'
  if (has('bun.lockb') || has('bun.lock')) return 'bun'
  return 'npm'
}

export function runCommand(manager: PackageManager, script: string): string {
  switch (manager) {
    case 'pnpm':
      return `pnpm ${script}`
    case 'yarn':
      return `yarn ${script}`
    case 'bun':
      return `bun run ${script}`
    default:
      return `npm run ${script}`
  }
}

/** Skriptnamen nur aus harmlosen Zeichen – sie landen in einer Shell */
const SAFE = /^[\w:.-]{1,40}$/

export function pickDevScript(pkg: unknown, files: readonly string[]): DevScript | null {
  const scripts = pkg && typeof pkg === 'object' ? (pkg as { scripts?: unknown }).scripts : undefined
  if (!scripts || typeof scripts !== 'object') return null
  const s = scripts as Record<string, unknown>
  const script = PREFERRED.find((n) => typeof s[n] === 'string' && (s[n] as string).trim())
  if (!script || !SAFE.test(script)) return null
  const manager = managerFor(files)
  const command = runCommand(manager, script)
  return { script, manager, command, shellCommand: manager === 'bun' ? command : command.replace(/^(npm|pnpm|yarn) /, '$1.cmd ') }
}
