import { useState } from 'react'
import { api } from '../api'
import { Icon } from '../desktop/icons'
import { OVERLAY_WIDGETS, overlayUrl } from '../../../shared/overlay'
import { normalizeChannel, validChannel } from '../../../shared/twitch'
import type { StreamerSettings } from '../../../shared/types'
import { choose, confirm } from '../store/dialogStore'
import { useSessions } from '../store/sessionStore'
import { useSettings } from '../store/settingsStore'
import { acceptSuggestion, dropSuggestion, newOverlayToken, sortedQueue, toggleCurtain, useStreamer } from '../store/streamerStore'
import { clearAllTerminals } from '../store/terminals'
import { Toggle } from '../desktop/Toggle'
import { t } from '../../../shared/i18n'

function Opt({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange(v: boolean): void }): React.JSX.Element {
  return (
    <div className="row between opt">
      <span>
        {label}
        {hint && <span className="dim small opt-hint">{hint}</span>}
      </span>
      <Toggle label={label} on={on} onChange={onChange} />
    </div>
  )
}

export function StreamerWindow(): React.JSX.Element {
  const s = useSettings((x) => x.s)
  const set = useSettings((x) => x.set)
  const overlay = useStreamer((x) => x.overlay)
  const twitch = useStreamer((x) => x.twitch)
  const queue = useStreamer((x) => x.queue)
  const sessions = useSessions((x) => x.sessions)
  const [widgets, setWidgets] = useState<string[]>(OVERLAY_WIDGETS.map((w) => w.id))
  const [showUrl, setShowUrl] = useState(false)
  const [copied, setCopied] = useState(false)
  const [channel, setChannel] = useState(s?.streamer.twitchChannel ?? '')
  if (!s) return <></>
  const c = s.streamer
  const patch = (p: Partial<StreamerSettings>): void => set({ streamer: { ...c, ...p } })

  const toggle = async (on: boolean): Promise<void> => {
    if (on && sessions.length) {
      const r = await choose({
        title: t('Streamer-Modus einschalten'),
        message: t('Ab jetzt wird neue Terminal-Ausgabe geschwärzt. Was schon im Terminal steht, bleibt sichtbar – vor dem Livegehen leeren?'),
        confirmLabel: t('Terminals leeren'),
        altLabel: t('So lassen')
      })
      if (r === 'cancel') return
      if (r === 'ok') clearAllTerminals()
    }
    patch({ enabled: on })
  }

  const url = overlayUrl(c.overlayPort, c.overlayToken, widgets, c.overlayCredit !== false)
  const shownUrl = showUrl ? url : url.replace(c.overlayToken, '•'.repeat(12))
  const twitchText =
    twitch.state === 'connected' ? t('verbunden mit #{channel}', { channel: twitch.channel }) : twitch.state === 'connecting' ? t('verbinde …') : twitch.state === 'error' ? twitch.message : t('aus')

  return (
    <div className="panel streamer">
      <div className={`streamer-hero${c.enabled ? ' on' : ''}`}>
        <Icon name="broadcast" size={22} />
        <div>
          <b>{t('Streamer-Modus')}</b>
          <div className="dim small">{c.enabled ? t('Aktiv – Secrets und private Daten werden verborgen.') : t('Für Streams & Aufnahmen: schützt deine Daten und liefert ein OBS-Overlay.')}</div>
        </div>
        <span style={{ flex: 1 }} />
        <Toggle label={t('Streamer-Modus')} on={c.enabled} onChange={toggle} />
      </div>

      <section className="st-sec">
        <h4>{t('Schutz')}</h4>
        <div className="dim small">{t('Immer an: API-Keys, Tokens, Passwörter und private Schlüssel werden in Terminal, Live-Feed und Overlay geschwärzt (bestmöglich – bleib trotzdem vorsichtig).')}</div>
        <Opt label={t('Benutzername in Pfaden verbergen')} hint="C:\Users\•••••" on={c.hidePaths} onChange={(v) => patch({ hidePaths: v })} />
        <Opt label={t('E-Mail-Adressen verbergen')} hint={t('z. B. aus git log')} on={c.maskEmails} onChange={(v) => patch({ maskEmails: v })} />
        <Opt label={t('Notizen verdecken')} on={c.hideNotes} onChange={(v) => patch({ hideNotes: v })} />
        <Opt label={t('Sensible Dateien im Editor sperren')} hint={t('.env, Schlüssel, Zugangsdaten')} on={c.protectFiles} onChange={(v) => patch({ protectFiles: v })} />
        <div className="row between opt">
          <span>
            {t('Vorhang')} <span className="dim small opt-hint">{t('verdeckt sofort alles – auch als „Gleich zurück“-Bild')}</span>
          </span>
          <button className="btn small" onClick={() => toggleCurtain(true)}>
            <kbd>{t('Strg')}</kbd>+<kbd>{t('Umschalt')}</kbd>+<kbd>H</kbd>
          </button>
        </div>
      </section>

      <section className="st-sec">
        <h4>
          OBS-Overlay{' '}
          <span className={`badge ${overlay.running ? 'ok' : ''}`}>{overlay.running ? t('läuft auf Port {port}', { port: overlay.port }) : c.enabled ? (overlay.error ?? t('startet …')) : t('aus')}</span>
        </h4>
        <div className="dim small">{t('In OBS: Quelle hinzufügen → Browser → URL einfügen, Breite 1920, Höhe 1080. Zeigt Status, Plan, Live-Feed, Fokus-Timer und übernommene Chat-Vorschläge.')}</div>
        <div className="row chips">
          {OVERLAY_WIDGETS.map((w) => (
            <button key={w.id} className={`chip${widgets.includes(w.id) ? ' on' : ''}`} onClick={() => setWidgets(widgets.includes(w.id) ? widgets.filter((x) => x !== w.id) : [...widgets, w.id])}>
              {w.label}
            </button>
          ))}
        </div>
        <div className="row">
          <code className="field small mono overlay-url" title={showUrl ? url : t('Enthält einen geheimen Schlüssel')}>
            {shownUrl}
          </code>
          <button className="btn small ghost" onClick={() => setShowUrl(!showUrl)}>
            {showUrl ? t('verbergen') : t('zeigen')}
          </button>
          <button
            className="btn small primary"
            disabled={!widgets.length}
            onClick={() => {
              api.clipboard.write(url)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
          >
            {copied ? t('Kopiert ✓') : t('Kopieren')}
          </button>
        </div>
        <div className="dim tiny">{t('Tipp: &align=right setzt das Overlay nach rechts, &scale=1.5 macht es größer. Die URL nie im Stream zeigen.')}</div>
        <Opt label={t('Kosten im Overlay zeigen')} on={c.overlayCost} onChange={(v) => patch({ overlayCost: v })} />
        <Opt label={t('Bash-Befehle im Overlay zeigen')} hint={t('sonst nur „Bash“')} on={c.overlayBash} onChange={(v) => patch({ overlayBash: v })} />
        <Opt label={t('„made with VibeDesk“ unter dem Overlay')} hint={t('eine kleine Zeile – so finden Zuschauer VibeDesk')} on={c.overlayCredit !== false} onChange={(v) => patch({ overlayCredit: v })} />
        <div className="row">
          <span className="small">Port</span>
          <input
            className="field small mono port"
            type="number"
            min={1024}
            max={65535}
            defaultValue={c.overlayPort}
            onBlur={(e) => {
              const p = Number(e.target.value)
              if (Number.isInteger(p) && p >= 1024 && p <= 65535 && p !== c.overlayPort) patch({ overlayPort: p })
            }}
          />
          <span style={{ flex: 1 }} />
          <button
            className="btn small ghost"
            onClick={async () => {
              if (await confirm({ title: t('Neuen Overlay-Schlüssel erzeugen?'), message: t('Die alte URL funktioniert danach nicht mehr – in OBS musst du die neue eintragen. Sinnvoll, falls die URL mal im Stream zu sehen war.'), confirmLabel: t('Erneuern') }))
                patch({ overlayToken: newOverlayToken() })
            }}
          >
            {t('Schlüssel erneuern')}
          </button>
        </div>
      </section>

      <section className="st-sec">
        <h4>
          {t('Twitch-Chat-Vorschläge')} <span className={`badge ${twitch.state === 'connected' ? 'ok' : ''}`}>{c.enabled ? twitchText : t('Streamer-Modus aus')}</span>
        </h4>
        <div className="dim small">
          {t('Zuschauer schreiben')} <code>{t('{cmd} mach den Header lila', { cmd: c.chatCommand || '!vibe' })}</code>{' '}
          {t('– gleiche Ideen sammeln Stimmen. Du entscheidest: „Einfügen“ setzt den Text nur ins Terminal, abschicken musst du selbst. Nur lesend, kein Login nötig.')}
        </div>
        <div className="row">
          <input
            className="field small"
            placeholder={t('Twitch-Kanal, z. B. deinname')}
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            onBlur={() => patch({ twitchChannel: normalizeChannel(channel) })}
            onKeyDown={(e) => e.key === 'Enter' && patch({ twitchChannel: normalizeChannel(channel) })}
          />
          <input className="field small mono cmd" value={c.chatCommand} maxLength={20} onChange={(e) => patch({ chatCommand: e.target.value.replace(/\s/g, '') })} title={t('Befehl')} />
        </div>
        {channel && !validChannel(normalizeChannel(channel)) && <div className="warn small">{t('Ungültiger Kanalname.')}</div>}
        <Opt label={t('Nur Mods, VIPs und Subs')} on={c.chatModsOnly} onChange={(v) => patch({ chatModsOnly: v })} />
        {queue.length > 0 && (
          <>
            <div className="warnbox small">{t('Lies jeden Vorschlag, bevor du ihn abschickst – Chat kann versuchen, Claude zu Unsinn zu überreden (z. B. Dateien löschen oder Secrets ausgeben).')}</div>
            <ul className="plist suggest">
              {sortedQueue(queue).map((q) => (
                <li key={q.id} className="pitem">
                  <span className="votes" title={t('Stimmen')}>
                    {q.voters.length}
                  </span>
                  <div className="pinfo">
                    <div className="suggest-text">{q.text}</div>
                    <div className="dim small">@{q.by}</div>
                  </div>
                  <button className="btn small primary" disabled={!sessions.length} onClick={() => acceptSuggestion(q)} title={t('Ins aktive Terminal einfügen (nicht abschicken)')}>
                    {t('Einfügen')}
                  </button>
                  <button className="btn small ghost" title={t('Verwerfen')} onClick={() => dropSuggestion(q.id)}>
                    <Icon name="trash" size={13} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}

/** Vorhang: verdeckt den ganzen Bildschirm, bis er wieder geöffnet wird. */
export function Curtain(): React.JSX.Element | null {
  const on = useStreamer((x) => x.curtain)
  if (!on) return null
  return (
    <div className="curtain" data-testid="curtain">
      <div className="curtain-box">
        <div className="curtain-emoji">☕</div>
        <div className="curtain-title">{t('Gleich zurück')}</div>
        <button className="btn small ghost" onClick={() => toggleCurtain(false)}>
          {t('Öffnen · Strg+Umschalt+H')}
        </button>
      </div>
    </div>
  )
}

/** Kleines Abzeichen oben, solange der Streamer-Modus läuft. */
export function StreamerPill({ onClick }: { onClick(): void }): React.JSX.Element | null {
  const on = useSettings((x) => !!x.s?.streamer.enabled)
  if (!on) return null
  return (
    <button className="streamer-pill" onClick={onClick} data-testid="streamer-pill">
      <i /> {t('Streamer-Modus')}
    </button>
  )
}
