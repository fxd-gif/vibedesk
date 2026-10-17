import { useEffect, useState } from 'react'
import { SCENES } from '../ambience/sceneParams'
import { toggleMusic, toggleRainSound } from '../ambience/toggles'
import { Icon } from '../desktop/icons'
import { useSettings } from '../store/settingsStore'
import { centeredRect, useUi } from '../store/uiStore'
import { PathInput } from './PathInput'
import { MissingHint, missingTools, ToolSetupPanel, useSetup } from './ToolSetup'
import iconUrl from '../assets/icon.png'

const STEPS = ['welcome', 'claude', 'folder', 'mood', 'discord', 'done'] as const
type Step = (typeof STEPS)[number]

function Toggle({ on, onClick }: { on: boolean; onClick(): void }): React.JSX.Element {
  return (
    <button className={`toggle${on ? ' on' : ''}`} role="switch" aria-checked={on} onClick={onClick}>
      <i />
    </button>
  )
}

export function Onboarding(): React.JSX.Element | null {
  const s = useSettings((x) => x.s)
  const set = useSettings((x) => x.set)
  const [i, setI] = useState(0)
  const installing = useSetup((x) => x.installing)
  const missing = useSetup((x) => missingTools(x.status))
  const [dir, setDir] = useState('')
  const [leaving, setLeaving] = useState(false)
  const step: Step = STEPS[i]

  useEffect(() => {
    if (s && !dir) setDir(s.projectsDir)
  }, [s, dir])

  if (!s || s.onboarded) return null

  const next = (): void => {
    if (step === 'folder' && dir.trim()) set({ projectsDir: dir.trim().replace(/[\\/]+$/, '') })
    setI((x) => Math.min(STEPS.length - 1, x + 1))
  }
  const finish = (newProject: boolean): void => {
    setLeaving(true)
    setTimeout(() => {
      set({ onboarded: true })
      if (newProject) useUi.getState().openWin('projects', centeredRect(520, 480))
    }, 350)
  }

  return (
    <div className={`onb${leaving ? ' leaving' : ''}`} data-testid="onboarding">
      <div className="onb-card" key={step}>
        {step === 'welcome' && (
          <>
            <img className="onb-logo" src={iconUrl} alt="" />
            <h1>Willkommen bei VibeDesk</h1>
            <p>Dein ruhiger Ort zum Vibecoden – Regen an der Scheibe, Lofi im Ohr und alle Claude-Sessions im Blick.</p>
            <button className="btn primary big" onClick={next} data-testid="onb-next">
              Einrichten
            </button>
          </>
        )}

        {step === 'claude' && (
          <>
            <h2>Werkzeuge</h2>
            <p>VibeDesk braucht Node.js und Claude Code – fehlt etwas, installierst du es hier mit einem Klick. Danach meldest du dich einmal bei Claude an.</p>
            <ToolSetupPanel />
            {!installing && <MissingHint />}
            <button className="btn primary big" onClick={next} disabled={!!installing} data-testid="onb-next">
              Weiter
            </button>
          </>
        )}

        {step === 'folder' && (
          <>
            <h2>Wo liegen deine Projekte?</h2>
            <p>Neue Projekte legt VibeDesk hier an. Bestehende Ordner kannst du jederzeit hinzufügen.</p>
            <div style={{ width: '100%', textAlign: 'left' }}>
              <PathInput value={dir} onChange={setDir} onSubmit={next} />
            </div>
            <button className="btn primary big" onClick={next} data-testid="onb-next">
              Weiter
            </button>
          </>
        )}

        {step === 'mood' && (
          <>
            <h2>Deine Atmosphäre</h2>
            <div className="row chips" style={{ justifyContent: 'center' }}>
              {SCENES.map((sc) => (
                <button key={sc.id} className={`chip${s.scene === sc.id ? ' on' : ''}`} onClick={() => set({ scene: sc.id })}>
                  {sc.label}
                </button>
              ))}
            </div>
            <div className="onb-list">
              <div className="row between">
                <span>
                  <Icon name="music" size={15} /> Lofi-Radio
                </span>
                <Toggle on={s.musicOn} onClick={() => set(toggleMusic(s))} />
              </div>
              <div className="row between">
                <span>
                  <Icon name="rain" size={15} /> Regengeräusch
                </span>
                <Toggle on={s.rainSoundOn} onClick={() => set(toggleRainSound(s))} />
              </div>
              <div className="row between">
                <span>
                  <Icon name="spark" size={15} /> Ton, wenn Claude auf dich wartet
                </span>
                <Toggle on={s.chimeOn} onClick={() => set({ chimeOn: !s.chimeOn })} />
              </div>
            </div>
            <button className="btn primary big" onClick={next} data-testid="onb-next">
              Weiter
            </button>
          </>
        )}

        {step === 'discord' && (
          <>
            <h2>Discord</h2>
            <p>Zeig deinen Freunden, woran du gerade baust – mit eigenem Text, Bild und Timer. Alles anpassbar im Discord-Fenster.</p>
            <div className="onb-list">
              <div className="row between">
                <span>
                  <Icon name="discord" size={15} /> Rich Presence anzeigen
                </span>
                <Toggle on={s.discord.enabled} onClick={() => set({ discord: { ...s.discord, enabled: !s.discord.enabled } })} />
              </div>
            </div>
            <button className="btn primary big" onClick={next} data-testid="onb-next">
              Weiter
            </button>
          </>
        )}

        {step === 'done' && (
          <>
            <h2>{missing ? 'Fast geschafft' : 'Alles bereit'}</h2>
            {missing && (
              <p className="setup-hint" data-testid="onb-missing">
                Node.js oder Claude Code fehlen noch. Sobald du eine Session startest, hilft dir VibeDesk beim Einrichten.
              </p>
            )}
            <div className="onb-tips">
              <div>
                <kbd>Win</kbd> + <kbd>R</kbd> → <code>vibe</code>
                <span>startet VibeDesk jederzeit</span>
              </div>
              <div>
                <kbd>Esc</kbd> halten · <kbd>F11</kbd>
                <span>Vollbild verlassen</span>
              </div>
              <div>
                <kbd>Strg</kbd> + <kbd>K</kbd>
                <span>Befehls-Palette: alle Fenster & Aktionen</span>
              </div>
            </div>
            <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
              <button className="btn ghost big" onClick={() => finish(false)}>
                Zum Desktop
              </button>
              <button className="btn primary big" onClick={() => finish(true)} data-testid="onb-finish">
                Erstes Projekt anlegen
              </button>
            </div>
          </>
        )}
      </div>
      <div className="onb-dots">
        {STEPS.map((x, k) => (
          <i key={x} className={k === i ? 'on' : k < i ? 'done' : ''} />
        ))}
      </div>
      {step !== 'welcome' && step !== 'done' && (
        <button className="onb-skip" onClick={() => finish(false)}>
          Überspringen
        </button>
      )}
    </div>
  )
}
