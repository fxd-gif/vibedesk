import { useEffect, useRef, useState } from 'react'
import { Icon } from '../desktop/icons'
import { collectVars, useDiscord } from '../store/discordStore'
import { useSettings } from '../store/settingsStore'
import { DEFAULT_CLIENT_ID, PLACEHOLDERS, presencePresets, renderPresence, type PresenceConfig } from '../../../shared/presence'
import { isWebhookUrl, testEmbed, type WebhookSettings } from '../../../shared/webhook'
import { api } from '../api'
import { sendRecap } from '../store/webhookStore'
import { t } from '../../../shared/i18n'

function useTick(ms = 1000): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(iv)
  }, [ms])
  return now
}

function clockOf(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

// ---------- Vorschau im Discord-Profil-Look ----------

function Preview({ cfg }: { cfg: PresenceConfig }): React.JSX.Element {
  const now = useTick()
  const { status, app } = useDiscord()
  const a = renderPresence(cfg, collectVars(now))
  const img = (key?: string): string | null => {
    if (!key) return null
    if (/^https?:\/\//.test(key)) return key
    return app?.assets.find((x) => x.name === key)?.url ?? null
  }
  const large = img(a.assets?.large_image) ?? app?.icon ?? null
  const small = img(a.assets?.small_image)
  const user = status.state === 'connected' ? status.user : null
  const avatar = user?.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : null
  const ts = a.timestamps
  const time = ts?.end ? t('noch {time}', { time: clockOf(ts.end - now) }) : ts?.start ? t('{time} vergangen', { time: clockOf(now - ts.start) }) : null

  return (
    <div className="dc-card">
      <div className="dc-banner" />
      <div className="dc-avatar">
        {avatar ? <img src={avatar} alt="" /> : <span>{(user?.globalName ?? user?.username ?? t('Du')).slice(0, 1).toUpperCase()}</span>}
        <i className="dc-online" />
      </div>
      <div className="dc-body">
        <div className="dc-name">{user?.globalName ?? user?.username ?? t('Dein Name')}</div>
        <div className="dc-user">{user ? user.username : t('Vorschau')}</div>
        <div className="dc-section">
          <div className="dc-label">{t('Spielt')}</div>
          <div className="dc-activity">
            <div className="dc-images">
              {large ? <img className="dc-large" src={large} alt="" title={a.assets?.large_text} /> : <div className="dc-large dc-fallback" title={a.assets?.large_text}><Icon name="rain" size={30} /></div>}
              {small && <img className="dc-small" src={small} alt="" title={a.assets?.small_text} />}
            </div>
            <div className="dc-texts">
              <b>{app?.name ?? 'VibeDesk'}</b>
              {a.details && <span>{a.details}</span>}
              {a.state && (
                <span>
                  {a.state}
                  {a.party && ` (${t('{n} von {max}', { n: a.party.size[0], max: a.party.size[1] })})`}
                </span>
              )}
              {time && <span className="dc-time">{time}</span>}
            </div>
          </div>
          {a.buttons?.map((b) => (
            <div key={b.label} className="dc-button" title={b.url}>
              {b.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------- Formular ----------

function Field({ label, value, onChange, onFocus, placeholder, testid }: { label: string; value: string; onChange(v: string): void; onFocus?(el: HTMLInputElement): void; placeholder?: string; testid?: string }): React.JSX.Element {
  return (
    <label className="dc-field">
      <span>{label}</span>
      <input className="field small" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onFocus={(e) => onFocus?.(e.currentTarget)} data-testid={testid} />
    </label>
  )
}

function Chips<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange(v: T): void }): React.JSX.Element {
  return (
    <div className="row chips">
      {options.map(([v, l]) => (
        <button key={v} className={`chip${value === v ? ' on' : ''}`} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  )
}

function Toggle({ label, on, onChange, disabled, testid }: { label: string; on: boolean; onChange(v: boolean): void; disabled?: boolean; testid?: string }): React.JSX.Element {
  return (
    <div className={`row between${disabled ? ' dim' : ''}`}>
      <span>{label}</span>
      <button className={`toggle${on ? ' on' : ''}`} role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)} data-testid={testid}>
        <i />
      </button>
    </div>
  )
}

// ---------- Webhook ----------

function WebhookSection(): React.JSX.Element | null {
  const s = useSettings((x) => x.s)
  const setSettings = useSettings((x) => x.set)
  const [draft, setDraft] = useState(s?.discordHook.url ?? '')
  const [show, setShow] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  if (!s) return null
  const hook = s.discordHook
  const set = (patch: Partial<WebhookSettings>): void => setSettings({ discordHook: { ...hook, ...patch } })
  const valid = isWebhookUrl(draft)
  const commit = (): void => {
    const url = draft.trim()
    if (url === hook.url) return
    if (url && !isWebhookUrl(url)) return setMsg({ ok: false, text: t('Das ist keine Discord-Webhook-URL (https://discord.com/api/webhooks/…).') })
    set({ url })
    setMsg(null)
  }
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string): Promise<void> => {
    commit()
    setBusy(true)
    const r = await fn().catch(() => ({ ok: false, error: t('Senden fehlgeschlagen.') }))
    setBusy(false)
    setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error ?? t('Senden fehlgeschlagen.') })
  }
  // im Streamer-Modus bleibt die URL immer verdeckt – wer sie kennt, kann in deinen Kanal schreiben
  const masked = s.streamer.enabled || !show

  return (
    <section data-testid="dc-webhook">
      <h4>{t('Benachrichtigungen per Webhook')}</h4>
      <div className="dim tiny">{t('Discord-Kanal → Bearbeiten → Integrationen → Webhooks → Neuer Webhook → „Webhook-URL kopieren“. Am besten ein privater Kanal nur für dich.')}</div>
      <div className="row">
        <input
          className="field small mono"
          style={{ flex: 1 }}
          type={masked ? 'password' : 'text'}
          placeholder="https://discord.com/api/webhooks/…"
          value={draft}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          data-testid="dc-webhook-url"
        />
        {!s.streamer.enabled && (
          <button className="btn small ghost" title={show ? t('Verbergen') : t('Anzeigen')} onClick={() => setShow(!show)}>
            <Icon name={show ? 'eyeoff' : 'eye'} size={13} />
          </button>
        )}
      </div>
      <Toggle label={t('Melden, wenn eine Session auf dich wartet')} on={hook.onWaiting} onChange={(v) => set({ onWaiting: v })} testid="dc-hook-waiting" />
      <Toggle label={t('… nur wenn ich nicht am Rechner bin')} on={hook.onlyAway} disabled={!hook.onWaiting} onChange={(v) => set({ onlyAway: v })} />
      <Toggle label={t('Tagesrückblick senden')} on={hook.recap} onChange={(v) => set({ recap: v })} testid="dc-hook-recap" />
      {hook.recap && (
        <label className="dc-field">
          <span>{t('ab')}</span>
          <select className="field small" value={hook.recapHour} onChange={(e) => set({ recapHour: Number(e.target.value), lastRecap: '' })}>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {t('{h}:00 Uhr', { h: String(h).padStart(2, '0') })}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="row">
        <button className="btn small ghost" disabled={!valid || busy} onClick={() => void run(() => api.discord.webhook('test', testEmbed()), t('Gesendet – schau in deinen Kanal.'))}>
          {t('Testnachricht')}
        </button>
        <button className="btn small ghost" disabled={!valid || busy} onClick={() => void run(() => sendRecap(true), t('Rückblick gesendet.'))}>
          {t('Rückblick jetzt senden')}
        </button>
      </div>
      {msg && <div className={`tiny ${msg.ok ? 'ok' : 'warn'}`}>{msg.text}</div>}
      <div className="dim tiny">{t('Gemeldet wird erst nach 20 Sekunden Warten und höchstens alle 5 Minuten pro Session. Im Privat- und Streamer-Modus ohne Projektnamen.')}</div>
    </section>
  )
}

export function DiscordWindow(): React.JSX.Element | null {
  const s = useSettings((x) => x.s)
  const setSettings = useSettings((x) => x.set)
  const { status, app, loadApp } = useDiscord()
  const lastField = useRef<{ el: HTMLInputElement; key: keyof PresenceConfig } | null>(null)
  const cfg = s?.discord
  const custom = cfg ? cfg.clientId !== DEFAULT_CLIENT_ID : false
  const [idDraft, setIdDraft] = useState(custom ? (cfg?.clientId ?? '') : '')

  useEffect(() => {
    if (cfg?.clientId) loadApp(cfg.clientId)
  }, [cfg?.clientId, loadApp])

  if (!s || !cfg) return null
  const set = (patch: Partial<PresenceConfig>): void => setSettings({ discord: { ...cfg, ...patch } })
  const textField = (key: 'details' | 'state' | 'idleDetails' | 'idleState' | 'largeText' | 'smallText', label: string) => (
    <Field label={label} value={cfg[key]} onChange={(v) => set({ [key]: v })} onFocus={(el) => (lastField.current = { el, key })} testid={`dc-${key}`} />
  )
  const insert = (ph: string): void => {
    const f = lastField.current
    const key = (f?.key ?? 'details') as 'details'
    const cur = String(cfg[key] ?? '')
    const pos = f?.el.selectionStart ?? cur.length
    set({ [key]: cur.slice(0, pos) + `{${ph}}` + cur.slice(pos) })
    setTimeout(() => f?.el.focus(), 0)
  }
  const badge =
    status.state === 'connected'
      ? { cls: 'ok', text: t('Verbunden als {name}', { name: status.user.globalName ?? status.user.username }) }
      : status.state === 'connecting'
        ? { cls: 'wait', text: t('Verbinde …') }
        : status.state === 'unavailable'
          ? { cls: 'err', text: status.reason }
          : { cls: '', text: t('Aus') }
  const buttons = [...cfg.buttons, { label: '', url: '' }, { label: '', url: '' }].slice(0, 2)

  return (
    <div className="dc">
      <div className="dc-form">
        <div className="row between">
          <div className="row">
            <button className={`toggle${cfg.enabled ? ' on' : ''}`} role="switch" aria-checked={cfg.enabled} onClick={() => set({ enabled: !cfg.enabled })} data-testid="dc-enable">
              <i />
            </button>
            <b>Rich Presence</b>
          </div>
          <span className={`dc-badge ${badge.cls}`}>{badge.text}</span>
        </div>

        <section>
          <h4>App</h4>
          <Chips
            value={custom ? 'custom' : 'hosted'}
            options={[
              ['hosted', t('VibeDesk (gehostet)')],
              ['custom', t('Eigene App-ID')]
            ]}
            onChange={(v) => set({ clientId: v === 'hosted' ? DEFAULT_CLIENT_ID : idDraft || cfg.clientId })}
          />
          {custom && (
            <input
              className="field small mono"
              placeholder={t('Application ID aus dem Discord Developer Portal')}
              value={idDraft}
              onChange={(e) => setIdDraft(e.target.value.replace(/\D/g, ''))}
              onBlur={() => idDraft && set({ clientId: idDraft })}
              onKeyDown={(e) => e.key === 'Enter' && idDraft && set({ clientId: idDraft })}
            />
          )}
          <div className="dim tiny">{t('Der App-Name ({name}) erscheint in Discord als „Spielt …“.', { name: app?.name ?? '…' })}</div>
        </section>

        <section>
          <h4>{t('Vorlage')}</h4>
          <div className="row chips">
            {presencePresets().map((p) => (
              <button key={p.id} className="chip" onClick={() => set(p.patch)}>
                {p.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h4>{t('Text')}</h4>
          {textField('details', t('Zeile 1'))}
          {textField('state', t('Zeile 2'))}
          {textField('idleDetails', t('Ohne Session · Zeile 1'))}
          {textField('idleState', t('Ohne Session · Zeile 2'))}
          <div className="row chips ph">
            {PLACEHOLDERS.map((p) => (
              <button key={p.key} className="chip" title={p.label} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(p.key)}>
                {`{${p.key}}`}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h4>{t('Bilder')}</h4>
          <Field label={t('Großes Bild')} value={cfg.largeImage} placeholder={t('leer = VibeDesk-Icon · Asset-Name · https://… · none')} onChange={(v) => set({ largeImage: v })} />
          {textField('largeText', t('Tooltip groß'))}
          <Field label={t('Kleines Bild')} value={cfg.smallImage} placeholder={t('Asset-Name oder https://…')} onChange={(v) => set({ smallImage: v })} />
          {textField('smallText', t('Tooltip klein'))}
          <Toggle label={t('Status als kleines Bild (arbeitet, wartet, Fokus …)')} on={cfg.statusIcons} disabled={!!cfg.smallImage.trim()} onChange={(v) => set({ statusIcons: v })} testid="dc-status-icons" />
          {app && app.assets.length > 0 ? (
            <div className="dc-assets">
              {app.assets.map((a) => (
                <button key={a.id} className="dc-asset" title={t('{name} – Klick: groß, Rechtsklick: klein', { name: a.name })} onClick={() => set({ largeImage: a.name })} onContextMenu={(e) => (e.preventDefault(), set({ smallImage: a.name }))}>
                  <img src={a.url} alt={a.name} />
                </button>
              ))}
            </div>
          ) : (
            <div className="dim tiny">{t('Diese App hat noch keine hochgeladenen Bilder – nutze eine Bild-URL oder lade sie im Developer Portal unter „Rich Presence → Art Assets“ hoch.')}</div>
          )}
        </section>

        <section>
          <h4>{t('Buttons (max. 2)')}</h4>
          <Toggle label={t('„VibeDesk holen“ zeigen, solange ein Platz frei ist')} on={cfg.promoButton !== false} onChange={(v) => set({ promoButton: v })} testid="dc-promo" />
          {buttons.map((b, i) => (
            <div key={i} className="row">
              <input
                className="field small"
                style={{ flex: 1 }}
                placeholder={t('Beschriftung')}
                value={b.label}
                maxLength={32}
                onChange={(e) => {
                  const next = [...buttons]
                  next[i] = { ...b, label: e.target.value }
                  set({ buttons: next.filter((x) => x.label || x.url) })
                }}
              />
              <input
                className="field small mono"
                style={{ flex: 2 }}
                placeholder="https://…"
                value={b.url}
                onChange={(e) => {
                  const next = [...buttons]
                  next[i] = { ...b, url: e.target.value }
                  set({ buttons: next.filter((x) => x.label || x.url) })
                }}
              />
            </div>
          ))}
          <div className="dim tiny">{t('Hinweis: Eigene Buttons sieht man bei dir selbst nicht, nur andere sehen sie.')}</div>
        </section>

        <section>
          <h4>{t('Zeit')}</h4>
          <Chips
            value={cfg.timestamp}
            options={[
              ['app', t('Seit App-Start')],
              ['session', t('Seit Session-Start')],
              ['focus', t('Fokus-Countdown')],
              ['none', t('Keine')]
            ]}
            onChange={(v) => set({ timestamp: v })}
          />
          <h4>{t('In der Mitgliederliste')}</h4>
          <Chips
            value={cfg.statusDisplay}
            options={[
              ['name', t('App-Name')],
              ['details', t('Zeile 1')],
              ['state', t('Zeile 2')]
            ]}
            onChange={(v) => set({ statusDisplay: v })}
          />
          <Toggle label={t('Projektnamen verbergen')} on={cfg.privacy} onChange={(v) => set({ privacy: v })} />
          <Toggle label={t('Lounge-Größe zeigen („2 von 16“)')} on={cfg.showParty} onChange={(v) => set({ showParty: v })} testid="dc-party" />
        </section>

        <WebhookSection />
      </div>
      <div className="dc-side">
        <div className="dim small" style={{ marginBottom: 8 }}>
          {t('Live-Vorschau')}
        </div>
        <Preview cfg={cfg} />
      </div>
    </div>
  )
}
