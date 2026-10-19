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
  'PermissionRequest'
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

export const BRAIN_SERVER = 'vibedesk-brain'

/**
 * Claude-Code-Settings, deren Hooks jedes Event an den VibeDesk-Forwarder geben.
 * statusLine: VibeDesk-Statuszeile (liest die Abo-Limits); padding der eigenen Statuszeile bleibt erhalten.
 */
export function buildHookSettings(nodeExe: string, forwarderPath: string, opts: { brain?: boolean; statusLine?: { path: string; padding?: number } } = {}): object {
  const hook = { type: 'command', command: hookCommand(nodeExe, forwarderPath), timeout: 5 }
  const hooks = Object.fromEntries(
    HOOK_EVENTS.map((e) => {
      const h = e === 'PermissionRequest' ? { ...hook, timeout: PERMISSION_TIMEOUT_S } : hook
      return [e, [TOOL_EVENTS.has(e) ? { matcher: '*', hooks: [h] } : { hooks: [h] }]]
    })
  )
  const statusLine = opts.statusLine
    ? { statusLine: { type: 'command', command: hookCommand(nodeExe, opts.statusLine.path), ...(opts.statusLine.padding !== undefined ? { padding: opts.statusLine.padding } : {}) } }
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

/** MCP-Konfiguration für --mcp-config: startet den Gehirn-Server dieser Session */
export function buildBrainMcpConfig(nodeExe: string, mcpPath: string, env: { sessionId: string; port: number; token: string; endpoint?: string }): object {
  return {
    mcpServers: {
      [BRAIN_SERVER]: {
        type: 'stdio',
        command: nodeExe,
        args: [mcpPath],
        env: {
          VIBEDESK_SESSION_ID: env.sessionId,
          VIBEDESK_PORT: String(env.port),
          VIBEDESK_TOKEN: env.token,
          // aktueller Port + Token, falls VibeDesk neu startet, während die Session weiterläuft
          ...(env.endpoint ? { VIBEDESK_ENDPOINT: env.endpoint } : {})
        }
      }
    }
  }
}
