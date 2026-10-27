// Zweiter Bildschirm: Aktionen, die einem bestimmten Fenster gehören (Sessions, Addons, Editor), dorthin weiterreichen.
import type { ScreenAction } from '../../../shared/secondScreen'

let handler: ((a: ScreenAction) => boolean) | null = null

export function setScreenRelay(h: ((a: ScreenAction) => boolean) | null): void {
  handler = h
}

/** true: das andere Fenster kümmert sich – hier nichts weiter tun. Ohne zweiten Bildschirm immer false */
export function relayed(a: ScreenAction): boolean {
  return handler ? handler(a) : false
}
