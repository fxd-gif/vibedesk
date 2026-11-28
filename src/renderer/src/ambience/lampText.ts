// Kurzer Status eines Session-Lichts – im Ausblick und in den Zeichen-Fenstern des Zeichenregens gleich.
import { t } from '../../../shared/i18n'
import { waitingLabel } from '../../../shared/waiting'
import type { Lamp } from './lights'

export function lampStatusText(l: Pick<Lamp, 'status' | 'waitingSince'>, now = Date.now()): string {
  switch (l.status) {
    case 'waiting':
      return waitingLabel(l.waitingSince, now)
    case 'working':
      return t('arbeitet')
    case 'done':
      return t('fertig')
    case 'error':
      return t('Fehler')
    default:
      return t('bereit')
  }
}
