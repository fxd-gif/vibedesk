import { t, tn } from '../../shared/i18n'

export function relTime(ts: number | null, now = Date.now()): string {
  if (!ts) return t('nie geöffnet')
  const s = Math.round((now - ts) / 1000)
  if (s < 45) return t('gerade eben')
  const m = Math.round(s / 60)
  if (m < 60) return t('vor {n} Min.', { n: m })
  const h = Math.round(m / 60)
  if (h < 24) return t('vor {n} Std.', { n: h })
  const d = Math.round(h / 24)
  return d === 1 ? t('gestern') : tn(d, 'vor {n} Tag', 'vor {n} Tagen')
}

export function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function shortenPath(p: string, max = 44): string {
  return p.length <= max ? p : '…' + p.slice(p.length - max + 1)
}
