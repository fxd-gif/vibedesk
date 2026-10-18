// Entscheidet, was das Start-Fensterchen zeigt und wann es dem Hauptfenster Platz macht.
// Reine Logik ohne Electron, damit sie testbar bleibt – der Update-Ablauf selbst liegt in updater.ts.
import type { UpdateStatus } from '../shared/types'
import { t } from '../shared/i18n'

export const SPLASH_TIMEOUT_MS = 4_000
/** So lange darf der Download ohne neuen Fortschritt bleiben, bevor wir trotzdem öffnen */
export const SPLASH_STALL_MS = 15_000
/** Nach fertigem Download: Zeit für den Neustart, sonst öffnet die App mit Hinweis-Toast */
export const SPLASH_READY_HOLD_MS = 6_000

export interface SplashView {
  text: string
  /** 0–100 = Balken, null = unbestimmter Balken */
  percent: number | null
}

export function splashView(s: UpdateStatus): SplashView {
  switch (s.state) {
    case 'available':
      return { text: t('Update {version} gefunden …', { version: s.version }), percent: 0 }
    case 'downloading':
      return { text: t('Lade Update {version} · {percent} %', { version: s.version, percent: s.percent }), percent: s.percent }
    case 'ready':
      return { text: t('Installiere Update {version} …', { version: s.version }), percent: 100 }
    case 'none':
    case 'error':
      return { text: t('Starte VibeDesk …'), percent: null }
    default:
      return { text: t('Suche nach Updates …'), percent: null }
  }
}

/** Gibt das Hauptfenster frei: sofort ohne Update, sonst nach Timeout, Download-Stillstand oder Wartezeit. */
export function createSplashGate(onRelease: () => void): { feed(s: UpdateStatus): void; release(): void } {
  let released = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const release = (): void => {
    if (released) return
    released = true
    clearTimeout(timer)
    onRelease()
  }
  const arm = (ms: number): void => {
    clearTimeout(timer)
    timer = setTimeout(release, ms)
  }
  arm(SPLASH_TIMEOUT_MS)
  return {
    release,
    feed(s) {
      if (released) return
      if (s.state === 'none' || s.state === 'error') release()
      else if (s.state === 'available' || s.state === 'downloading') arm(SPLASH_STALL_MS)
      else if (s.state === 'ready') arm(SPLASH_READY_HOLD_MS)
    }
  }
}
