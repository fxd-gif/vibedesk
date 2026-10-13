// Dauerhafter Speicher eines Addons („Dauerhaft merken“): einmal laden, Änderungen höchstens einmal pro Sekunde schreiben.
import type { StoredValue } from '../../../shared/types'
import type { AddonStorage } from './interpreter'

export interface StorageIO {
  load(id: string): Promise<Record<string, StoredValue>>
  save(id: string, data: Record<string, StoredValue>): Promise<void>
}

export interface ManagedStorage extends AddonStorage {
  /** Ausstehende Änderungen sofort schreiben */
  flush(): Promise<void>
  /** Ausstehende Änderungen verwerfen und nie mehr schreiben (Addon gelöscht) */
  discard(): void
}

const WRITE_EVERY_MS = 1000

/** `after`: erst laden, wenn der vorige Speicher desselben Addons fertig geschrieben hat. */
export function createStorage(id: string, io: StorageIO, after: Promise<void> = Promise.resolve(), onError?: (msg: string) => void): ManagedStorage {
  let data: Record<string, StoredValue> = {}
  let dirty = false
  let discarded = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let saving: Promise<void> = Promise.resolve()

  const write = (): Promise<void> => {
    timer = undefined
    if (!dirty || discarded) return saving
    dirty = false
    const snapshot = data
    saving = saving.then(() => io.save(id, snapshot)).catch((e: unknown) => onError?.(e instanceof Error ? e.message : String(e)))
    return saving
  }

  const ready = after
    .catch(() => undefined)
    .then(() => io.load(id))
    .then((d) => void (data = d ?? {}))
    .catch(() => undefined)

  return {
    ready,
    get: (k) => (Object.hasOwn(data, k) ? data[k] : undefined),
    set: (k, v) => {
      data = { ...data, [k]: v }
      dirty = true
      // gedrosselt statt verschoben: auch bei Dauer-Änderungen wird regelmäßig geschrieben
      if (!timer && !discarded) timer = setTimeout(() => void write(), WRITE_EVERY_MS)
    },
    flush: () => {
      clearTimeout(timer)
      return write()
    },
    discard: () => {
      discarded = true
      clearTimeout(timer)
      timer = undefined
    }
  }
}
