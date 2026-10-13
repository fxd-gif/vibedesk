/** Zeitfenster nach dem Start, in dem ein fertiges Update ohne Nachfrage installiert wird. */
export const AUTO_INSTALL_WINDOW_MS = 90_000

/**
 * Update direkt beim Öffnen installieren? Nur solange noch nichts los ist –
 * sonst würde ein Neustart laufende Sessions oder ungespeicherte Dateien kappen.
 */
export function shouldAutoInstall(o: { sinceStartMs: number; sessions: number; dirtyFiles: number }): boolean {
  return o.sinceStartMs <= AUTO_INSTALL_WINDOW_MS && o.sessions === 0 && o.dirtyFiles === 0
}
