export const HOOK_EVENTS = [
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'Notification',
  'Stop',
  'SubagentStart',
  'SubagentStop',
  'SessionStart',
  'SessionEnd'
] as const

const TOOL_EVENTS = new Set<string>(['PreToolUse', 'PostToolUse'])

export const BRAIN_SERVER = 'vibedesk-brain'

/** Claude-Code-Settings, deren Hooks jedes Event an den VibeDesk-Forwarder geben. */
export function buildHookSettings(nodeExe: string, forwarderPath: string, opts: { brain?: boolean } = {}): object {
  const hook = { type: 'command', command: `"${nodeExe}" "${forwarderPath}"`, timeout: 5 }
  const hooks = Object.fromEntries(
    HOOK_EVENTS.map((e) => [e, [TOOL_EVENTS.has(e) ? { matcher: '*', hooks: [hook] } : { hooks: [hook] }]])
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
