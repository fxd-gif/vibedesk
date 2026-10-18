// Discord-Webhooks: Benachrichtigungen in einen eigenen Kanal – kein Bot, nur eine Webhook-URL.
// Rein und in Main + Renderer nutzbar. Main prüft URL und Nutzlast noch einmal, bevor etwas rausgeht.
import { locale, t } from './i18n'
import type { DayStats } from './types'

export interface WebhookSettings {
  url: string
  /** „Session wartet auf dich“ senden */
  onWaiting: boolean
  /** … nur, wenn du gerade nicht am Rechner bist (VibeDesk nicht im Vordergrund oder 2 Min. keine Eingabe) */
  onlyAway: boolean
  /** Tagesrückblick senden */
  recap: boolean
  /** ab dieser Stunde (0–23) – fehlt die App dann, kommt er beim nächsten Start am selben Tag */
  recapHour: number
  /** Datum (YYYY-MM-DD) des zuletzt gesendeten Rückblicks */
  lastRecap: string
}

export const DEFAULT_WEBHOOK: WebhookSettings = {
  url: '',
  onWaiting: true,
  onlyAway: true,
  recap: false,
  recapHour: 22,
  lastRecap: ''
}

const WEBHOOK_RE = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/(\d{15,22})\/([A-Za-z0-9_-]{30,100})\/?$/

export const isWebhookUrl = (url: string): boolean => WEBHOOK_RE.test(url.trim())

export interface Embed {
  title?: string
  description?: string
  color?: number
  fields?: { name: string; value: string; inline?: boolean }[]
  footer?: { text: string }
  timestamp?: string
}

export interface WebhookPayload {
  username: string
  avatar_url: string
  embeds: Embed[]
  /** niemals @everyone, Rollen oder Nutzer anpingen – egal was im Text steht */
  allowed_mentions: { parse: [] }
}

const AVATAR = 'https://raw.githubusercontent.com/fxd-gif/vibedesk/main/resources/icon.png'
const COLOR = { waiting: 0xfbbf24, recap: 0x9fb8ff, test: 0x4ade80 }

