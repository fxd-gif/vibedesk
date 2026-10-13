// Discord-Webhook senden – nur an Discord-Webhook-URLs, gedrosselt, mit verständlichen Fehlern.
import { RateLimiter } from '../../shared/lounge'
import { isWebhookUrl, validPayload, type WebhookSettings } from '../../shared/webhook'

export type WebhookKind = 'waiting' | 'recap' | 'test'
export type WebhookResult = { ok: true } | { ok: false; skipped?: true; error?: string }

// Discord erlaubt ~30 Nachrichten/Minute pro Webhook – wir bleiben weit darunter
const limits = new RateLimiter(6, 60_000)

export async function postWebhook(url: string, body: unknown, fetchFn: typeof fetch = fetch): Promise<WebhookResult> {
  if (!isWebhookUrl(url)) return { ok: false, error: 'Das ist keine Discord-Webhook-URL.' }
  if (!validPayload(body)) return { ok: false, error: 'Ungültige Nachricht.' }
  if (!limits.allow('hook')) return { ok: false, error: 'Zu viele Nachrichten – kurz warten.' }
  try {
    const r = await fetchFn(url.trim() + '?wait=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000)
    })
    if (r.ok) return { ok: true }
    if (r.status === 404 || r.status === 401) return { ok: false, error: 'Webhook nicht gefunden – wurde er in Discord gelöscht?' }
    if (r.status === 429) return { ok: false, error: 'Discord bremst gerade – später nochmal.' }
    return { ok: false, error: `Discord antwortet mit Fehler ${r.status}.` }
  } catch {
    return { ok: false, error: 'Discord ist nicht erreichbar.' }
  }
}

/** Entscheidet, ob eine Nachricht laut Einstellungen überhaupt raus soll. */
export function shouldSend(kind: WebhookKind, hook: WebhookSettings, away: () => boolean): boolean {
  if (kind === 'test') return true
  if (kind === 'recap') return hook.recap
  return hook.onWaiting && (!hook.onlyAway || away())
}
