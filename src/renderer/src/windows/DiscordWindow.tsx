import { useEffect, useRef, useState } from 'react'
import { Icon } from '../desktop/icons'
import { collectVars, useDiscord } from '../store/discordStore'
import { useSettings } from '../store/settingsStore'
import { DEFAULT_CLIENT_ID, PLACEHOLDERS, PRESENCE_PRESETS, renderPresence, type PresenceConfig } from '../../../shared/presence'

function useTick(ms = 1000): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
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
  const time = ts?.end ? `noch ${clockOf(ts.end - now)}` : ts?.start ? `${clockOf(now - ts.start)} vergangen` : null

  return (
    <div className="dc-card">
      <div className="dc-banner" />
      <div className="dc-avatar">
        {avatar ? <img src={avatar} alt="" /> : <span>{(user?.globalName ?? user?.username ?? 'Du').slice(0, 1).toUpperCase()}</span>}
        <i className="dc-online" />
      </div>
      <div className="dc-body">
        <div className="dc-name">{user?.globalName ?? user?.username ?? 'Dein Name'}</div>
        <div className="dc-user">{user ? user.username : 'Vorschau'}</div>
        <div className="dc-section">
          <div className="dc-label">Spielt</div>
          <div className="dc-activity">
            <div className="dc-images">
              {large ? <img className="dc-large" src={large} alt="" title={a.assets?.large_text} /> : <div className="dc-large dc-fallback" title={a.assets?.large_text}><Icon name="rain" size={30} /></div>}
              {small && <img className="dc-small" src={small} alt="" title={a.assets?.small_text} />}
            </div>
            <div className="dc-texts">
              <b>{app?.name ?? 'VibeDesk'}</b>
              {a.details && <span>{a.details}</span>}
              {a.state && <span>{a.state}</span>}
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
      ? { cls: 'ok', text: `Verbunden als ${status.user.globalName ?? status.user.username}` }
      : status.state === 'connecting'
        ? { cls: 'wait', text: 'Verbinde …' }
        : status.state === 'unavailable'
          ? { cls: 'err', text: status.reason }
          : { cls: '', text: 'Aus' }
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
              ['hosted', 'VibeDesk (gehostet)'],
              ['custom', 'Eigene App-ID']
            ]}
            onChange={(v) => set({ clientId: v === 'hosted' ? DEFAULT_CLIENT_ID : idDraft || cfg.clientId })}
          />
          {custom && (
            <input
              className="field small mono"
              placeholder="Application ID aus dem Discord Developer Portal"
              value={idDraft}
              onChange={(e) => setIdDraft(e.target.value.replace(/\D/g, ''))}
              onBlur={() => idDraft && set({ clientId: idDraft })}
              onKeyDown={(e) => e.key === 'Enter' && idDraft && set({ clientId: idDraft })}
            />
          )}
          <div className="dim tiny">Der App-Name ({app?.name ?? '…'}) erscheint in Discord als „Spielt …“.</div>
        </section>

        <section>
          <h4>Vorlage</h4>
          <div className="row chips">
            {PRESENCE_PRESETS.map((p) => (
              <button key={p.id} className="chip" onClick={() => set(p.patch)}>
                {p.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h4>Text</h4>
          {textField('details', 'Zeile 1')}
          {textField('state', 'Zeile 2')}
          {textField('idleDetails', 'Ohne Session · Zeile 1')}
          {textField('idleState', 'Ohne Session · Zeile 2')}
          <div className="row chips ph">
            {PLACEHOLDERS.map((p) => (
              <button key={p.key} className="chip" title={p.label} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(p.key)}>
                {`{${p.key}}`}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h4>Bilder</h4>
          <Field label="Großes Bild" value={cfg.largeImage} placeholder="leer = VibeDesk-Icon · Asset-Name · https://… · none" onChange={(v) => set({ largeImage: v })} />
          {textField('largeText', 'Tooltip groß')}
          <Field label="Kleines Bild" value={cfg.smallImage} placeholder="Asset-Name oder https://…" onChange={(v) => set({ smallImage: v })} />
          {textField('smallText', 'Tooltip klein')}
          {app && app.assets.length > 0 ? (
            <div className="dc-assets">
              {app.assets.map((a) => (
                <button key={a.id} className="dc-asset" title={`${a.name} – Klick: groß, Rechtsklick: klein`} onClick={() => set({ largeImage: a.name })} onContextMenu={(e) => (e.preventDefault(), set({ smallImage: a.name }))}>
                  <img src={a.url} alt={a.name} />
                </button>
              ))}
            </div>
          ) : (
            <div className="dim tiny">Diese App hat noch keine hochgeladenen Bilder – nutze eine Bild-URL oder lade sie im Developer Portal unter „Rich Presence → Art Assets“ hoch.</div>
          )}
        </section>

        <section>
          <h4>Buttons (max. 2)</h4>
          {buttons.map((b, i) => (
            <div key={i} className="row">
              <input
                className="field small"
                style={{ flex: 1 }}
                placeholder="Beschriftung"
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
          <div className="dim tiny">Hinweis: Eigene Buttons sieht man bei dir selbst nicht, nur andere sehen sie.</div>
        </section>

        <section>
          <h4>Zeit</h4>
          <Chips
            value={cfg.timestamp}
            options={[
              ['app', 'Seit App-Start'],
              ['session', 'Seit Session-Start'],
              ['focus', 'Fokus-Countdown'],
              ['none', 'Keine']
            ]}
            onChange={(v) => set({ timestamp: v })}
          />
          <h4>In der Mitgliederliste</h4>
          <Chips
            value={cfg.statusDisplay}
            options={[
              ['name', 'App-Name'],
              ['details', 'Zeile 1'],
              ['state', 'Zeile 2']
            ]}
            onChange={(v) => set({ statusDisplay: v })}
          />
          <div className="row between">
            <span>Projektnamen verbergen</span>
            <button className={`toggle${cfg.privacy ? ' on' : ''}`} role="switch" aria-checked={cfg.privacy} onClick={() => set({ privacy: !cfg.privacy })}>
              <i />
            </button>
          </div>
        </section>
      </div>
      <div className="dc-side">
        <div className="dim small" style={{ marginBottom: 8 }}>
          Live-Vorschau
        </div>
        <Preview cfg={cfg} />
      </div>
    </div>
  )
}
