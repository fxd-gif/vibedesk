import { useState } from 'react'
import { api } from '../api'
import { Icon } from '../desktop/icons'
import { INFO_COMMAND, lookOf, OVERLAY_WIDGETS, overlayUrl, type OverlayLook } from '../../../shared/overlay'
import { normalizeChannel, validChannel } from '../../../shared/twitch'
import type { StreamerSettings } from '../../../shared/types'
import { choose, confirm } from '../store/dialogStore'
import { useSessions } from '../store/sessionStore'
import { useSettings } from '../store/settingsStore'
import { acceptSuggestion, dropSuggestion, newOverlayToken, sortedQueue, toggleCurtain, useStreamer } from '../store/streamerStore'
import { clearAllTerminals } from '../store/terminals'
import { Toggle } from '../desktop/Toggle'
import { t } from '../../../shared/i18n'

/** Auswahl als Chip-Reihe – ruhiger als Dropdowns */
function Pick<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { v: T; l: string }[]; onChange(v: T): void }): React.JSX.Element {
  return (
    <div className="row between opt">
      <span>{label}</span>
      <div className="row chips">
        {options.map((o) => (
          <button key={String(o.v)} className={`chip${o.v === value ? ' on' : ''}`} onClick={() => onChange(o.v)}>
            {o.l}
          </button>
        ))}
      </div>
    </div>
  )
}

const ACCENTS = ['#9fb8ff', '#c4b5fd', '#f9a8d4', '#fca5a5', '#fcd34d', '#86efac', '#67e8f9']

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
  const [showUrl, setShowUrl] = useState(false)
  const [copied, setCopied] = useState(false)
  const [channel, setChannel] = useState(s?.streamer.twitchChannel ?? '')
  if (!s) return <></>
  const c = s.streamer
  const patch = (p: Partial<StreamerSettings>): void => set({ streamer: { ...c, ...p } })
  const widgets = c.overlayWidgets ?? OVERLAY_WIDGETS.map((w) => w.id)
  const setWidgets = (w: string[]): void => patch({ overlayWidgets: w })
  const look = lookOf(c.overlayLook, c.overlayCredit)
  const patchLook = (p: Partial<OverlayLook>): void => patch({ overlayLook: { ...look, ...p } })

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

  const url = overlayUrl(c.overlayPort, c.overlayToken, widgets, look)
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
          <button className="btn small ghost" disabled={!overlay.running || !widgets.length} onClick={() => api.openExternal(url)} title={t('Öffnet das Overlay im Browser – so siehst du, wie es aussieht')}>
            {t('Ansehen')}
          </button>
        </div>
        <div className="dim tiny">{t('Änderungen am Aussehen ändern die URL – danach in OBS neu einfügen. Die URL nie im Stream zeigen.')}</div>
      </section>

      <section className="st-sec">
        <h4>{t('Aussehen des Overlays')}</h4>
        <Pick
          label={t('Position')}
          value={look.pos}
          onChange={(v) => patchLook({ pos: v })}
          options={[
            { v: 'tl', l: t('↖ oben links') },
            { v: 'tr', l: t('↗ oben rechts') },
            { v: 'bl', l: t('↙ unten links') },
            { v: 'br', l: t('↘ unten rechts') }
          ]}
        />
        <Pick
          label={t('Größe')}
          value={look.scale}
          onChange={(v) => patchLook({ scale: v })}
          options={[0.75, 1, 1.25, 1.5, 2].map((v) => ({ v, l: `${Math.round(v * 100)} %` }))}
        />
        <Pick
          label={t('Breite')}
          value={look.width}
          onChange={(v) => patchLook({ width: v })}
          options={[
            { v: 300, l: t('schmal') },
            { v: 380, l: t('normal') },
            { v: 480, l: t('breit') }
          ]}
        />
        <Pick
          label={t('Stil')}
          value={look.theme}
          onChange={(v) => patchLook({ theme: v })}
          options={[
            { v: 'glass', l: t('Dunkles Glas') },
            { v: 'light', l: t('Hell') },
            { v: 'clear', l: t('Nur Text') }
          ]}
        />
        {look.theme !== 'clear' && (
          <Pick
            label={t('Hintergrund')}
            value={look.bg}
            onChange={(v) => patchLook({ bg: v })}
            options={[
              { v: 40, l: t('zart') },
              { v: 78, l: t('normal') },
              { v: 95, l: t('kräftig') }
            ]}
          />
        )}
        <div className="row between opt">
          <span>{t('Akzentfarbe')}</span>
          <div className="row chips">
            {ACCENTS.map((a) => (
              <button key={a} className={`chip swatch${look.accent === a ? ' on' : ''}`} style={{ background: a, width: 22, height: 22, padding: 0, borderRadius: 99 }} title={a} aria-label={a} onClick={() => patchLook({ accent: a })} />
            ))}
            <input type="color" value={look.accent} title={t('Eigene Farbe')} aria-label={t('Eigene Farbe')} onChange={(e) => patchLook({ accent: e.target.value })} style={{ width: 26, height: 22, border: 0, padding: 0, background: 'none' }} />
          </div>
        </div>
        <Pick
          label={t('VibeDesk-Hinweis')}
          value={look.credit}
          onChange={(v) => patchLook({ credit: v })}
          options={[
            { v: 'badge', l: t('Plakette') },
            { v: 'line', l: t('Zeile darunter') },
            { v: 'off', l: t('aus') }
          ]}
        />
        <div className="dim tiny">{t('Die Plakette ist ein kleines „VibeDesk“ in der Statuskarte – kein Wasserzeichen über dem Bild. So finden Zuschauer heraus, womit du arbeitest.')}</div>
        <Opt label={t('Kosten im Overlay zeigen')} on={c.overlayCost} onChange={(v) => patch({ overlayCost: v })} />
        <Opt label={t('Bash-Befehle im Overlay zeigen')} hint={t('sonst nur „Bash“')} on={c.overlayBash} onChange={(v) => patch({ overlayBash: v })} />
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
        <Opt
          label={t('{cmd} zeigt eine Info-Karte', { cmd: INFO_COMMAND })}
          hint={t('Fragt jemand „was ist das für eine IDE?“, tippt er {cmd} – das Overlay zeigt 20 Sekunden lang, womit du codest.', { cmd: INFO_COMMAND })}
          on={c.infoCommand !== false}
          onChange={(v) => patch({ infoCommand: v })}
        />
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
