import { useEffect, useState } from 'react'
import { api } from '../api'
import { Icon } from '../desktop/icons'
import { internetOn, type CompanionSettings, type CompanionStatus } from '../../../shared/companion'
import { confirm } from '../store/dialogStore'
import { cancelPairing, revokeAllDevices, revokeDevice, startPairing, useCompanion } from '../store/companionStore'
import { useSettings } from '../store/settingsStore'
import { relTime } from '../util'
import { Toggle } from '../desktop/Toggle'
import { t } from '../../../shared/i18n'
import './companion.css'

const TUNNEL_TEXT = () =>
  ({
    off: '',
    installing: t('Richte den Internet-Link ein (einmalig, etwa eine Minute) …'),
    starting: t('Baue den Internet-Link auf …'),
    ready: t('Läuft – dein Handy erreicht VibeDesk von überall, ganz ohne App.'),
    error: t('Hat nicht geklappt.')
  }) as const

/** Handy von überall: Internet-Link über einen Cloudflare-Tunnel – am Handy reicht der Browser */
function InternetCard({ on, status, onChange }: { on: boolean; status: CompanionStatus; onChange(v: boolean): void }): React.JSX.Element {
  const net = status.running ? status.internet : undefined
  const state = on ? (net?.state ?? 'starting') : 'off'
  return (
    <div className={`comp-remote${state === 'ready' ? ' ok' : ''}`} data-testid="companion-internet">
      <Icon name="globe" size={16} />
      <div style={{ flex: 1 }}>
        <div className="row">
          <b>{t('Von überall – ohne App')}</b>
          <span style={{ flex: 1 }} />
          <Toggle label={t('Internet-Link')} on={on} onChange={onChange} />
        </div>
        {state === 'off' ? (
          <div className="dim small">
            {t(
              'Gibt dem Handy-Begleiter einen sicheren HTTPS-Link im Internet. Am Handy reicht der Browser, unterwegs im Mobilfunk genauso wie zu Hause. Ohne den Code von diesem Bildschirm kommt niemand hinein.'
            )}
          </div>
        ) : (
          <div className="dim small" data-testid="companion-internet-state">
            {state === 'error' ? (net?.error ?? TUNNEL_TEXT().error) : state === 'starting' && net?.error ? net.error : TUNNEL_TEXT()[state]}
          </div>
        )}
        {state === 'ready' && <div className="dim tiny">{t('Der Link bleibt, solange VibeDesk läuft. Nach einem Neustart gibt es einen neuen – dann einmal neu scannen und koppeln.')}</div>}
      </div>
    </div>
  )
}

