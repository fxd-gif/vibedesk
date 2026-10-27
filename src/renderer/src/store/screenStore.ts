// Zweiter Bildschirm (Beta): gibt es einen zweiten Monitor, welche Fenster sind drüben – geteilt von Haupt- und Zweitfenster.
import { create } from 'zustand'
import { api } from '../api'
import type { MoveTarget, ScreenItem } from '../../../shared/secondScreen'

/** dieses Fenster ist das Zweitfenster (Main lädt den Renderer dafür mit #second) */
export const IS_SECOND = typeof location !== 'undefined' && location.hash === '#second'

interface ScreenStore {
  available: boolean
  open: boolean
  items: ScreenItem[]
  /** nur im Zweitfenster: offene Terminals im Hauptfenster, oberstes zuletzt */
  terms: string[]
}

export const useScreen = create<ScreenStore>(() => ({ available: false, open: false, items: [], terms: [] }))

/** liegt dieses Fenster gerade auf dem zweiten Bildschirm? */
export const onScreen = (id: string): boolean => useScreen.getState().items.some((x) => x.id === id)

/** Vorschauen brauchen ihre Adresse – das setzt, wer den Vorschau-Store kennt (hier nicht importiert, sonst gäbe es einen Kreis) */
let mover = (id: string, to: MoveTarget): void => api.screen.move(id, to)
export function setScreenMover(f: (id: string, to: MoveTarget) => void): void {
  mover = f
}

export function moveTo(id: string, to: MoveTarget): void {
  mover(id, to)
}
