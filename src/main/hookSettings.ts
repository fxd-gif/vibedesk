export const HOOK_EVENTS = [
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'Notification',
  'Stop',
  'SubagentStart',
  'SubagentStop',
  'SessionStart',
  'SessionEnd',
  'PermissionRequest',
  'StopFailure'
] as const

const TOOL_EVENTS = new Set<string>(['PreToolUse', 'PostToolUse', 'PermissionRequest'])

/** Freigaben warten auf eine Antwort in VibeDesk/auf dem Handy – der Forwarder gibt kurz vorher selbst auf */
const PERMISSION_TIMEOUT_S = 600

/**
 * Hook-Befehl, der in bash, cmd und PowerShell gleich funktioniert. Claude Code nutzt unter Windows je nach
 * Installation bash oder PowerShell – und PowerShell versteht zwei Strings hintereinander ("node" "datei")
 * nicht als Aufruf. Das Programm steht deshalb unquotiert vorn. Ein Programmpfad mit Leerzeichen bräuchte
 * in PowerShell ein & davor (das bash nicht kennt) – dann lieber node aus dem PATH.
 */
export function hookCommand(nodeExe: string, scriptPath: string): string {
  const exe = /^[\w.:\\/-]+$/.test(nodeExe) ? nodeExe : 'node'
  return `${exe} "${scriptPath}"`
}

/** Die Rust-Brücke (native/bridge): ersetzt node mit hook-forwarder.js, statusline.js und brain-mcp.js */
export interface NativeBridge {
  exe: string
  version: string
}

/**
 * Aufruf der Rust-Brücke für Hooks und Statuszeile. Der Pfad steht unquotiert vorn (siehe hookCommand) und mit
 * Schrägstrichen – Backslashes ohne Anführungszeichen schluckt bash. Enthält er Zeichen, die eine Shell
 * auseinandernehmen würde (z. B. Leerzeichen im Benutzernamen), gibt es null und der JS-Weg bleibt.
 */
export function nativeCommand(exe: string, mode: 'hook' | 'statusline'): string | null {
  const p = exe.replace(/\\/g, '/')
  return /^[\w.:/-]+$/.test(p) ? `${p} ${mode}` : null
}

/** Laufen Hooks und Statuszeile wirklich über die Rust-Brücke? Nur dann braucht VibeDesk kein Node.js auf dem System. */
export const bridgeRunsHooks = (b: NativeBridge | null | undefined): boolean => !!b && nativeCommand(b.exe, 'hook') !== null

/**
 * Ab dieser Claude-Code-Version kennen Command-Hooks das Feld `args` (Exec-Form, CHANGELOG 2.1.139): Claude Code
 * startet `command` dann direkt als Programm, ohne Shell. Unter Windows spart das pro Hook die Git-Bash (~50 ms)
 * oder – ohne Git für Windows – PowerShell (~300 ms), die Claude Code sonst davorschaltet (native/README.md).
 * Ältere Versionen kennen `args` nicht – dort
 * liefe das Programm ohne Argument und der Hook wäre wirkungslos. Darum nur bei sicher bekannter Version.
 */
export const EXEC_HOOKS_SINCE = '2.1.139'

/** Versteht diese Claude-Code-Version die Exec-Form? Unbekannt oder unlesbar → nein (Shell-Form wie bisher) */
export function supportsExecHooks(version: string | null | undefined): boolean {
  const v = /^(\d+)\.(\d+)\.(\d+)/.exec(version?.trim() ?? '')
  if (!v) return false
  const min = EXEC_HOOKS_SINCE.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const d = Number(v[i + 1]) - min[i]
    if (d !== 0) return d > 0
  }
  return true
}

export const BRAIN_SERVER = 'vibedesk-brain'

/**
 * Claude-Code-Settings, deren Hooks jedes Event an den VibeDesk-Forwarder geben.
 * statusLine: VibeDesk-Statuszeile (liest die Abo-Limits); padding der eigenen Statuszeile bleibt erhalten.
 * native: Rust-Brücke statt node, wo ihr Pfad sich sicher in eine Befehlszeile schreiben lässt.
 * claudeVersion: Version des Claude Code, das die Session startet. Ab EXEC_HOOKS_SINCE laufen die Hooks in
 * Exec-Form ohne Shell – dann geht die Brücke auch mit Leerzeichen im Pfad. Die Statuszeile kennt keine
 * Exec-Form und bleibt beim Shell-Befehl.
 */
