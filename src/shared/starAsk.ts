// Wann VibeDesk einmalig um einen GitHub-Stern bittet – reine Logik, testbar.
export const STAR_AFTER_DONE = 10

export function starAskDue(doneCount: number, starAsked: boolean): boolean {
  return !starAsked && doneCount >= STAR_AFTER_DONE
}
