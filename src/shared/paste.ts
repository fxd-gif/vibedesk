const START = '\x1b[200~'
const END = '\x1b[201~'

/** Fügt Text wie ein echtes Einfügen ins Terminal ein (mehrzeilig, ohne abzuschicken). */
export function bracketedPaste(text: string): string {
  const clean = text.split(START).join('').split(END).join('').replace(/\r?\n/g, '\r')
  return START + clean + END
}

/**
 * Prompt für Claude aus einer fremden Quelle (Addon, Handy, Warteschlange …) entschärfen:
 * Steuerzeichen (ESC, Strg+C …) könnten Claude Code fernbedienen, ein führendes `!` schaltet
 * in den Bash-Modus und würde den Text als Befehl ausführen.
 */
export function safePrompt(text: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = text.replace(/[\x00-\x08\x0b-\x1f\x7f\x9b]/g, '')
  return clean.replace(/^\s*!+\s*/, '')
}
