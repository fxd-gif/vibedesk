import { useEffect, useState } from 'react'
import { api, errorText } from '../../api'
import { SCENES } from '../../ambience/sceneParams'
import { alert } from '../../store/dialogStore'
import { useSettings } from '../../store/settingsStore'
import { useSpotify, useSpotifyPolling } from '../../store/spotifyStore'
import { playChime } from '../../ambience/chime'
import { toggleRainSound } from '../../ambience/toggles'
import { useUpdate } from '../../store/updateStore'
import { showWhatsNew } from '../../changelog/WhatsNew'
import { shareAmbience } from '../../store/shareStore'
import { Toggle } from '../../desktop/Toggle'
import { Icon } from '../../desktop/icons'
import { SpotifyPane } from './SpotifyPane'
import { LofiPane } from './LofiPane'
import { sceneThumb, Slider } from './parts'
import type { EnergySaver } from '../../../../shared/types'
import { t } from '../../../../shared/i18n'
import './ambience.css'

export type MusicSource = 'spotify' | 'lofi'

const ENERGY_MODES = (): { id: EnergySaver; label: string }[] => [
  { id: 'auto', label: t('Automatisch') },
  { id: 'on', label: t('An') },
  { id: 'off', label: t('Aus') }
]

const SOURCE_KEY = 'vd-music-source'
function savedSource(): MusicSource | null {
  try {
    const v = localStorage.getItem(SOURCE_KEY)
    return v === 'spotify' || v === 'lofi' ? v : null
  } catch {
    return null
  }
}

const pct = (v: number): string => `${Math.round(v * 100)} %`

export function AmbienceWindow(): React.JSX.Element | null {
  const s = useSettings((x) => x.s)
  const connected = useSpotify((x) => !!x.status?.connected)
  const [source, setSourceState] = useState<MusicSource>(() => savedSource() ?? 'lofi')

  useEffect(() => {
    void useSpotify.getState().refreshStatus()
  }, [])
  useSpotifyPolling(source === 'spotify')

  const setSource = (v: MusicSource): void => {
    setSourceState(v)
    try {
      localStorage.setItem(SOURCE_KEY, v)
    } catch {
      // nur Bequemlichkeit
    }
  }

  if (!s) return null

  return (
    <div className="amb-wrap">
      <div className="amb-win" data-testid="ambience-window">
        <div className="amb-main">
          <header className="amb-src">
            <div className="amb-seg" role="tablist" aria-label={t('Musikquelle')}>
              <button role="tab" aria-selected={source === 'spotify'} className={source === 'spotify' ? 'on' : ''} onClick={() => setSource('spotify')}>
                <Icon name="spotify" size={15} /> Spotify
              </button>
              <button role="tab" aria-selected={source === 'lofi'} className={source === 'lofi' ? 'on' : ''} onClick={() => setSource('lofi')}>
                <Icon name="radio" size={15} /> {t('Lofi-Radio')}
              </button>
            </div>
            {source === 'spotify' && connected && (
              <span className="amb-conn">
                <i /> {t('Verbunden')}
              </span>
            )}
          </header>
          {source === 'spotify' ? <SpotifyPane /> : <LofiPane />}
        </div>
        <AtmosphereSide source={source} />
      </div>
    </div>
  )
}

