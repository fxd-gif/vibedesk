import type { SessionStatus } from '../../../shared/types'

export const CHIME_COOLDOWN_MS = 20_000

/** Ton nur beim Wechsel auf "wartet", wenn man die Session gerade nicht im Blick hat. */
export function shouldChime(
  prev: SessionStatus | undefined,
  next: SessionStatus,
  ctx: { appFocused: boolean; sessionOnTop: boolean; lastChime: number | undefined; now: number }
): boolean {
  if (next !== 'waiting' || prev === 'waiting') return false
  if (ctx.appFocused && ctx.sessionOnTop) return false
  if (ctx.lastChime !== undefined && ctx.now - ctx.lastChime < CHIME_COOLDOWN_MS) return false
  return true
}
