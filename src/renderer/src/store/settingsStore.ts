import { create } from 'zustand'
import { api } from '../api'
import type { Settings } from '../../../shared/types'
import { applyLangSetting } from '../i18nInit'

interface SettingsState {
  s: Settings | null
  load(): Promise<Settings>
  set(patch: Partial<Settings>): void
}

export const useSettings = create<SettingsState>((set, get) => ({
  s: null,
  load: async () => {
    const s = await api.settings.get()
    set({ s })
    applyLangSetting(s.language)
    return s
  },
  set: (patch) => {
    const cur = get().s
    if (cur) set({ s: { ...cur, ...patch } })
    api.settings.set(patch)
    if (patch.language) applyLangSetting(patch.language)
  }
}))

let synced = false
/** Zweiter Bildschirm: Änderungen aus dem jeweils anderen Fenster übernehmen (ohne Zweitfenster kommt nie etwas) */
export function wireSettingsSync(): void {
  if (synced) return
  synced = true
  api.on.settingsChanged((patch) => {
    const cur = useSettings.getState().s
    if (cur) useSettings.setState({ s: { ...cur, ...patch } })
    if (patch.language) applyLangSetting(patch.language)
  })
}
