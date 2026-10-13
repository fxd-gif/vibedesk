import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { api } from '../api'

interface Entry {
  term: Terminal
  fit: FitAddon
  /** GPU-Renderer; fällt bei Kontextverlust auf den DOM-Renderer zurück */
  webgl: WebglAddon | null
}

const entries = new Map<string, Entry>()
let wired = false

type OutputTransform = (sessionId: string, data: string, write: (s: string) => void) => void
let transform: OutputTransform | null = null

/** Filter für die Terminal-Ausgabe (Streamer-Modus schwärzt hier Secrets). */
export function setOutputTransform(fn: OutputTransform | null): void {
  transform = fn
}

/** Leert Bildschirm und Verlauf aller Terminals (z. B. vor dem Livegehen). */
export function clearAllTerminals(): void {
  entries.forEach((e) => e.term.clear())
}

const theme = {
  background: 'rgba(0,0,0,0)',
  foreground: '#dfe5ef',
  cursor: '#9fb8ff',
  cursorAccent: '#0b0e14',
  selectionBackground: 'rgba(159,184,255,0.3)',
  scrollbarSliderBackground: 'rgba(255,255,255,0.08)',
  scrollbarSliderHoverBackground: 'rgba(255,255,255,0.16)',
  scrollbarSliderActiveBackground: 'rgba(255,255,255,0.22)',
  black: '#1b2030', red: '#f87171', green: '#4ade80', yellow: '#facc15', blue: '#60a5fa', magenta: '#c084fc', cyan: '#5eead4', white: '#dfe5ef',
  brightBlack: '#5b6478', brightRed: '#fca5a5', brightGreen: '#86efac', brightYellow: '#fde047', brightBlue: '#93c5fd', brightMagenta: '#d8b4fe', brightCyan: '#99f6e4', brightWhite: '#ffffff'
}

/** Terminal pro Session – wird beim Start angelegt, damit keine Ausgabe verloren geht. */
export function createTerminal(sessionId: string): Entry {
  wire()
  const existing = entries.get(sessionId)
  if (existing) return existing
  const term = new Terminal({
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 13,
    lineHeight: 1.2,
    allowTransparency: true,
    cursorBlink: true,
    scrollback: 5000,
    theme
  })
  const fit = new FitAddon()
  term.loadAddon(fit)
  term.onData((d) => api.sessions.write(sessionId, d))
  term.onResize(({ cols, rows }) => api.sessions.resize(sessionId, cols, rows))
  const e: Entry = { term, fit, webgl: null }
  entries.set(sessionId, e)
  return e
}

/** Hängt das Terminal in ein Fenster ein – beim ersten Mal öffnen und den WebGL-Renderer laden. */
export function mountTerminal(sessionId: string, host: HTMLElement): Entry | undefined {
  const e = entries.get(sessionId)
  if (!e) return undefined
  if (e.term.element) host.appendChild(e.term.element)
  else {
    e.term.open(host)
    loadWebgl(e)
  }
  return e
}

function loadWebgl(e: Entry): void {
  try {
    const gl = new WebglAddon()
    gl.onContextLoss(() => {
      gl.dispose()
      e.webgl = null
    })
    e.term.loadAddon(gl)
    e.webgl = gl
  } catch {
    /* kein WebGL – DOM-Renderer bleibt */
  }
}

/** Sichtbarer Text samt Verlauf – WebGL zeichnet in ein Canvas, daher lesen E2E-Tests hierüber. */
export function terminalText(sessionId: string): string {
  const buf = entries.get(sessionId)?.term.buffer.active
  if (!buf) return ''
  let out = ''
  for (let i = 0; i < buf.length; i++) {
    const line = buf.getLine(i)
    if (!line) continue
    // nur am echten Zeilenende kürzen – sonst gingen Leerzeichen an der Umbruchstelle verloren
    out += (i > 0 && !line.isWrapped ? '\n' : '') + line.translateToString(!buf.getLine(i + 1)?.isWrapped)
  }
  return out
}
;(window as unknown as { __vdTermText?: typeof terminalText }).__vdTermText = terminalText

export function getTerminal(sessionId: string): Entry | undefined {
  return entries.get(sessionId)
}

export function disposeTerminal(sessionId: string): void {
  entries.get(sessionId)?.term.dispose()
  entries.delete(sessionId)
}

function wire(): void {
  if (wired) return
  wired = true
  api.on.sessionData((id, data) => {
    if (!entries.has(id)) return
    if (transform) transform(id, data, (s) => entries.get(id)?.term.write(s))
    else entries.get(id)!.term.write(data)
  })
  api.on.sessionExit((id, code) =>
    entries.get(id)?.term.write(`\r\n\x1b[2m— Session beendet (Code ${code}) —\x1b[0m\r\n`)
  )
}
