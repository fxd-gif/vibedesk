// VibeDesk als MCP: Befehle, die Claude über die desk_*-Werkzeuge schickt, hier ausführen.
import type { DeskCommand } from '../../../shared/desk'
import { api } from '../api'
import { tidyNow, toggleZen } from '../desktop/calm'
import { openPanel } from '../windows/palette/CommandPalette'
import { useFocus } from './focusStore'
import { inform } from './notifyStore'
import { kindOf } from './sessionStore'
import { useSettings } from './settingsStore'
import { useUi } from './uiStore'

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
  }
}

let wired = false
export function wireDeskCommands(): void {
  if (wired) return
  wired = true
  api.on.deskCommand(runDeskCommand)
}
