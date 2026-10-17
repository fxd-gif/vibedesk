import { useEffect, useState } from 'react'
import { api } from '../api'
import { Icon } from '../desktop/icons'
import type { CompanionSettings } from '../../../shared/companion'
import { confirm } from '../store/dialogStore'
import { cancelPairing, revokeAllDevices, revokeDevice, startPairing, useCompanion } from '../store/companionStore'
import { useSettings } from '../store/settingsStore'
import { relTime } from '../util'
import { Toggle } from './AmbienceMenu'
import './companion.css'

const TAILSCALE_URL = 'https://tailscale.com/download'

/** Zugang von unterwegs: erklärt, was für Tailscale noch fehlt */
function RemoteHint({ state }: { state: 'missing' | 'stopped' }): React.JSX.Element {
  const [checking, setChecking] = useState(false)
  const [setup, setSetup] = useState<'idle' | 'busy' | 'login' | 'failed'>('idle')
  const recheck = async (): Promise<void> => {
    setChecking(true)
    useCompanion.setState({ status: await api.companion.status() })
    setChecking(false)
  }
  const runSetup = async (): Promise<void> => {
    setSetup('busy')
    const ok = await api.companion.setupTailscale()
    setSetup(ok ? 'login' : 'failed')
    await recheck()
  }
  return (
    <div className="comp-remote" data-testid="companion-remote">
      <Icon name="globe" size={16} />
      <div>
        <b>Auch von unterwegs?</b>
        {state === 'missing' ? (
          <div className="dim small">
            Mit Tailscale (kostenlos) erreichst du VibeDesk überall – über ein privates, verschlüsseltes Netz nur zwischen deinen Geräten. Dein PC wird dabei nicht offen ins Internet gestellt.
            Installiere Tailscale auf diesem PC und auf dem Handy und melde dich auf beiden mit demselben Konto an.
          </div>
        ) : (
          <div className="dim small">Tailscale ist installiert, aber nicht verbunden. Öffne Tailscale (Symbol unten rechts) und melde dich an.</div>
        )}
        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn small primary" disabled={setup === 'busy'} onClick={() => void runSetup()} data-testid="companion-tailscale">
            {setup === 'busy' ? (state === 'missing' ? 'Installiere Tailscale …' : 'Verbinde …') : state === 'missing' ? 'Tailscale installieren' : 'Bei Tailscale anmelden'}
          </button>
          {state === 'missing' && (
            <button className="btn small ghost" onClick={() => api.openExternal(TAILSCALE_URL)}>
              Selbst herunterladen
            </button>
          )}
          <button className="btn small ghost" disabled={checking} onClick={() => void recheck()}>
            {checking ? 'Prüfe …' : 'Erneut prüfen'}
          </button>
        </div>
        {setup === 'busy' && state === 'missing' && <div className="dim small">Fragt Windows nach Administratorrechten, bitte bestätigen. Das dauert etwa eine Minute.</div>}
        {setup === 'login' && <div className="dim small">Melde dich im Browser bei Tailscale an und tippe danach auf „Erneut prüfen“. Aufs Handy kommt die Tailscale-App mit demselben Konto.</div>}
        {setup === 'failed' && <div className="dim small">Das hat nicht geklappt. Lade Tailscale selbst herunter oder öffne die Tailscale-App und melde dich dort an.</div>}
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
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [pairing])
  if (!pairing) return null
  const left = Math.max(0, Math.ceil((pairing.expiresAt - Date.now()) / 1000))
  return (
    <div className="comp-code" data-testid="companion-code">
      <span className="dim small">Code am Handy eingeben</span>
      {/* im Stream nicht lesbar – sonst koppelt sich ein Zuschauer */}
      <b className={streaming ? 'blurred' : ''}>
        {pairing.code.slice(0, 3)} {pairing.code.slice(3)}
      </b>
      <span className="dim tiny">
        gilt noch {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} · nur einmal
      </span>
      <button className="btn small ghost" onClick={cancelPairing}>
        Abbrechen
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
  const patch = (p: Partial<CompanionSettings>): void => set({ companion: { ...c, ...p } })
  const links = status.running ? status.links : []
  const link = links[Math.min(pick, links.length - 1)]

  const revokeAll = async (): Promise<void> => {
    const ok = await confirm({ title: 'Alle Handys abmelden?', message: 'Jedes Handy muss sich danach mit einem neuen Code koppeln.', confirmLabel: 'Alle abmelden' })
    if (ok) await revokeAllDevices()
  }

  return (
    <div className="panel companion">
      <div className={`streamer-hero${c.enabled ? ' on' : ''}`}>
        <Icon name="phone" size={22} />
        <div>
          <b>Handy-Begleiter</b>
          <div className="dim small">
            {c.enabled ? 'Aktiv – gekoppelte Handys sehen deine Sessions und können Claude antworten.' : 'Freigaben erteilen, Vorschläge bekommen und Claude vom Sofa aus Aufträge geben.'}
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <Toggle label="Handy-Begleiter" on={c.enabled} onChange={(v) => patch({ enabled: v })} />
      </div>

      {c.enabled && (
        <section className="st-sec">
          <h4>
            Verbinden{' '}
            <span className={`badge ${status.running ? 'ok' : ''}`}>{status.running ? `läuft auf Port ${status.port}` : busy ? 'startet …' : (status.error ?? 'aus')}</span>
          </h4>
          {status.running && !links.length && <div className="comp-warn">Kein WLAN gefunden. Verbinde den PC mit demselben Netz wie dein Handy.</div>}
          {link && (
            <div className="comp-pair">
              <div className="comp-qr">
                <img alt={`QR-Code für ${link.url}`} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(link.qr)}`} data-testid="companion-qr" />
              </div>
              <div className="comp-side">
                <ol className="comp-steps">
                  {link.via === 'tailscale' ? (
                    <li>
                      Tailscale-App aufs Handy und mit demselben Konto anmelden. <span className="dim">Dann klappt es zu Hause und unterwegs.</span>
                    </li>
                  ) : (
                    <li>Handy ins selbe WLAN wie diesen PC.</li>
                  )}
                  <li>
                    QR-Code mit der Kamera scannen <span className="dim">oder</span> <code className="mono">{link.url}</code> öffnen.
                  </li>
                  <li>Hier auf „Handy koppeln“ tippen und den Code am Handy eingeben.</li>
                  <li className="dim">
                    {link.via === 'tailscale'
                      ? 'Lädt die Seite am Handy nicht: In der Windows-Firewall VibeDesk für das Tailscale-Netz erlauben (Windows führt es meist als privates Netz).'
                      : 'Fragt Windows nach der Firewall: Zugriff für private Netzwerke erlauben.'}
                  </li>
                </ol>
                {pairing ? (
                  <PairCode />
                ) : (
                  <button className="btn primary" onClick={() => void startPairing()} data-testid="companion-pair">
                    Handy koppeln
                  </button>
                )}
              </div>
            </div>
          )}
          {links.length > 1 && (
            <div className="row chips">
              <span className="dim small">Netz:</span>
              {links.map((l, i) => (
                <button key={l.ip} className={`chip${i === pick ? ' on' : ''}`} onClick={() => setPick(i)} title={l.name ?? l.ip}>
                  {l.via === 'tailscale' ? 'Überall (Tailscale)' : `WLAN · ${l.ip}`}
                </button>
              ))}
            </div>
          )}
          {status.running && status.remote !== 'ready' && <RemoteHint state={status.remote} />}
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
          <div className="dim tiny">Solange der Begleiter läuft, geht der PC nicht in den Standby (der Bildschirm darf aus). Ausschalten oder schlafen legen kannst du ihn vom Handy.</div>
        </section>
      )}

      {c.enabled && (
        <section className="st-sec">
          <h4>
            Gekoppelte Handys <span className="badge ok">{devices.length}</span>
          </h4>
          {!devices.length && <div className="dim small">Noch keins – koppeln geht nur mit dem Code von diesem Bildschirm.</div>}
          {devices.map((d) => (
            <div key={d.id} className="row between opt comp-dev">
              <span>
                <Icon name="phone" size={14} /> {d.name}
                <span className="dim small opt-hint">gekoppelt {relTime(d.created)}</span>
              </span>
              <button className="btn small ghost" onClick={() => void revokeDevice(d.id)}>
                Abmelden
              </button>
            </div>
          ))}
          {devices.length > 1 && (
            <div className="row">
              <span style={{ flex: 1 }} />
              <button className="btn small ghost" onClick={() => void revokeAll()}>
                Alle abmelden
              </button>
            </div>
          )}
          <div className="dim tiny">Nur im eigenen WLAN nutzen – in Café-, Uni- oder Hotelnetzen lieber ausschalten.</div>
        </section>
      )}

      <section className="st-sec">
        <h4>Auf dem Handy</h4>
        <ul className="comp-feat">
          <li>
            <b>Freigaben</b> erlauben oder ablehnen, wenn Claude fragt – das Handy vibriert.
          </li>
          <li>
            <b>Wie geht es weiter?</b> Ist Claude fertig, schlägt es drei nächste Schritte vor – ein Tipp schickt sie los.
          </li>
          <li>
            <b>Eigene Idee</b> kurz eintippen: Claude formuliert daraus einen guten Prompt und schickt ihn in die gewählte Session.
          </li>
          <li>
            <b>Status &amp; Mitteilungen</b> aller Sessions, inklusive Claudes letzter Antwort – und den PC ausschalten.
          </li>
        </ul>
        <div className="dim tiny">Ausformulieren und Vorschläge laufen kurz über Claude Haiku mit deinem Abo – ohne API-Key.</div>
      </section>

      <section className="st-sec">
        <h4>Freigaben</h4>
        <div className="row between opt">
          <span>
            Freigaben in VibeDesk beantworten
            <span className="dim small opt-hint">Karte mit Erlauben · Immer · Ablehnen – am PC und auf dem Handy</span>
          </span>
          <Toggle label="Freigaben in VibeDesk beantworten" on={s.approvalsOn} onChange={(v) => set({ approvalsOn: v })} />
        </div>
        <div className="dim tiny">Aus: Claude fragt wie gewohnt nur im Terminal. Die Karte hat auch „Im Terminal“, falls du dort antworten willst.</div>
      </section>
    </div>
  )
}
