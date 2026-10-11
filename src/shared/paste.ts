const START = '\x1b[200~'
const END = '\x1b[201~'

/** Fügt Text wie ein echtes Einfügen ins Terminal ein (mehrzeilig, ohne abzuschicken). */
export function bracketedPaste(text: string): string {
  const clean = text.split(START).join('').split(END).join('').replace(/\r?\n/g, '\r')
  return START + clean + END
}
