import { create } from 'zustand'

export interface DialogSpec {
  kind: 'confirm' | 'prompt' | 'alert'
  title: string
  message?: string
  confirmLabel?: string
  danger?: boolean
  checkbox?: string
  defaultValue?: string
  placeholder?: string
  seq?: number
}

export interface DialogResult {
  ok: boolean
  value: string
  checked: boolean
}

let seq = 0

interface DialogState {
  current: (DialogSpec & { resolve: (r: DialogResult) => void }) | null
  ask(spec: DialogSpec): Promise<DialogResult>
  close(r: DialogResult): void
}

export const useDialog = create<DialogState>((set, get) => ({
  current: null,
  ask: (spec) =>
    new Promise<DialogResult>((resolve) => {
      get().current?.resolve({ ok: false, value: '', checked: false })
      set({ current: { ...spec, seq: ++seq, resolve } })
    }),
  close: (r) => {
    get().current?.resolve(r)
    set({ current: null })
  }
}))

export const confirm = async (spec: Omit<DialogSpec, 'kind'>): Promise<boolean> =>
  (await useDialog.getState().ask({ ...spec, kind: 'confirm' })).ok

export const prompt = async (spec: Omit<DialogSpec, 'kind'>): Promise<string | null> => {
  const r = await useDialog.getState().ask({ ...spec, kind: 'prompt' })
  return r.ok ? r.value : null
}

export const alert = async (title: string, message?: string): Promise<void> => {
  await useDialog.getState().ask({ kind: 'alert', title, message })
}
