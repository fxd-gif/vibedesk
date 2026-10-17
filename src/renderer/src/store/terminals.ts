import { Terminal, type ILink, type ITerminalOptions } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { SearchAddon } from '@xterm/addon-search'
import { SerializeAddon } from '@xterm/addon-serialize'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { api } from '../api'
import type { Settings, TerminalSettings } from '../../../shared/types'
import { findFileLinks, isLocalUrl, keyAction, quotePaths, resolveLinkPath, zoomFont } from '../../../shared/terminalInput'
import { resolveTheme } from '../terminal/themes'
import { useSettings } from './settingsStore'

export type TermKind = 'claude' | 'shell'

interface Entry {
  term: Terminal
  fit: FitAddon
  search: SearchAddon
  serialize: SerializeAddon
  kind: TermKind
  /** Ordner, gegen den relative Datei-Links aufgelöst werden */
  cwd: string
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

const DEFAULTS: TerminalSettings = { fontSize: 13, lineHeight: 1.2, cursorStyle: 'block', cursorBlink: true, theme: 'scene', shell: 'powershell', statusBar: true }
const termSettings = (s: Settings | null = useSettings.getState().s): TerminalSettings => ({ ...DEFAULTS, ...(s?.terminal ?? {}) })

function optionsFor(s: Settings | null): ITerminalOptions {
  const t = termSettings(s)
  return {
    fontSize: t.fontSize,
    lineHeight: t.lineHeight,
    cursorStyle: t.cursorStyle,
    cursorBlink: t.cursorBlink,
    theme: resolveTheme(t.theme, s?.scene ?? '')
  }
}

// Aktionen, die ein Fenster anzeigen muss (Suchleiste) – das Fenster meldet sich hier an
type UiAction = 'search'
const uiListeners = new Map<string, (a: UiAction) => void>()
export function onTerminalUi(id: string, cb: (a: UiAction) => void): () => void {
  uiListeners.set(id, cb)
  return () => {
    if (uiListeners.get(id) === cb) uiListeners.delete(id)
  }
}

const io = (kind: TermKind) => (kind === 'shell' ? api.shells : api.sessions)

/** Text oder Bild aus der Zwischenablage einfügen – ein Bild kommt als Pfad zu einer Temp-Datei an */
export async function pasteInto(id: string): Promise<void> {
  const e = entries.get(id)
  if (!e) return
  const c = await api.terminal.readClipboard()
  if (!c) return
  // paste() beachtet den Bracketed-Paste-Modus – mehrzeiliger Text wird nicht sofort abgeschickt
  e.term.paste('text' in c ? c.text : quotePaths([c.image]) + ' ')
  e.term.focus()
}

export function copySelection(id: string): boolean {
  const e = entries.get(id)
  const sel = e?.term.getSelection()
  if (!e || !sel) return false
  void api.terminal.writeClipboard(sel)
  e.term.clearSelection()
  return true
}

/** Abgelegte Dateien als Pfade einfügen */
export function dropFiles(id: string, files: File[]): void {
  const e = entries.get(id)
  const paths = files.map((f) => api.terminal.filePath(f)).filter(Boolean)
  if (!e || !paths.length) return
  e.term.paste(quotePaths(paths) + ' ')
  e.term.focus()
}

function zoom(action: 'zoomIn' | 'zoomOut' | 'zoomReset'): void {
  const st = useSettings.getState()
  const t = termSettings(st.s)
  st.set({ terminal: { ...t, fontSize: zoomFont(t.fontSize, action, DEFAULTS.fontSize) } })
}

function openUrl(url: string): void {
  if (isLocalUrl(url)) void import('./previewStore').then((m) => m.usePreview.getState().openPreview(url))
  else api.openExternal(url)
}

/** Datei-Pfade in der Ausgabe (src/app.ts:42) öffnen den Editor an der Stelle */
function fileLinks(e: Entry): { provideLinks(y: number, cb: (links: ILink[] | undefined) => void): void } {
  return {
    provideLinks(y, cb) {
      const line = e.term.buffer.active.getLine(y - 1)
      if (!line) return cb(undefined)
      const text = line.translateToString(true)
      const links = findFileLinks(text).map<ILink>((l) => ({
        range: { start: { x: l.start + 1, y }, end: { x: l.end, y } },
        text: text.slice(l.start, l.end),
        decorations: { underline: true, pointerCursor: true },
        activate: () => {
          const path = resolveLinkPath(l.path, e.cwd)
          void import('./editorStore').then((m) => m.openInEditor(path, undefined, l.line))
        }
      }))
      cb(links.length ? links : undefined)
    }
  }
}

const SAVED = (id: string): string => `vd-term:${id}`

/** Terminal pro Session bzw. Shell – wird beim Start angelegt, damit keine Ausgabe verloren geht. */
export function createTerminal(id: string, opts: { kind?: TermKind; cwd?: string } = {}): Entry {
  wire()
  const existing = entries.get(id)
  if (existing) return existing
  const kind = opts.kind ?? 'claude'
  const term = new Terminal({
    fontFamily: "'JetBrains Mono', monospace",
    allowTransparency: true,
    allowProposedApi: true,
    scrollback: 5000,
    ...optionsFor(useSettings.getState().s)
  })
  const fit = new FitAddon()
  const search = new SearchAddon()
  const serialize = new SerializeAddon()
  term.loadAddon(fit)
  term.loadAddon(search)
  term.loadAddon(serialize)
  term.loadAddon(new Unicode11Addon())
  term.unicode.activeVersion = '11'
  term.loadAddon(new WebLinksAddon((_ev, url) => openUrl(url)))
  const e: Entry = { term, fit, search, serialize, kind, cwd: opts.cwd ?? '', webgl: null }
  term.registerLinkProvider(fileLinks(e))
  term.attachCustomKeyEventHandler((ev) => {
    if (ev.type !== 'keydown') return true
    const action = keyAction(ev, term.hasSelection())
    if (!action) return true
    ev.preventDefault()
    if (action === 'copy') copySelection(id)
    else if (action === 'paste') void pasteInto(id)
    else if (action === 'search') uiListeners.get(id)?.('search')
    else zoom(action)
    return false
  })
  term.onData((d) => io(kind).write(id, d))
  term.onResize(({ cols, rows }) => io(kind).resize(id, cols, rows))
  // Verlauf von vor einem Neuladen des Fensters wiederherstellen (die Prozesse in Main laufen weiter)
  try {
    const saved = sessionStorage.getItem(SAVED(id))
    if (saved) {
      term.write(saved)
      sessionStorage.removeItem(SAVED(id))
    }
  } catch {
    /* kein Speicher */
  }
  entries.set(id, e)
  return e
}

/** Hängt das Terminal in ein Fenster ein – beim ersten Mal öffnen und den WebGL-Renderer laden. */
export function mountTerminal(id: string, host: HTMLElement): Entry | undefined {
  const e = entries.get(id)
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
export function terminalText(id: string): string {
  const buf = entries.get(id)?.term.buffer.active
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

export function getTerminal(id: string): Entry | undefined {
  return entries.get(id)
}

export function disposeTerminal(id: string): void {
  entries.get(id)?.term.dispose()
  entries.delete(id)
  try {
    sessionStorage.removeItem(SAVED(id))
  } catch {
    /* egal */
  }
}

/** Einstellungen live auf alle offenen Terminals anwenden */
function applySettings(s: Settings | null): void {
  const o = optionsFor(s)
  entries.forEach((e) => {
    e.term.options.fontSize = o.fontSize
    e.term.options.lineHeight = o.lineHeight
    e.term.options.cursorStyle = o.cursorStyle
    e.term.options.cursorBlink = o.cursorBlink
    e.term.options.theme = o.theme
    try {
      if (e.term.element?.isConnected) e.fit.fit()
    } catch {
      /* unsichtbar */
    }
  })
}

function wire(): void {
  if (wired) return
  wired = true
  const write = (id: string, data: string): void => {
    if (!entries.has(id)) return
    if (transform) transform(id, data, (s) => entries.get(id)?.term.write(s))
    else entries.get(id)!.term.write(data)
  }
  api.on.sessionData(write)
  api.on.shellData(write)
  api.on.sessionExit((id, code) => entries.get(id)?.term.write(`\r\n\x1b[2m— Session beendet (Code ${code}) —\x1b[0m\r\n`))
  api.on.shellExit((id, code) => entries.get(id)?.term.write(`\r\n\x1b[2m— Shell beendet (Code ${code}) —\x1b[0m\r\n`))
  let last = useSettings.getState().s
  useSettings.subscribe((st) => {
    if (st.s?.terminal === last?.terminal && st.s?.scene === last?.scene) return
    last = st.s
    applySettings(st.s)
  })
  // Neuladen des Fensters (z. B. Strg+R): Verlauf merken, die Prozesse laufen in Main weiter
  window.addEventListener('beforeunload', () => {
    entries.forEach((e, id) => {
      try {
        sessionStorage.setItem(SAVED(id), e.serialize.serialize({ scrollback: 2000 }))
      } catch {
        /* Speicher voll – dann eben ohne */
      }
    })
  })
}
