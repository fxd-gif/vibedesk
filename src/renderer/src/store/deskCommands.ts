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
  api.on.deskSessionPrompt((id, text, from) => {
    const to = useSessions.getState().sessions.find((s) => s.id === id)
    if (!to) return
    sendToSession(id, text, false)
    inform(t('{from} → {to}', { from, to: to.name }), text.length > 140 ? text.slice(0, 139) + '…' : text)
  })
}
