// Eigene Musik: Titel aus einem Ordner auf dem PC hören – ohne Konto, ohne Internet.
import { Fragment, useEffect, useMemo } from 'react'
import { useSettings } from '../../store/settingsStore'
import { currentTrack, localMusic, useLocalMusic } from '../../store/localMusicStore'
import { Icon } from '../../desktop/icons'
import { sceneThumb, Slider } from './parts'
import { fmtSec, groupTracks, MAX_TRACKS, trackGroup, trackTitle } from '../../../../shared/localMusic'
import { t } from '../../../../shared/i18n'

const folderName = (dir: string): string => dir.split(/[\\/]/).filter(Boolean).pop() ?? dir

export function LocalPane(): React.JSX.Element | null {
  const s = useSettings((x) => x.s)
  const status = useLocalMusic((x) => x.status)
  const dir = s?.localMusic.dir ?? ''
  useEffect(() => {
    if (dir) localMusic.ensure(dir)
  }, [dir])
  if (!s) return null

  const name = folderName(dir)
  if (!dir)
    return (
      <Calm
        title={t('Deine eigene Musik')}
        text={t('Wähle einen Ordner mit Musik auf deinem PC (mp3, m4a, aac, ogg, opus, wav, flac). VibeDesk spielt sie ab – ohne Konto, ohne Internet, nichts verlässt deinen PC.')}
        button={t('Ordner wählen')}
      />
    )
  if (status === 'missing') return <Calm title={t('Ordner nicht gefunden')} text={t('„{name}“ ist nicht mehr da – vielleicht verschoben oder ein Laufwerk fehlt.', { name })} button={t('Anderen Ordner wählen')} retry />
  if (status === 'empty') return <Calm title={t('Keine Musik gefunden')} text={t('In „{name}“ liegen keine Audiodateien (mp3, m4a, aac, ogg, opus, wav, flac).', { name })} button={t('Anderen Ordner wählen')} retry />
  if (status !== 'ready')
    return (
      <div className="lofi lm">
        <p className="dim small">{t('Lese Musik ein …')}</p>
      </div>
    )

  return (
    <div className="lofi lm" data-testid="local-music">
      <NowPlaying folder={name} />
      <TrackList folder={name} />
    </div>
  )
}

/** ruhige Meldung mit Knopf zum Ordnerwählen */
function Calm({ title, text, button, retry }: { title: string; text: string; button: string; retry?: boolean }): React.JSX.Element {
  return (
    <div className="sp-connect lm-calm">
      <div className="sp-logo lm-logo">
        <Icon name="folder" size={28} />
      </div>
      <h3>{title}</h3>
      <p className="dim">{text}</p>
      <div className="row">
        <button className="btn primary" onClick={() => void localMusic.pickDir()} data-testid="local-pick">
          {button}
        </button>
        {retry && (
          <button className="btn" onClick={() => localMusic.rescan()}>
            {t('Nochmal nachsehen')}
          </button>
        )}
      </div>
    </div>
  )
}