/** Markdown und Mentions aus Fremdtext entschärfen (Projektnamen kommen aus Ordnernamen). */
export function mdSafe(s: string, max = 200): string {
  return s
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/([\\*_~`|>#[\]()-])/g, '\\$1')
    .replace(/@/g, '@​')
    .slice(0, max)
}

export function payload(embed: Embed): WebhookPayload {
  return { username: 'VibeDesk', avatar_url: AVATAR, embeds: [embed], allowed_mentions: { parse: [] } }
}

const dec = (): string => (locale() === 'de-DE' ? ',' : '.')
export const fmtTokens = (n: number): string =>
  n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace('.', dec()) + ' M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace('.', dec()) + ' k' : String(n)

export const fmtUsd = (n: number): string =>
  n < 0.01 && n > 0 ? t('< 0,01 $') : t('{amount} $', { amount: n.toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })

export interface WaitingInfo {
  /** leer = verborgen (Privat- oder Streamer-Modus) */
  project: string
  model: string
  context: string
  /** letzte Aktion aus dem Live-Feed, z. B. „Bash · npm test“ */
  lastAction: string
  waitingSessions: number
}

export function waitingEmbed(w: WaitingInfo, now = Date.now()): WebhookPayload {
  const fields: Embed['fields'] = []
  if (w.model) fields.push({ name: t('Modell'), value: mdSafe(w.model, 60), inline: true })
  if (w.context) fields.push({ name: 'Context', value: mdSafe(w.context, 20), inline: true })
  if (w.waitingSessions > 1) fields.push({ name: t('Warten gerade'), value: t('{n} Sessions', { n: w.waitingSessions }), inline: true })
  if (w.lastAction) fields.push({ name: t('Zuletzt'), value: mdSafe(w.lastAction, 200) })
  return payload({
    title: w.project ? t('⏳ {project} wartet auf dich', { project: mdSafe(w.project, 80) }) : t('⏳ Eine Session wartet auf dich'),
    description: t('Claude braucht deine Antwort, um weiterzumachen.'),
    color: COLOR.waiting,
    fields,
    timestamp: new Date(now).toISOString()
  })
}

export interface RecapInfo {
  today: DayStats
  yesterday?: DayStats
  /** die letzten 7 Tage inkl. heute */
  week: DayStats[]
  /** leer, wenn Projektnamen verborgen sind */
  projects: string[]
  focusRounds: number
  sessionsDone: number
}

const pct = (a: number, b: number): string => {
  if (!b) return ''
  const d = Math.round(((a - b) / b) * 100)
  return d === 0 ? ' ' + t('(wie gestern)') : ' ' + t('({d} % ggü. gestern)', { d: (d > 0 ? '+' : '') + d })
}

/** Mini-Balken für die Woche – ▁▂▃▄▅▆▇█ */
export function sparkline(values: number[]): string {
  const max = Math.max(...values, 0)
  if (!max) return ''
  const bars = '▁▂▃▄▅▆▇█'
  return values.map((v) => (v ? bars[Math.min(7, Math.max(0, Math.round((v / max) * 7)))] : '·')).join('')
}

export function recapEmbed(r: RecapInfo, now = Date.now()): WebhookPayload {
  const { today, yesterday } = r
  const fields: Embed['fields'] = [
    { name: 'Tokens', value: fmtTokens(today.tokens) + (yesterday ? pct(today.tokens, yesterday.tokens) : ''), inline: true },
    { name: t('≈ Kosten'), value: fmtUsd(today.costUsd), inline: true },
    { name: t('Aus dem Cache'), value: fmtTokens(today.cacheRead), inline: true }
  ]
  if (r.sessionsDone) fields.push({ name: t('Fertige Sessions'), value: String(r.sessionsDone), inline: true })
  if (r.focusRounds) fields.push({ name: t('Fokus-Runden'), value: String(r.focusRounds), inline: true })
  if (r.projects.length) fields.push({ name: t('Projekte'), value: r.projects.slice(0, 10).map((p) => `• ${mdSafe(p, 60)}`).join('\n') })
  const week = r.week.slice(-7)
  const spark = sparkline(week.map((d) => d.tokens))
  if (spark) {
    const total = week.reduce((s, d) => s + d.tokens, 0)
    const cost = week.reduce((s, d) => s + d.costUsd, 0)
    fields.push({ name: t('Letzte 7 Tage'), value: `\`${spark}\`  ` + t('{tokens} Tokens · ≈ {cost}', { tokens: fmtTokens(total), cost: fmtUsd(cost) }) })
  }
  const [y, m, d] = today.date.split('-')
  return payload({
    title: t('🌧️ Dein Vibecoding-Tag · {d}.{m}.{y}', { d, m, y }),
    color: COLOR.recap,
    fields,
    footer: { text: t('Tagesrückblick aus VibeDesk') },
    timestamp: new Date(now).toISOString()
  })
}

export function testEmbed(): WebhookPayload {
  return payload({ title: t('✓ Verbindung steht'), description: t('Ab jetzt meldet sich VibeDesk hier.'), color: COLOR.test })
}

/** Strenge Prüfung in Main – der Renderer darf nur Embeds in diesem Rahmen schicken. */
export function validPayload(p: unknown): p is WebhookPayload {
  if (!p || typeof p !== 'object') return false
  const o = p as WebhookPayload
  if (o.username !== 'VibeDesk' || o.avatar_url !== AVATAR || !Array.isArray(o.embeds) || o.embeds.length !== 1) return false
  if (!o.allowed_mentions || !Array.isArray(o.allowed_mentions.parse) || o.allowed_mentions.parse.length) return false
  return JSON.stringify(o).length <= 6000
}
