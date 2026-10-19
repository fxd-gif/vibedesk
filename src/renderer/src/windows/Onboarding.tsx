import { useEffect, useState } from 'react'
import { experiencePreset, type Level } from '../desktop/experience'
import { startTour } from '../desktop/Tour'
import { useSettings } from '../store/settingsStore'
import { centeredRect, useUi } from '../store/uiStore'
import { PathInput } from './PathInput'
import { MissingHint, missingTools, ToolSetupPanel, useSetup } from './ToolSetup'
import iconUrl from '../assets/icon.png'
import { t } from '../../../shared/i18n'

// kurz halten: Szene, Musik und Discord kommen später als leise Tipps
const STEPS = ['welcome', 'claude', 'folder', 'experience', 'done'] as const
type Step = (typeof STEPS)[number]

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
  const pick = (level: Level): void => {
    set(experiencePreset(level))
    next()
  }
  const finish = (then: 'desktop' | 'project' | 'tour'): void => {
    setLeaving(true)
    setTimeout(() => {
      set({ onboarded: true })
      if (then === 'project') useUi.getState().openWin('projects', centeredRect(520, 480))
      // Dock und Startkarte brauchen einen Moment, bis sie stehen
      if (then === 'tour') setTimeout(startTour, 450)
    }, 350)
  }

  return (
    <div className={`onb${leaving ? ' leaving' : ''}`} data-testid="onboarding">
      <div className="onb-card" key={step}>
        {step === 'welcome' && (
          <>
            <img className="onb-logo" src={iconUrl} alt="" />
            <h1>{t('Willkommen bei VibeDesk')}</h1>
            <p>{t('Dein ruhiger Ort zum Vibecoden – Regen an der Scheibe, Lofi im Ohr und alle Claude-Sessions im Blick.')}</p>
            <button className="btn primary big" onClick={next} data-testid="onb-next">
              {t('Einrichten')}
            </button>
          </>
        )}

        {step === 'claude' && (
          <>
            <h2>{t('Werkzeuge')}</h2>
            <p>{t('VibeDesk braucht Node.js und Claude Code – fehlt etwas, installierst du es hier mit einem Klick. Danach meldest du dich einmal bei Claude an.')}</p>
            <ToolSetupPanel />
            {!installing && <MissingHint />}
            <button className="btn primary big" onClick={next} disabled={!!installing} data-testid="onb-next">
              {t('Weiter')}
            </button>
          </>
        )}

        {step === 'folder' && (
          <>
            <h2>{t('Wo liegen deine Projekte?')}</h2>
            <p>{t('Neue Projekte legt VibeDesk hier an. Bestehende Ordner kannst du jederzeit hinzufügen.')}</p>
            <div style={{ width: '100%', textAlign: 'left' }}>
              <PathInput value={dir} onChange={setDir} onSubmit={next} />
            </div>
            <button className="btn primary big" onClick={next} data-testid="onb-next">
              {t('Weiter')}
            </button>
          </>
        )}

        {step === 'experience' && (
          <>
            <h2>{t('Wie viel Erfahrung hast du mit Vibecoding?')}</h2>
            <p>{t('Danach richten wir die Oberfläche ein. Alles bleibt einzeln an- und abschaltbar unter Einstellungen → Ansicht.')}</p>
            <div className="onb-choices">
              <button className="onb-choice" onClick={() => pick('beginner')} data-testid="onb-next">
                <b>{t('Ich fange gerade an')}</b>
                <span>{t('Ruhige Oberfläche mit Dock: Projekte, Sessions und Atmosphäre. Weitere Werkzeuge zeigen leise Tipps nach und nach.')}</span>
                <small>{t('Empfohlen für den Einstieg')}</small>
              </button>
              <button className="onb-choice" onClick={() => pick('pro')} data-testid="onb-pro">
                <b>{t('Ich kenne mich aus')}</b>
                <span>{t('Studio-Aufbau mit Seitenleiste und Statusleiste, alle Werkzeuge an – Merge Studio, Addons, Handy, Discord und mehr. Keine Tipps.')}</span>
                <small>{t('Für Profis')}</small>
              </button>
            </div>
          </>
        )}

        {step === 'done' && (
          <>
            <h2>{missing ? t('Fast geschafft') : t('Alles bereit')}</h2>
            {missing && (
              <p className="setup-hint" data-testid="onb-missing">
                {t('Node.js oder Claude Code fehlen noch. Sobald du eine Session startest, hilft dir VibeDesk beim Einrichten.')}
              </p>
            )}
            <div className="onb-tips">
              <div>
                <kbd>Win</kbd> + <kbd>R</kbd> → <code>vibe</code>
                <span>{t('startet VibeDesk jederzeit')}</span>
              </div>
              <div>
                <kbd>Esc</kbd> {t('halten')} · <kbd>F11</kbd>
                <span>{t('Vollbild verlassen')}</span>
              </div>
              <div>
                <kbd>{t('Strg')}</kbd> + <kbd>K</kbd>
                <span>{t('Befehls-Palette: alle Fenster & Aktionen')}</span>
              </div>
            </div>
            <div className="row" style={{ justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn ghost big" onClick={() => finish('desktop')}>
                {t('Zum Desktop')}
              </button>
              <button className="btn big" onClick={() => finish('tour')} data-testid="onb-tour">
                {t('Kurze Tour (1 Min.)')}
              </button>
              <button className="btn primary big" onClick={() => finish('project')} data-testid="onb-finish">
                {t('Erstes Projekt anlegen')}
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
        <button className="onb-skip" onClick={() => finish('desktop')}>
          {t('Überspringen')}
        </button>
      )}
    </div>
  )
}
