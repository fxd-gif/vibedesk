import { create } from 'zustand'
import { api } from '../api'
import type { InstalledAddon } from '../../../shared/types'

interface AddonState {
  list: InstalledAddon[]
  /** letzter Laufzeitfehler je Addon */
  errors: Record<string, string>
  reload(): Promise<void>
  setEnabled(id: string, on: boolean): Promise<void>
  remove(id: string): Promise<void>
  setError(id: string, msg: string | null): void
}

export const useAddons = create<AddonState>((set, get) => ({
  list: [],
  errors: {},
  reload: async () => set({ list: await api.addons.list() }),
  setEnabled: async (id, on) => {
    await api.addons.setEnabled(id, on)
    get().setError(id, null)
    await get().reload()
  },
  remove: async (id) => {
    await api.addons.remove(id)
    get().setError(id, null)
    await get().reload()
  },
  setError: (id, msg) =>
    set((s) => {
      const { [id]: _old, ...rest } = s.errors
      return { errors: msg ? { ...rest, [id]: msg } : rest }
    })
}))
