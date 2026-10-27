// Ereignisse aus anderen Teilen der App für Addons (Commit im Git-Fenster, Fehler in der Vorschau).
// Eigenes Modul, damit Fenster nicht die ganze Addon-Laufzeit importieren müssen.
import type { AddonEvent } from './interpreter'

const subs = new Set<(e: AddonEvent) => void>()

export function addonEvent(e: AddonEvent): void {
  for (const s of subs) s(e)
}

export function onAddonEvent(cb: (e: AddonEvent) => void): () => void {
  subs.add(cb)
  return () => subs.delete(cb)
}