function AtmosphereSide({ source }: { source: MusicSource }): React.JSX.Element | null {
  const s = useSettings((x) => x.s)
  const set = useSettings((x) => x.set)
  const update = useUpdate()
  const [over, setOver] = useState(false)
  if (!s) return null

  const addImage = async (path: string): Promise<void> => {
    try {
      const url = await api.scenes.addCustom(path)
      set({ customScenes: [...s.customScenes, url], scene: 'custom:' + url })
    } catch (err) {
      await alert(t('Bild konnte nicht hinzugefügt werden'), errorText(err))
    }
  }

  return (
    <aside className="amb-side">
      <section>
        <div className="row between">
          <h4>{t('Hintergrund')}</h4>
          <button className="btn small ghost" onClick={() => void shareAmbience()} title={t('Atmosphäre als Code teilen')}>
            <Icon name="share" size={13} /> {t('Teilen')}
          </button>
        </div>
        <div className="amb-scenes">
          {SCENES.map((sc) => (
            <button key={sc.id} className={`amb-scene${s.scene === sc.id ? ' on' : ''}`} onClick={() => set({ scene: sc.id })}>
              <img src={sceneThumb(sc.id)} alt="" />
              <span>{sc.label}</span>
            </button>
          ))}
          {s.customScenes.map((url, i) => (
            <div key={url} className={`amb-scene${s.scene === 'custom:' + url ? ' on' : ''}`}>
              <button onClick={() => set({ scene: 'custom:' + url })}>
                <img src={url} alt="" />
                <span>{t('Bild {n}', { n: i + 1 })}</span>
              </button>
              <button
                className="amb-scene-x"
                title={t('Entfernen')}
                onClick={() =>
                  set({
                    customScenes: s.customScenes.filter((x) => x !== url),
                    scene: s.scene === 'custom:' + url ? 'city' : s.scene
                  })
                }
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div
          className={`dropzone small${over ? ' over' : ''}`}
          onDragOver={(e) => (e.preventDefault(), setOver(true))}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            const f = e.dataTransfer.files[0]
            if (f) void addImage(api.fs.pathForFile(f))
          }}
        >
          {t('Eigenes Bild hierher ziehen')}
        </div>
      </section>

      <section>
        <h4>{t('Regen')}</h4>
        <Slider label={t('Stärke')} value={s.rainIntensity} onChange={(v) => set({ rainIntensity: v })} />
        <Slider label={t('Beschlag')} value={s.blur} onChange={(v) => set({ blur: v })} />
        <div className="row between">
          <span>{t('Regengeräusch')}</span>
          <Toggle label={t('Regengeräusch')} on={s.rainSoundOn} onChange={() => set(toggleRainSound(s))} />
        </div>
        <div className="row between">
          <span>{t('Ton bei „wartet auf dich“')}</span>
          <Toggle label={t('Ton')} on={s.chimeOn} onChange={(v) => set({ chimeOn: v })} />
        </div>
      </section>

      <section>
        <h4>{t('Lautstärken')}</h4>
        {source === 'lofi' && <Slider label={t('Musik')} value={s.musicVolume} onChange={(v) => set({ musicVolume: v })} suffix={pct(s.musicVolume)} />}
        <Slider
          label={t('Regen')}
          value={s.rainSoundVolume}
          onChange={(v) =>
            set({
              rainSoundVolume: v,
              ...(v > 0 && !s.rainSoundOn ? { rainSoundOn: true } : {})
            })
          }
          suffix={pct(s.rainSoundVolume)}
        />
        <div className="amb-chime">
          <Slider label={t('Hinweiston')} value={s.chimeVolume} onChange={(v) => set({ chimeVolume: v })} suffix={pct(s.chimeVolume)} />
          <button className="btn small ghost" disabled={!s.chimeOn} onClick={() => playChime(s.chimeVolume)}>
            {t('Test')}
          </button>
        </div>
      </section>

      <section>
        <div className="amb-energy" title={t('Sparsamer Regen: 15 statt 30 Bilder pro Sekunde und geringere Auflösung')}>
          <span className="dim small">{t('Energiesparen')}</span>
          <div className="row chips" role="radiogroup" aria-label={t('Energiesparen')}>
            {ENERGY_MODES().map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={(s.energySaver ?? 'auto') === m.id}
                className={`chip${(s.energySaver ?? 'auto') === m.id ? ' on' : ''}`}
                onClick={() => set({ energySaver: m.id })}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <footer className="amb-about">
        <span className="dim small">
          VibeDesk {update.version || '…'} ·{' '}
          <button className="linkish" onClick={() => showWhatsNew()}>
            {t('Was ist neu?')}
          </button>
        </span>
        <button className="btn small ghost" disabled={update.status.state === 'checking' || update.status.state === 'downloading'} onClick={() => api.update.check()}>
          {update.status.state === 'checking' ? t('Suche …') : update.status.state === 'none' ? t('Aktuell ✓') : update.status.state === 'error' ? t('Erneut suchen') : t('Nach Updates suchen')}
        </button>
        {update.status.state === 'error' && (
          <div className="dim tiny">
            {t('Update-Prüfung fehlgeschlagen: {message}', {
              message: update.status.message
            })}
          </div>
        )}
      </footer>
    </aside>
  )
}
