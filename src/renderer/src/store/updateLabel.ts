import type { UpdateStatus } from '../../../shared/types'

/** Text für den Update-Hinweis; null = nichts anzeigen (Prüfen/Fehler laufen still im Hintergrund). */
export function updateLabel(s: UpdateStatus): string | null {
  switch (s.state) {
    case 'available':
      return `Update ${s.version} gefunden – wird geladen …`
    case 'downloading':
      return `Update ${s.version} wird geladen … ${s.percent} %`
    case 'ready':
      return `Update ${s.version} ist bereit`
    default:
      return null
  }
}