export function buildHookSettings(
  nodeExe: string,
  forwarderPath: string,
  opts: { brain?: boolean; statusLine?: { path: string; padding?: number }; native?: NativeBridge | null; claudeVersion?: string | null } = {}
): object {
  const native = (mode: 'hook' | 'statusline'): string | null => (opts.native ? nativeCommand(opts.native.exe, mode) : null)
  const run = supportsExecHooks(opts.claudeVersion)
    ? opts.native
      ? { command: opts.native.exe, args: ['hook'] }
      : { command: nodeExe, args: [forwarderPath] }
    : { command: native('hook') ?? hookCommand(nodeExe, forwarderPath) }
  const hook = { type: 'command', ...run, timeout: 5 }
  const hooks = Object.fromEntries(
    HOOK_EVENTS.map((e) => {
      const h = e === 'PermissionRequest' ? { ...hook, timeout: PERMISSION_TIMEOUT_S } : hook
      return [e, [TOOL_EVENTS.has(e) ? { matcher: '*', hooks: [h] } : { hooks: [h] }]]
    })
  )
  const statusLine = opts.statusLine
    ? {
        statusLine: {
          type: 'command',
          command: native('statusline') ?? hookCommand(nodeExe, opts.statusLine.path),
          ...(opts.statusLine.padding !== undefined ? { padding: opts.statusLine.padding } : {})
        }
      }
    : {}
  // Gehirn-Werkzeuge ohne Rückfrage – sie lesen und schreiben nur Notizen in .vibedesk/brain
  return opts.brain ? { hooks, ...statusLine, permissions: { allow: [`mcp__${BRAIN_SERVER}`] } } : { hooks, ...statusLine }
}

/** Eigene Statuszeile aus den Claude-Code-Settings (Projekt lokal > Projekt > Nutzer) – nur der Typ „command“ */
export function userStatusLine(files: { read(): string | null }[]): { command: string; padding?: number } | null {
  for (const f of files) {
    let j: unknown
    try {
      const raw = f.read()
      if (!raw) continue
      j = JSON.parse(raw)
    } catch {
      continue
    }
    const sl = (j as { statusLine?: { type?: unknown; command?: unknown; padding?: unknown } } | null)?.statusLine
    if (!sl) continue
    if (sl.type !== 'command' || typeof sl.command !== 'string' || !sl.command.trim()) return null
    return { command: sl.command, ...(typeof sl.padding === 'number' ? { padding: sl.padding } : {}) }
  }
  return null
}

/**
 * MCP-Konfiguration für --mcp-config: startet den Gehirn-Server dieser Session. Mit der Rust-Brücke direkt als
 * Programm mit Argument – ohne Shell, darum sind hier auch Leerzeichen im Pfad kein Problem.
 */
export function buildBrainMcpConfig(
  nodeExe: string,
  mcpPath: string,
  env: { sessionId: string; port: number; token: string; endpoint?: string; brain?: boolean },
  native?: NativeBridge | null
): object {
  return {
    mcpServers: {
      [BRAIN_SERVER]: {
        type: 'stdio',
        command: native ? native.exe : nodeExe,
        args: native ? ['mcp'] : [mcpPath],
        env: {
          VIBEDESK_SESSION_ID: env.sessionId,
          VIBEDESK_PORT: String(env.port),
          VIBEDESK_TOKEN: env.token,
          // Gehirn aus: der Server bietet nur die Desktop-Werkzeuge an
          VIBEDESK_BRAIN: env.brain === false ? '0' : '1',
          // aktueller Port + Token, falls VibeDesk neu startet, während die Session weiterläuft
          ...(env.endpoint ? { VIBEDESK_ENDPOINT: env.endpoint } : {})
        }
      }
    }
  }
}
