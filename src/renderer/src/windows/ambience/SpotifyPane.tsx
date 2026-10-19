import { useEffect, useRef, useState } from 'react'
import { api, errorText } from '../../api'
import { useSettings } from '../../store/settingsStore'
import { useSpotify } from '../../store/spotifyStore'
import { Icon } from '../../desktop/icons'
import { fmtMs, liveProgress, SPOTIFY_DASHBOARD, SPOTIFY_REDIRECT, validClientId, type SpotifyPlaylist, type SpotifyTrack } from '../../../../shared/spotify'
import { t, tn } from '../../../../shared/i18n'

type View = { kind: 'home' } | { kind: 'liked' } | { kind: 'search'; q: string } | { kind: 'playlist'; pl: SpotifyPlaylist }

export function SpotifyPane(): React.JSX.Element {
  const status = useSpotify((x) => x.status)
  const error = useSpotify((x) => x.error)
  if (!status) return <div className="panel-empty">{t('Lade …')}</div>
  return (
    <>
      {status.connected ? <Library /> : <Connect connecting={status.connecting} />}
      {error && (
        <div className="sp-error" role="alert">
          {error}
        </div>
      )}
    </>
  )
}

// ---------- Verbinden ----------

function Connect({ connecting }: { connecting: boolean }): React.JSX.Element {
  const saved = useSettings((x) => x.s?.spotifyClientId ?? '')
  const set = useSettings((x) => x.set)
  const [id, setId] = useState(saved)
  const [copied, setCopied] = useState(false)
  const ok = validClientId(id)

  const connect = (): void => {
    if (!ok) return
    set({ spotifyClientId: id.trim() })
    void useSpotify.getState().connect(id.trim())
  }

  if (connecting)
    return (
      <div className="sp-connect">
        <div className="sp-logo">
          <Icon name="spotify" size={34} />
        </div>
        <h3>{t('Warte auf Spotify …')}</h3>
        <p className="dim">{t('Bestätige den Zugriff im Browser. Danach geht es hier von selbst weiter.')}</p>
        <button className="btn" onClick={() => api.spotify.cancel()}>
          {t('Abbrechen')}
        </button>
      </div>
    )

  return (
    <div className="sp-connect">
      <div className="sp-logo">
        <Icon name="spotify" size={34} />
      </div>
      <h3>{t('Spotify verbinden')}</h3>
      <p className="dim">{t('Steuere deine Spotify-App direkt aus VibeDesk: Playlists, Lieblingssongs, Warteschlange. Abspielen und Steuern braucht Spotify Premium.')}</p>
      {saved && validClientId(saved) ? (
        <button className="btn primary" onClick={connect} data-testid="spotify-connect">
          {t('Mit Spotify verbinden')}
        </button>
      ) : (
        <ol className="sp-steps">
          <li>
            {t('Leg im Spotify-Entwicklerbereich eine eigene App an (Name egal, z. B. „VibeDesk“) und hak „Web API“ an.')}{' '}
            <button className="linkish" onClick={() => api.openExternal(SPOTIFY_DASHBOARD)}>
              {t('Dashboard öffnen')} <Icon name="external" size={11} />
            </button>
          </li>
          <li>
            {t('Trag diese Redirect-URI ein:')}
            <span className="sp-uri">
              <code>{SPOTIFY_REDIRECT}</code>
              <button
                className="btn small ghost"
                onClick={() => {
                  void api.terminal.writeClipboard(SPOTIFY_REDIRECT)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                }}
              >
                <Icon name={copied ? 'check' : 'copy'} size={12} /> {copied ? t('Kopiert') : t('Kopieren')}
              </button>
            </span>
          </li>
          <li>
            {t('Kopier die Client-ID der App hierher:')}
            <div className="row">
              <input
                className="field mono small"
                placeholder="0123456789abcdef…"
                value={id}
                spellCheck={false}
                onChange={(e) => setId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && connect()}
                data-testid="spotify-client-id"
              />
              <button className="btn primary" disabled={!ok} onClick={connect} data-testid="spotify-connect">
                {t('Verbinden')}
              </button>
            </div>
          </li>
        </ol>
      )}
      {saved && validClientId(saved) && (
        <button className="linkish dim small" onClick={() => set({ spotifyClientId: '' })}>
          {t('Andere Client-ID verwenden')}
        </button>
      )}
    </div>
  )
}

// ---------- Bibliothek + Player ----------

