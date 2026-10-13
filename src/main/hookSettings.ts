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

/** Claude-Code-Settings, deren Hooks jedes Event an den VibeDesk-Forwarder geben. */
export function buildHookSettings(nodeExe: string, forwarderPath: string, opts: { brain?: boolean } = {}): object {
  const hook = { type: 'command', command: hookCommand(nodeExe, forwarderPath), timeout: 5 }
  const hooks = Object.fromEntries(
    HOOK_EVENTS.map((e) => {
      const h = e === 'PermissionRequest' ? { ...hook, timeout: PERMISSION_TIMEOUT_S } : hook
      return [e, [TOOL_EVENTS.has(e) ? { matcher: '*', hooks: [h] } : { hooks: [h] }]]
    })
  )
  // Gehirn-Werkzeuge ohne Rückfrage – sie lesen und schreiben nur Notizen in .vibedesk/brain
  return opts.brain ? { hooks, permissions: { allow: [`mcp__${BRAIN_SERVER}`] } } : { hooks }
}

/** MCP-Konfiguration für --mcp-config: startet den Gehirn-Server dieser Session */
export function buildBrainMcpConfig(nodeExe: string, mcpPath: string, env: { sessionId: string; port: number; token: string }): object {
  return {
    mcpServers: {
      [BRAIN_SERVER]: {
        type: 'stdio',
        command: nodeExe,
        args: [mcpPath],
        env: { VIBEDESK_SESSION_ID: env.sessionId, VIBEDESK_PORT: String(env.port), VIBEDESK_TOKEN: env.token }
      }
    }
  }
}