function PairCode(): React.JSX.Element | null {
  const pairing = useCompanion((x) => x.pairing)
  const streaming = useSettings((x) => !!x.s?.streamer.enabled)
  const [, tick] = useState(0)
  useEffect(() => {
    if (!pairing) return
    const iv = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(iv)
  }, [pairing])
  if (!pairing) return null
  const left = Math.max(0, Math.ceil((pairing.expiresAt - Date.now()) / 1000))
  return (
    <div className="comp-code" data-testid="companion-code">
      <span className="dim small">{t('Code am Handy eingeben')}</span>
      {/* im Stream nicht lesbar – sonst koppelt sich ein Zuschauer */}
      <b className={streaming ? 'blurred' : ''}>
        {pairing.code.slice(0, 3)} {pairing.code.slice(3)}
      </b>
      <span className="dim tiny">
        {t('gilt noch {time} · nur einmal', { time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` })}
      </span>
      <button className="btn small ghost" onClick={cancelPairing}>
        {t('Abbrechen')}
      </button>
    </div>
  )
}

export function CompanionWindow(): React.JSX.Element {
  const s = useSettings((x) => x.s)
  const set = useSettings((x) => x.set)
  const status = useCompanion((x) => x.status)
  const busy = useCompanion((x) => x.busy)
  const devices = useCompanion((x) => x.devices)
  const pairing = useCompanion((x) => x.pairing)
  const [pick, setPick] = useState(0)
  if (!s) return <></>
  const c = s.companion
  const internet = internetOn(c)
  const patch = (p: Partial<CompanionSettings>): void => set({ companion: { ...c, ...p } })
  const links = status.running ? status.links : []
  const link = links[Math.min(pick, links.length - 1)]
  // „<url> öffnen.“ – im Englischen steht das Verb vorn
  const [openPre, openPost] = t('{url} öffnen.').split('{url}')

  const revokeAll = async (): Promise<void> => {
    const ok = await confirm({ title: t('Alle Handys abmelden?'), message: t('Jedes Handy muss sich danach mit einem neuen Code koppeln.'), confirmLabel: t('Alle abmelden') })
    if (ok) await revokeAllDevices()
  }

  return (
    <div className="panel companion">
      <div className={`streamer-hero${c.enabled ? ' on' : ''}`}>
        <Icon name="phone" size={22} />
        <div>
          <b>{t('Handy-Begleiter')}</b>
          <div className="dim small">
            {c.enabled ? t('Aktiv – gekoppelte Handys sehen deine Sessions und können Claude antworten.') : t('Freigaben erteilen, Vorschläge bekommen und Claude vom Sofa aus Aufträge geben.')}
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <Toggle label={t('Handy-Begleiter')} on={c.enabled} onChange={(v) => patch({ enabled: v })} />
      </div>

      {c.enabled && (
        <section className="st-sec">
          <h4>
            {t('Verbinden')}{' '}
            <span className={`badge ${status.running ? 'ok' : ''}`}>{status.running ? t('läuft auf Port {port}', { port: status.port }) : busy ? t('startet …') : (status.error ?? t('aus'))}</span>
          </h4>
          {status.running && <InternetCard on={internet} status={status} onChange={(v) => patch({ internet: v })} />}
          {status.running && !links.length && <div className="comp-warn">{t('Kein WLAN gefunden. Verbinde den PC mit demselben Netz wie dein Handy.')}</div>}
          {link && (
            <div className="comp-pair">
              <div className="comp-qr">
                <img alt={t('QR-Code für {url}', { url: link.url })} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(link.qr)}`} data-testid="companion-qr" />
              </div>
              <div className="comp-side">
                <ol className="comp-steps">
                  {link.via === 'internet' ? (
                    <li>
                      {t('Klappt überall – WLAN oder Mobilfunk.')} <span className="dim">{t('Keine App nötig, nur der Browser.')}</span>
                    </li>
                  ) : (
                    <li>{t('Handy ins selbe WLAN wie diesen PC.')}</li>
                  )}
                  <li>
                    {t('QR-Code mit der Kamera scannen')} <span className="dim">{t('oder')}</span> {openPre}
                    <code className="mono">{link.url}</code>
                    {openPost}
                  </li>
                  <li>{t('Hier auf „Handy koppeln“ tippen und den Code am Handy eingeben.')}</li>
                  <li className="dim">
                    {link.via === 'internet'
                      ? t('Tipp: Am Handy „Zum Startbildschirm hinzufügen“ – dann ist VibeDesk wie eine App da.')
                      : t('Fragt Windows nach der Firewall: Zugriff für private Netzwerke erlauben.')}
                  </li>
                </ol>
                {pairing ? (
                  <PairCode />
                ) : (
                  <button className="btn primary" onClick={() => void startPairing()} data-testid="companion-pair">
                    {t('Handy koppeln')}
                  </button>
                )}
              </div>
            </div>
          )}
          {links.length > 1 && (
            <div className="row chips">
              <span className="dim small">{t('Netz:')}</span>
              {links.map((l, i) => (
                <button key={l.ip} className={`chip${i === pick ? ' on' : ''}`} onClick={() => setPick(i)} title={l.ip}>
                  {l.via === 'internet' ? t('Überall (Internet)') : t('WLAN · {ip}', { ip: l.ip })}
                </button>
              ))}
            </div>
          )}
          <div className="row">
            <span className="small">Port</span>
            <input
              className="field small mono port"
              type="number"
              min={1024}
              max={65535}
              defaultValue={c.port}
              onBlur={(e) => {
                const p = Number(e.target.value)
                if (Number.isInteger(p) && p >= 1024 && p <= 65535 && p !== c.port) patch({ port: p })
              }}
            />
          </div>
          <div className="dim tiny">{t('Solange der Begleiter läuft, geht der PC nicht in den Standby (der Bildschirm darf aus). Ausschalten oder schlafen legen kannst du ihn vom Handy.')}</div>
        </section>
      )}

      {c.enabled && (
        <section className="st-sec">
          <h4>
            {t('Gekoppelte Handys')} <span className="badge ok">{devices.length}</span>
          </h4>
          {!devices.length && <div className="dim small">{t('Noch keins – koppeln geht nur mit dem Code von diesem Bildschirm.')}</div>}
          {devices.map((d) => (
            <div key={d.id} className="row between opt comp-dev">
              <span>
                <Icon name="phone" size={14} /> {d.name}
                <span className="dim small opt-hint">{t('gekoppelt {time}', { time: relTime(d.created) })}</span>
              </span>
              <button className="btn small ghost" onClick={() => void revokeDevice(d.id)}>
                {t('Abmelden')}
              </button>
            </div>
          ))}
          {devices.length > 1 && (
            <div className="row">
              <span style={{ flex: 1 }} />
              <button className="btn small ghost" onClick={() => void revokeAll()}>
                {t('Alle abmelden')}
              </button>
            </div>
          )}
          <div className="dim tiny">
            {internet
              ? t('Der Internet-Link ist öffentlich, aber ohne Code vom PC-Bildschirm kommt niemand hinein. Verlorenes Handy? Hier abmelden.')
              : t('Nur im eigenen WLAN nutzen – in Café-, Uni- oder Hotelnetzen lieber ausschalten.')}
          </div>
        </section>
      )}

      <section className="st-sec">
        <h4>{t('Auf dem Handy')}</h4>
        <ul className="comp-feat">
          <li>
            <b>{t('Freigaben')}</b> {t('erlauben oder ablehnen, wenn Claude fragt – das Handy vibriert.')}
          </li>
          <li>
            <b>{t('Wie geht es weiter?')}</b> {t('Ist Claude fertig, schlägt es drei nächste Schritte vor – ein Tipp schickt sie los.')}
          </li>
          <li>
            <b>{t('Eigene Idee')}</b> {t('kurz eintippen: Claude formuliert daraus einen guten Prompt und schickt ihn in die gewählte Session.')}
          </li>
          <li>
            <b>{t('Status & Mitteilungen')}</b> {t('aller Sessions, inklusive Claudes letzter Antwort – und den PC ausschalten.')}
          </li>
        </ul>
        <div className="dim tiny">{t('Ausformulieren und Vorschläge laufen kurz über Claude Haiku mit deinem Abo – ohne API-Key.')}</div>
      </section>

      <section className="st-sec">
        <h4>{t('Freigaben')}</h4>
        <div className="row between opt">
          <span>
            {t('Freigaben in VibeDesk beantworten')}
            <span className="dim small opt-hint">{t('Karte mit Erlauben · Immer · Ablehnen – am PC und auf dem Handy')}</span>
          </span>
          <Toggle label={t('Freigaben in VibeDesk beantworten')} on={s.approvalsOn} onChange={(v) => set({ approvalsOn: v })} />
        </div>
        <div className="dim tiny">{t('Aus: Claude fragt wie gewohnt nur im Terminal. Die Karte hat auch „Im Terminal“, falls du dort antworten willst.')}</div>
      </section>
    </div>
  )
}