function Library(): React.JSX.Element {
  const playlists = useSpotify((x) => x.playlists)
  const [view, setView] = useState<View>({ kind: 'home' })
  const [q, setQ] = useState('')

  return (
    <div className="sp">
      <nav className="sp-nav">
        <label className="sp-search">
          <Icon name="search" size={13} />
          <input
            placeholder={t('Suche …')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && q.trim()) setView({ kind: 'search', q: q.trim() })
            }}
          />
        </label>
        <button className={view.kind === 'home' ? 'on' : ''} onClick={() => setView({ kind: 'home' })}>
          <Icon name="home" size={14} /> {t('Start')}
        </button>
        <button className={view.kind === 'liked' ? 'on' : ''} onClick={() => setView({ kind: 'liked' })}>
          <Icon name="heart" size={14} /> {t('Lieblingssongs')}
        </button>
        <div className="sp-nav-h">{t('Playlists')}</div>
        <div className="sp-nav-list">
          {playlists.map((pl) => (
            <button key={pl.id} className={view.kind === 'playlist' && view.pl.id === pl.id ? 'on' : ''} onClick={() => setView({ kind: 'playlist', pl })} title={pl.name}>
              {pl.image ? <img src={pl.image} alt="" /> : <span className="sp-ph" />}
              <span>{pl.name}</span>
            </button>
          ))}
          {!playlists.length && <span className="dim small">{t('Keine Playlists gefunden')}</span>}
        </div>
      </nav>
      <div className="sp-content">
        <NowPlaying />
        {view.kind === 'home' && <Home open={(pl) => setView({ kind: 'playlist', pl })} />}
        {view.kind === 'liked' && <Liked />}
        {view.kind === 'playlist' && <PlaylistView key={view.pl.id} pl={view.pl} />}
        {view.kind === 'search' && <SearchView key={view.q} q={view.q} open={(pl) => setView({ kind: 'playlist', pl })} />}
      </div>
    </div>
  )
}

/** Fortschritt, der zwischen zwei Abfragen weiterläuft */
function useTick(on: boolean): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!on) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [on])
  return now
}

