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

/** Claude-Code-Settings, deren Hooks jedes Event an den VibeDesk-Forwarder geben. */
export function buildHookSettings(nodeExe: string, forwarderPath: string): object {
  const hook = { type: 'command', command: `"${nodeExe}" "${forwarderPath}"`, timeout: 5 }
  const hooks = Object.fromEntries(
    HOOK_EVENTS.map((e) => [e, [TOOL_EVENTS.has(e) ? { matcher: '*', hooks: [hook] } : { hooks: [hook] }]])
  )
  return { hooks }
}
