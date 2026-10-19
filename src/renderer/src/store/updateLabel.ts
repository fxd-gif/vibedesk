import { t } from '../../../shared/i18n'
import type { UpdateStatus } from '../../../shared/types'

/** Text für den Update-Hinweis; null = nichts anzeigen (Prüfen/Fehler laufen still im Hintergrund). */
export function updateLabel(s: UpdateStatus): string | null {
  switch (s.state) {
    case 'available':
      return s.manual ? t('Update {version} ist verfügbar', { version: s.version }) : t('Update {version} gefunden – wird geladen …', { version: s.version })
    case 'downloading':
      return t('Update {version} wird geladen … {percent} %', { version: s.version, percent: s.percent })
    case 'ready':
      return t('Update {version} ist bereit', { version: s.version })
    default:
      return null
  }
}