function NowPlaying(): React.JSX.Element {
  const p = useSpotify((x) => x.player)
  const devices = useSpotify((x) => x.devices)
  const liked = useSpotify((x) => x.liked)
  const { cmd, toggleLike, loadDevices } = useSpotify.getState()
  const now = useTick(!!p?.playing)
  const [seek, setSeek] = useState<number | null>(null)
  const [vol, setVol] = useState<number | null>(null)
  const volTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const tr = p?.track
  const dur = tr?.durationMs ?? 0
  const pos = seek ?? (p ? liveProgress(p, now) : 0)
  const volume = vol ?? p?.device?.volume ?? null

  const commitSeek = (): void => {
    if (seek !== null) void cmd({ type: 'seek', ms: seek })
    setSeek(null)
  }
  const changeVol = (v: number): void => {
    setVol(v)
    clearTimeout(volTimer.current)
    volTimer.current = setTimeout(() => {
      void cmd({ type: 'volume', pct: v })
      setTimeout(() => setVol(null), 1500)
    }, 250)
  }

  return (
    <section className="sp-now">
      <div className="sp-now-top">
        {tr?.image ? <img className="amb-cover" src={tr.image} alt="" /> : <div className="amb-cover sp-ph" />}
        <div className="amb-now-text">
          {tr ? (
            <>
              <div className="amb-title" title={tr.name}>
                {tr.name}
              </div>
              <div className="dim small">{tr.artists}</div>
              <div className="dim tiny">{tr.album}</div>
            </>
          ) : (
            <>
              <div className="amb-title">{t('Gerade läuft nichts')}</div>
              <div className="dim small">{p?.device ? p.device.name : t('Öffne Spotify auf dem PC oder Handy, dann erscheint es hier als Gerät.')}</div>
              {!devices.length && (
                <button className="btn small" onClick={() => (api.spotify.openApp(), setTimeout(() => void loadDevices(), 4000))}>
                  {t('Spotify-App öffnen')}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="sp-progress">
        <span>{fmtMs(pos)}</span>
        <input
          type="range"
          min={0}
          max={Math.max(1, dur)}
          step={1000}
          value={Math.min(pos, dur)}
          disabled={!tr}
          style={{ '--p': `${dur ? (pos / dur) * 100 : 0}%` } as React.CSSProperties}
          onChange={(e) => setSeek(Number(e.target.value))}
          onPointerUp={commitSeek}
          onKeyUp={commitSeek}
          aria-label={t('Position')}
        />
        <span>-{fmtMs(Math.max(0, dur - pos))}</span>
      </div>

      <div className="sp-controls">
        <button className={`sp-ctl${p?.shuffle ? ' on' : ''}`} title={t('Zufall')} onClick={() => void cmd({ type: 'shuffle', on: !p?.shuffle })}>
          <Icon name="shuffle" size={16} />
        </button>
        <button className="sp-ctl" title={t('Zurück')} onClick={() => void cmd({ type: 'prev' })}>
          <Icon name="prev" size={16} />
        </button>
        <button className="amb-play" title={p?.playing ? t('Pause') : t('Abspielen')} onClick={() => void cmd({ type: p?.playing ? 'pause' : 'play' })} data-testid="spotify-play">
          <Icon name={p?.playing ? 'pause' : 'play'} size={18} />
        </button>
        <button className="sp-ctl" title={t('Weiter')} onClick={() => void cmd({ type: 'next' })}>
          <Icon name="next" size={16} />
        </button>
        <button
          className={`sp-ctl${p && p.repeat !== 'off' ? ' on' : ''}`}
          title={p?.repeat === 'track' ? t('Titel wiederholen') : p?.repeat === 'context' ? t('Alles wiederholen') : t('Wiederholen aus')}
          onClick={() =>
            void cmd({
              type: 'repeat',
              mode: p?.repeat === 'off' ? 'context' : p?.repeat === 'context' ? 'track' : 'off'
            })
          }
        >
          <Icon name="repeat" size={16} />
          {p?.repeat === 'track' && <b className="sp-one">1</b>}
        </button>
        <button className={`sp-ctl${liked ? ' liked' : ''}`} title={liked ? t('Aus Lieblingssongs entfernen') : t('Zu Lieblingssongs')} disabled={!tr} onClick={() => void toggleLike()}>
          <Icon name="heart" size={16} />
        </button>
      </div>

      <div className="sp-bottom">
        <label className="sp-vol" title={volume === null ? t('Dieses Gerät erlaubt keine Lautstärke-Steuerung') : t('Lautstärke')}>
          <Icon name="volume" size={14} />
          <input
            type="range"
            min={0}
            max={100}
            value={volume ?? 0}
            disabled={volume === null}
            style={{ '--p': `${volume ?? 0}%` } as React.CSSProperties}
            onChange={(e) => changeVol(Number(e.target.value))}
            aria-label={t('Lautstärke')}
          />
        </label>
        <label className="sp-device">
          <Icon name="speaker" size={14} />
          <select
            value={p?.device?.id ?? ''}
            onFocus={() => void loadDevices()}
            onPointerDown={() => void loadDevices()}
            onChange={(e) =>
              e.target.value &&
              void cmd({
                type: 'transfer',
                deviceId: e.target.value,
                play: !!p?.playing
              })
            }
            aria-label={t('Gerät')}
          >
            {!p?.device && <option value="">{devices.length ? t('Gerät wählen …') : t('Kein Gerät gefunden')}</option>}
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
            {p?.device && !devices.some((d) => d.id === p.device!.id) && <option value={p.device.id}>{p.device.name}</option>}
          </select>
        </label>
      </div>
    </section>
  )
}

function Home({ open }: { open(pl: SpotifyPlaylist): void }): React.JSX.Element {
  const playlists = useSpotify((x) => x.playlists)
  const queue = useSpotify((x) => x.queue)
  const cmd = useSpotify((x) => x.cmd)
  return (
    <>
      {playlists.length > 0 && (
        <section>
          <h4 className="amb-h">{t('Deine Playlists')}</h4>
          <div className="sp-grid">
            {playlists.slice(0, 8).map((pl) => (
              <div key={pl.id} className="sp-card">
                <button className="sp-card-img" onClick={() => open(pl)}>
                  {pl.image ? <img src={pl.image} alt="" /> : <span className="sp-ph" />}
                </button>
                <button className="sp-card-play" title={t('Abspielen')} onClick={() => void cmd({ type: 'playContext', uri: pl.uri })}>
                  <Icon name="play" size={14} />
                </button>
                <div className="sp-card-name" title={pl.name}>
                  {pl.name}
                </div>
                {pl.total >= 0 && <div className="dim tiny">{tn(pl.total, '{n} Titel', '{n} Titel')}</div>}
              </div>
            ))}
          </div>
        </section>
      )}
      <section>
        <h4 className="amb-h">{t('Als Nächstes')}</h4>
        {queue?.next.length ? <Tracks list={queue.next} /> : <div className="dim small">{t('Die Warteschlange ist leer.')}</div>}
      </section>
    </>
  )
}

function Tracks({ list, onPlay }: { list: SpotifyTrack[]; onPlay?(t: SpotifyTrack): void }): React.JSX.Element {
  const current = useSpotify((x) => x.player?.track?.uri)
  return (
    <div className="sp-tracks">
      {list.map((tr, i) => (
        <button key={tr.uri + i} className={`sp-track${tr.uri === current ? ' on' : ''}`} disabled={!onPlay} onClick={() => onPlay?.(tr)}>
          <span className="sp-track-n">{tr.uri === current ? <Icon name="music" size={12} /> : i + 1}</span>
          {tr.image ? <img src={tr.image} alt="" /> : <span className="sp-ph" />}
          <span className="sp-track-t">
            <span>{tr.name}</span>
            <span className="dim tiny">{tr.artists}</span>
          </span>
          <span className="dim tiny">{fmtMs(tr.durationMs)}</span>
        </button>
      ))}
    </div>
  )
}

/** Laden mit Ladezustand; null = lädt noch */
function useLoad<T>(fn: () => Promise<T>): T | null {
  const [v, setV] = useState<T | null>(null)
  useEffect(() => {
    let live = true
    fn()
      .then((x) => live && setV(x))
      .catch((e) => {
        if (!live) return
        useSpotify.setState({ error: errorText(e) })
      })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lädt einmal pro Ansicht (key wechselt)
  }, [])
  return v
}

function PlaylistView({ pl }: { pl: SpotifyPlaylist }): React.JSX.Element {
  const tracks = useLoad(() => api.spotify.playlistTracks(pl.id))
  const cmd = useSpotify((x) => x.cmd)
  return (
    <section>
      <div className="sp-head">
        {pl.image ? <img src={pl.image} alt="" /> : <span className="sp-ph" />}
        <div>
          <div className="amb-title">{pl.name}</div>
          <div className="dim tiny">
            {pl.owner}
            {pl.total >= 0 && ' · ' + tn(pl.total, '{n} Titel', '{n} Titel')}
          </div>
        </div>
        <button className="amb-play" title={t('Abspielen')} onClick={() => void cmd({ type: 'playContext', uri: pl.uri })}>
          <Icon name="play" size={16} />
        </button>
      </div>
      {tracks === null ? (
        <div className="dim small">{t('Lade …')}</div>
      ) : tracks.length ? (
        <Tracks list={tracks} onPlay={(tr) => void cmd({ type: 'playContext', uri: pl.uri, offsetUri: tr.uri })} />
      ) : (
        <div className="dim small">{t('Spotify zeigt die Titel dieser Playlist hier nicht an – abspielen geht trotzdem.')}</div>
      )}
    </section>
  )
}

function Liked(): React.JSX.Element {
  const tracks = useLoad(() => api.spotify.liked())
  const cmd = useSpotify((x) => x.cmd)
  return (
    <section>
      <h4 className="amb-h">{t('Lieblingssongs')}</h4>
      {tracks === null ? (
        <div className="dim small">{t('Lade …')}</div>
      ) : tracks.length ? (
        <Tracks
          list={tracks}
          onPlay={(tr) =>
            void cmd({
              type: 'playTracks',
              uris: tracks.map((x) => x.uri),
              offsetUri: tr.uri
            })
          }
        />
      ) : (
        <div className="dim small">{t('Noch keine Lieblingssongs.')}</div>
      )}
    </section>
  )
}

function SearchView({ q, open }: { q: string; open(pl: SpotifyPlaylist): void }): React.JSX.Element {
  const res = useLoad(() => api.spotify.search(q))
  const cmd = useSpotify((x) => x.cmd)
  if (!res) return <div className="dim small">{t('Suche …')}</div>
  return (
    <>
      <section>
        <h4 className="amb-h">{t('Titel')}</h4>
        {res.tracks.length ? <Tracks list={res.tracks} onPlay={(tr) => void cmd({ type: 'playTracks', uris: [tr.uri] })} /> : <div className="dim small">{t('Nichts gefunden.')}</div>}
      </section>
      {res.playlists.length > 0 && (
        <section>
          <h4 className="amb-h">{t('Playlists')}</h4>
          <div className="sp-grid">
            {res.playlists.map((pl) => (
              <div key={pl.id} className="sp-card">
                <button className="sp-card-img" onClick={() => open(pl)}>
                  {pl.image ? <img src={pl.image} alt="" /> : <span className="sp-ph" />}
                </button>
                <button className="sp-card-play" title={t('Abspielen')} onClick={() => void cmd({ type: 'playContext', uri: pl.uri })}>
                  <Icon name="play" size={14} />
                </button>
                <div className="sp-card-name" title={pl.name}>
                  {pl.name}
                </div>
                <div className="dim tiny">{pl.owner}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
