import { useEffect, useState } from 'react'
import { useSettings } from '../../store/settingsStore'
import { useSpotify } from '../../store/spotifyStore'
import { ambienceAudio } from '../../ambience/audio'
import { toggleMusic } from '../../ambience/toggles'
import { Icon } from '../../desktop/icons'
import { sceneThumb, Slider } from './parts'
import { t } from '../../../../shared/i18n'

export const STREAMS = [
  { label: 'laut.fm · lofi', url: 'https://stream.laut.fm/lofi' },
  {
    label: 'I Love Chillhop',
    url: 'https://streams.ilovemusic.de/iloveradio17.mp3'
  },
  { label: 'Zeno · Lofi Beats', url: 'https://stream.zeno.fm/0r0xa792kwzuv' }
]

export function LofiPane(): React.JSX.Element | null {
  const s = useSettings((x) => x.s)
  const set = useSettings((x) => x.set)
  const [customUrl, setCustomUrl] = useState('')
  const [audio, setAudio] = useState({
    musicOffline: false,
    musicPlaying: false
  })
  useEffect(() => ambienceAudio.onState(setAudio), [])
  if (!s) return null

  const station = STREAMS.find((x) => x.url === s.streamUrl)
  const cover = s.scene.startsWith('custom:') ? s.scene.slice(7) : sceneThumb(s.scene)

  // musicOn gilt fürs Radio nur, wenn nicht gerade eigene Musik der Player ist
  const on = s.musicOn && s.musicPlayer !== 'local'
  const toggle = (): void => {
    if (on) return set({ musicOn: false })
    // Lofi an → Spotify anhalten, sonst laufen zwei Musiken übereinander
    const sp = useSpotify.getState()
    if (sp.player?.playing) void sp.cmd({ type: 'pause' })
    set({ ...(s.musicOn ? {} : toggleMusic(s)), musicPlayer: 'lofi' })
  }

  return (
    <div className="lofi">
      <div className="amb-now">
        <img className="amb-cover" src={cover} alt="" />
        <div className="amb-now-text">
          <div className="amb-title">{station?.label ?? t('Eigener Stream')}</div>
          <div className="dim small">{t('Lofi-Radio rund um die Uhr – ohne Konto')}</div>
          {on && audio.musicOffline && <span className="badge">{t('offline – neuer Versuch alle 30 s')}</span>}
          {on && !audio.musicOffline && (
            <span className="amb-live">
              <span className="dock-eq" aria-hidden>
                <i />
                <i />
                <i />
              </span>
              {t('Läuft')}
            </span>
          )}
        </div>
        <button className="amb-play big" onClick={toggle} title={on ? t('Pause') : t('Abspielen')} data-testid="lofi-toggle">
          <Icon name={on ? 'pause' : 'play'} size={20} />
        </button>
      </div>
      <Slider label={t('Lautstärke')} value={s.musicVolume} onChange={(v) => set({ musicVolume: v })} suffix={`${Math.round(s.musicVolume * 100)} %`} />

      <h4 className="amb-h">{t('Sender')}</h4>
      <div className="lofi-stations">
        {STREAMS.map((st) => (
          <button key={st.url} className={`lofi-station${s.streamUrl === st.url ? ' on' : ''}`} onClick={() => set({ streamUrl: st.url })}>
            <Icon name="radio" size={16} />
            {st.label}
          </button>
        ))}
      </div>
      <input
        className="field mono small"
        placeholder={station ? t('Eigene Stream-URL (https://…)') : s.streamUrl}
        value={customUrl}
        onChange={(e) => setCustomUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && /^https?:\/\//.test(customUrl.trim())) {
            set({ streamUrl: customUrl.trim() })
            setCustomUrl('')
          }
        }}
      />
    </div>
  )
}
