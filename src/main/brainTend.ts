// Gehirn-Autopflege: Will Claude eine Runde beenden, in der es Dateien geändert, aber nichts
// ins Gehirn geschrieben hat, hält der Stop-Hook es einmal an und bittet um kurze Pflege.

export interface TurnActivity {
  /** geänderte Projektdateien in dieser Runde (ohne das Gehirn selbst) */
  edits: number
  /** Gehirn in dieser Runde geschrieben – oder schon einmal angestoßen */
  tended: boolean
}

export const TEND_REASON =
  'VibeDesk-Gehirn: Bevor du fertig bist – halte mit brain_write kurz fest, was du in dieser Runde gelernt oder entschieden hast ' +
  '(neue Bereiche, Entscheidungen samt Grund, Stolperfallen) und aktualisiere Notizen, die dadurch veraltet sind. ' +
  'Gibt es nichts Neues, antworte nur „Gehirn ist aktuell.“ Wiederhole deine vorige Antwort nicht und fasse dich kurz.'

/** `stop_hook_active` heißt: Claude läuft schon wegen eines Stop-Hooks weiter – dann nie erneut anhalten. */
export function shouldTend(turn: TurnActivity | undefined, stopHookActive: boolean): boolean {
  return !!turn && !stopHookActive && !turn.tended && turn.edits > 0
}

export function stopHookReply(): string {
  return JSON.stringify({ decision: 'block', reason: TEND_REASON })
}
