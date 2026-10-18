import { useEffect, useRef, useState } from 'react'
import { api, errorText } from '../api'
import { SCENES } from '../ambience/sceneParams'
import { alert } from '../store/dialogStore'
import { useSettings } from '../store/settingsStore'
import { playChime } from '../ambience/chime'
import { toggleMusic, toggleRainSound } from '../ambience/toggles'
import { useUpdate } from '../store/updateStore'
import { showWhatsNew } from '../changelog/WhatsNew'
import { shareAmbience } from '../store/shareStore'
import type { EnergySaver } from '../../../shared/types'
import { t } from '../../../shared/i18n'

export const STREAMS = [
  { label: 'laut.fm · lofi', url: 'https://stream.laut.fm/lofi' },
  { label: 'I Love Chillhop', url: 'https://streams.ilovemusic.de/iloveradio17.mp3' },
  { label: 'Zeno · Lofi Beats', url: 'https://stream.zeno.fm/0r0xa792kwzuv' }
]

const ENERGY_MODES = (): { id: EnergySaver; label: string }[] => [
  { id: 'auto', label: t('Automatisch (bei Akku)') },
  { id: 'on', label: t('An') },
  { id: 'off', label: t('Aus') }
]

export function Toggle({ on, onChange, label }: { on: boolean; onChange(v: boolean): void; label: string }): React.JSX.Element {
  return (
    <button className={`toggle${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
      <i />
    </button>
  )
}

function Slider({ value, onChange, label }: { value: number; onChange(v: number): void; label: string }): React.JSX.Element {
  return (
    <label className="slider">
      <span>{label}</span>
      <input type="range" min={0} max={1} step={0.01} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

export function AmbienceMenu({ onClose, offline }: { onClose(): void; offline: boolean }): React.JSX.Element | null {
  const s = useSettings((x) => x.s)
  const set = useSettings((x) => x.set)
  const ref = useRef<HTMLDivElement>(null)
  const [over, setOver] = useState(false)
  const [customUrl, setCustomUrl] = useState('')
  const update = useUpdate()

  useEffect(() => {
    const down = (e: PointerEvent): void => {
      const t = e.target as HTMLElement
      if (!ref.current?.contains(t) && !t.closest('[data-testid="dock-ambience"]')) onClose()
    }
    window.addEventListener('pointerdown', down)
    return () => window.removeEventListener('pointerdown', down)
  }, [onClose])

  if (!s) return null

  const addImage = async (path: string): Promise<void> => {
    try {
      const url = await api.scenes.addCustom(path)
      set({ customScenes: [...s.customScenes, url], scene: 'custom:' + url })
    } catch (err) {
      await alert(t('Bild konnte nicht hinzugefügt werden'), errorText(err))
    }
  }

  const presetUrl = STREAMS.some((x) => x.url === s.streamUrl)

  return (
    <div className="amb-menu" ref={ref} data-testid="ambience-menu">
      <section>
        <div className="row between">
          <h4>{t('Ausblick')}</h4>
          <button className="btn small ghost" onClick={() => (onClose(), void shareAmbience())} title={t('Atmosphäre als Code teilen')}>
            {t('Teilen')}
          </button>
        </div>
        <div className="row chips">
          {SCENES.map((sc) => (
            <button key={sc.id} className={`chip${s.scene === sc.id ? ' on' : ''}`} onClick={() => set({ scene: sc.id })}>
              {sc.label}
            </button>
          ))}
          {s.customScenes.map((url, i) => (
            <span key={url} className={`chip custom${s.scene === 'custom:' + url ? ' on' : ''}`}>
              <button onClick={() => set({ scene: 'custom:' + url })}>
                <img src={url} alt="" />
                {t('Bild {n}', { n: i + 1 })}
              </button>
              <button
                className="chip-x"
                title={t('Entfernen')}
                onClick={() => set({ customScenes: s.customScenes.filter((x) => x !== url), scene: s.scene === 'custom:' + url ? 'city' : s.scene })}
              >
                ×
              </button>
            </span>
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
            if (f) addImage(api.fs.pathForFile(f))
          }}
        >
          {t('Eigenes Bild hierher ziehen')}
        </div>
      </section>

      <section>
        <div className="row">
          <h4>{t('Regen')}</h4>
        </div>
        <Slider label={t('Stärke')} value={s.rainIntensity} onChange={(v) => set({ rainIntensity: v })} />
        <Slider label={t('Beschlag')} value={s.blur} onChange={(v) => set({ blur: v })} />
        <div className="row between">
          <span>{t('Regengeräusch')}</span>
          <Toggle label={t('Regengeräusch')} on={s.rainSoundOn} onChange={() => set(toggleRainSound(s))} />
        </div>
        {s.rainSoundOn && <Slider label={t('Lautstärke')} value={s.rainSoundVolume} onChange={(v) => set({ rainSoundVolume: v })} />}
        <div className="row between" title={t('Sparsamer Regen: 15 statt 30 Bilder pro Sekunde und geringere Auflösung')}>
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

      <section>
        <div className="row between">
          <h4>{t('Ton bei „wartet auf dich“')}</h4>
          <Toggle label={t('Ton')} on={s.chimeOn} onChange={(v) => set({ chimeOn: v })} />
        </div>
        {s.chimeOn && (
          <div className="row">
            <Slider label={t('Lautstärke')} value={s.chimeVolume} onChange={(v) => set({ chimeVolume: v })} />
            <button className="btn small ghost" onClick={() => playChime(s.chimeVolume)}>
              {t('Test')}
            </button>
          </div>
        )}
      </section>

      <section>
        <div className="row between">
          <h4>
            Lofi-Radio {offline && s.musicOn && <span className="badge">{t('offline – neuer Versuch alle 30 s')}</span>}
          </h4>
          <Toggle label={t('Musik')} on={s.musicOn} onChange={() => set(toggleMusic(s))} />
        </div>
        <Slider label={t('Lautstärke')} value={s.musicVolume} onChange={(v) => set({ musicVolume: v })} />
        <div className="row chips">
          {STREAMS.map((st) => (
            <button key={st.url} className={`chip${s.streamUrl === st.url ? ' on' : ''}`} onClick={() => set({ streamUrl: st.url })}>
              {st.label}
            </button>
          ))}
        </div>
        <input
          className="field mono small"
          placeholder={presetUrl ? t('Eigene Stream-URL (https://…)') : s.streamUrl}
          value={customUrl}
          onChange={(e) => setCustomUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && /^https?:\/\//.test(customUrl.trim())) {
              set({ streamUrl: customUrl.trim() })
              setCustomUrl('')
            }
          }}
        />
      </section>
      <section className="about">
        <div className="row between">
          <span className="dim small">
            VibeDesk {update.version || '…'} ·{' '}
            <button className="linkish" onClick={() => (onClose(), showWhatsNew())}>
              {t('Was ist neu?')}
            </button>
          </span>
          <button className="btn small ghost" disabled={update.status.state === 'checking' || update.status.state === 'downloading'} onClick={() => api.update.check()}>
            {update.status.state === 'checking'
              ? t('Suche …')
              : update.status.state === 'none'
                ? t('Aktuell ✓')
                : update.status.state === 'error'
                  ? t('Erneut suchen')
                  : t('Nach Updates suchen')}
          </button>
        </div>
        {update.status.state === 'error' && <div className="dim tiny">{t('Update-Prüfung fehlgeschlagen: {message}', { message: update.status.message })}</div>}
      </section>
    </div>
  )
}