function NowPlaying({ folder }: { folder: string }): React.JSX.Element | null {
  const s = useSettings((x) => x.s)
  const set = useSettings((x) => x.set)
  const rel = useLocalMusic((x) => currentTrack(x))
  const time = useLocalMusic((x) => x.time)
  const duration = useLocalMusic((x) => x.duration)
  const playing = useLocalMusic((x) => x.playing)
  const failed = useLocalMusic((x) => x.failed)
  if (!s) return null

  const on = s.musicOn && s.musicPlayer === 'local'
  const lm = s.localMusic
  const cover = s.scene.startsWith('custom:') ? s.scene.slice(7) : sceneThumb(s.scene)
  const group = trackGroup(rel)

  return (
    <section className="sp-now lm-now">
      <div className="sp-now-top">
        <img className="amb-cover" src={cover} alt="" />
        <div className="amb-now-text">
          <div className="amb-title" title={rel}>
            {trackTitle(rel)}
          </div>
          <div className="dim small">{group ? group.split('/').join(' · ') : folder}</div>
          {failed ? (
            <span className="badge">{t('„{title}“ lässt sich nicht abspielen', { title: trackTitle(failed) })}</span>
          ) : (
            on &&
            playing && (
              <span className="amb-live">
                <span className="dock-eq" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
                {t('Läuft')}
              </span>
            )
          )}
        </div>
      </div>

      <div className="sp-progress">
        <span>{fmtSec(time)}</span>
        <input
          type="range"
          min={0}
          max={Math.max(1, duration)}
          step={1}
          value={Math.min(time, duration || time)}
          disabled={!duration}
          style={{ '--p': `${duration ? (time / duration) * 100 : 0}%` } as React.CSSProperties}
          onChange={(e) => localMusic.seek(Number(e.target.value))}
          aria-label={t('Position')}
        />
        <span>-{fmtSec(Math.max(0, duration - time))}</span>
      </div>

      <div className="sp-controls">
        <button className={`sp-ctl${lm.shuffle ? ' on' : ''}`} title={t('Zufall')} aria-pressed={lm.shuffle} onClick={() => localMusic.setShuffle(!lm.shuffle)}>
          <Icon name="shuffle" size={16} />
        </button>
        <button className="sp-ctl" title={t('Zurück')} onClick={() => localMusic.prev()}>
          <Icon name="prev" size={16} />
        </button>
        <button className="amb-play" title={on ? t('Pause') : t('Abspielen')} onClick={() => localMusic.toggle()} data-testid="local-toggle">
          <Icon name={on ? 'pause' : 'play'} size={18} />
        </button>
        <button className="sp-ctl" title={t('Weiter')} onClick={() => localMusic.next()}>
          <Icon name="next" size={16} />
        </button>
        <button
          className={`sp-ctl${lm.repeat !== 'off' ? ' on' : ''}`}
          title={lm.repeat === 'one' ? t('Titel wiederholen') : lm.repeat === 'all' ? t('Alles wiederholen') : t('Wiederholen aus')}
          onClick={() => localMusic.cycleRepeat()}
        >
          <Icon name="repeat" size={16} />
          {lm.repeat === 'one' && <b className="sp-one">1</b>}
        </button>
      </div>

      <Slider label={t('Lautstärke')} value={s.musicVolume} onChange={(v) => set({ musicVolume: v })} suffix={`${Math.round(s.musicVolume * 100)} %`} />
    </section>
  )
}

function TrackList({ folder }: { folder: string }): React.JSX.Element {
  const tracks = useLocalMusic((x) => x.tracks)
  const truncated = useLocalMusic((x) => x.truncated)
  const cur = useLocalMusic((x) => x.order[x.pos] ?? -1)
  const groups = useMemo(() => groupTracks(tracks), [tracks])
  const plain = groups.length === 1 && !groups[0].group

  return (
    <>
      <div className="row between lm-head">
        <h4 className="amb-h">{t('{n} Titel in „{folder}“', { n: tracks.length, folder })}</h4>
        <div className="row">
          <button className="btn small ghost" onClick={() => localMusic.rescan()} title={t('Ordner neu einlesen')}>
            <Icon name="restart" size={13} />
          </button>
          <button className="btn small ghost" onClick={() => void localMusic.pickDir()} data-testid="local-change">
            <Icon name="folder" size={13} /> {t('Anderen Ordner wählen')}
          </button>
        </div>
      </div>
      {truncated && <p className="dim tiny">{t('Sehr viele Dateien – VibeDesk zeigt die ersten {n} Titel.', { n: MAX_TRACKS })}</p>}
      <div className="sp-tracks lm-tracks">
        {groups.map((g) => (
          <Fragment key={g.group}>
            {!plain && <div className="sp-nav-h lm-group">{g.group ? g.group.split('/').join(' · ') : folder}</div>}
            {g.items.map((i) => (
              <button key={tracks[i]} className={`sp-track lm-track${i === cur ? ' on' : ''}`} onClick={() => localMusic.playIndex(i)} title={tracks[i]}>
                <span className="sp-track-n">{i + 1}</span>
                <span className="sp-track-t">
                  <span>{trackTitle(tracks[i])}</span>
                </span>
              </button>
            ))}
          </Fragment>
        ))}
      </div>
    </>
  )
}
