// VibeDesk als MCP: Befehle, die Claude über die desk_*-Werkzeuge schickt, hier ausführen.
import type { DeskCommand } from '../../../shared/desk'
import { api } from '../api'
import { tidyNow, toggleZen } from '../desktop/calm'
import { openPanel } from '../windows/palette/CommandPalette'
import { useFocus } from './focusStore'
import { inform } from './notifyStore'
import { kindOf, useSessions } from './sessionStore'
import { sendToSession } from './sessionPrompt'
import { t } from '../../../shared/i18n'
import { useSettings } from './settingsStore'
import { useUi } from './uiStore'
import { usePreview } from './previewStore'
import { relTo, withHandoff, type Handoff, type HandoffFile, type SessionHandoff } from '../../../shared/handoff'
import { useWrapUp } from './wrapUpStore'

export function runDeskCommand(c: DeskCommand): void {
  const st = useSettings.getState()
  const s = st.s
  if (!s) return
  switch (c.cmd) {
    case 'arrange':
      return useUi.getState().arrangeAll(kindOf)
    case 'tidy':
      return tidyNow()
    case 'zen': {
      const on = !!useUi.getState().zen
      if (c.on === undefined || c.on !== on) toggleZen()
      return
    }
    case 'scene':
      return st.set({ ...(c.scene ? { scene: c.scene } : {}), ...(c.rain !== undefined ? { rainIntensity: c.rain } : {}), ...(c.blur !== undefined ? { blur: c.blur } : {}) })
    case 'music':
      return st.set({
        ...(c.music ? { musicOn: c.music === 'lofi' } : {}),
        ...(c.volume !== undefined ? { musicVolume: c.volume / 100 } : {}),
        ...(c.rainSound !== undefined ? { rainSoundOn: c.rainSound } : {})
      })
    case 'open':
      return openPanel(c.window)
    case 'layout':
      return st.set({ layout: c.layout })
    case 'theme':
      return st.set({ terminal: { ...s.terminal, theme: c.theme } })
    case 'focus': {
      const f = useFocus.getState()
      return f.act(c.action === 'stop' ? 'reset' : c.action)
    }
    case 'notify':
      return inform(c.title, c.body || undefined)
    case 'preview':
      return usePreview.getState().openPreview(c.url)
    case 'customTheme':
      return st.set({ customTheme: c.theme, terminal: { ...s.terminal, theme: 'custom' } })
  }
}

let wired = false
export function wireDeskCommands(): void {
  if (wired) return
  wired = true
  api.on.deskCommand(runDeskCommand)
  // Claude schickt einer anderen Session einen Auftrag (desk_session_send)
  api.on.deskSessionPrompt(async (id, text, from, req) => {
    const to = useSessions.getState().sessions.find((s) => s.id === id)
    if (!to) return
    const h = req ? await sessionHandoff(req) : null
    sendToSession(id, withHandoff(text, h), false)
    const preview = text.length > 140 ? text.slice(0, 139) + '…' : text
    const extra = h?.files.length ? ' · ' + t('mit Übergabe ({n} Dateien)', { n: h.files.length }) : h?.summary ? ' · ' + t('mit Übergabe') : ''
    inform(t('{from} → {to}', { from, to: to.name }), preview + extra)
  })
}

/** Runde der schickenden Session: Zusammenfassung und geänderte Dateien mit Zeilenzahlen aus git */
async function sessionHandoff(req: SessionHandoff): Promise<Handoff | null> {
  const from = useSessions.getState().sessions.find((s) => s.id === req.fromId)
  if (!from) return null
  const w = useWrapUp.getState()
  const turn = w.turns[req.fromId]
  const summary = req.summary || turn?.summary || w.last[req.fromId]
  const paths = (turn?.files ?? []).map((f) => relTo(from.cwd, f))
  const counts = new Map<string, { add: number | null; del: number | null }>()
  if (paths.length) {
    try {
      const ch = await api.wrapUp.changes(req.fromId)
      if (ch.repo) for (const f of ch.files) counts.set(f.path.toLowerCase(), f)
    } catch {
      // ohne git gehen die Dateien eben ohne Zeilenzahlen mit
    }
  }
  const files: HandoffFile[] = paths.map((p) => {
    const c = counts.get(p.toLowerCase())
    return { path: p, add: c?.add ?? null, del: c?.del ?? null }
  })
  return { from: from.name, cwd: from.cwd, summary, files }
}
