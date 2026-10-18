import { fmtClock, useFocus } from '../store/focusStore'
import { phaseTotal, remaining } from '../store/focusTimer'
import { useSettings } from '../store/settingsStore'
import type { FocusSettings } from '../../../shared/types'
import { t } from '../../../shared/i18n'

const LABEL = (): Record<'idle' | 'work' | 'short' | 'long', string> => ({ idle: t('Bereit'), work: t('Fokus'), short: t('Kurze Pause'), long: t('Lange Pause') })

export function Ring({ progress, size, stroke, children, tone }: { progress: number; size: number; stroke: number; children?: React.ReactNode; tone: string }): React.JSX.Element {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.1)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={tone}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 900ms linear' }}
        />
      </svg>
      <div className="ring-inner">{children}</div>
    </div>
  )
}

export const toneOf = (phase: string): string => (phase === 'work' ? '#9fb8ff' : phase === 'idle' ? 'rgba(255,255,255,.3)' : '#4ade80')

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange(v: number): void }): React.JSX.Element {
  return (
    <div className="stepper">
      <span>{label}</span>
      <button className="gbtn" onClick={() => onChange(Math.max(min, value - 1))}>
        −
      </button>
      <b>{value}</b>
      <button className="gbtn" onClick={() => onChange(Math.min(max, value + 1))}>
        +
      </button>
    </div>
  )
}

export function FocusPanel(): React.JSX.Element {
  const { state, now, act } = useFocus()
  const cfg = useSettings((s) => s.s?.focus)
  const set = useSettings((s) => s.set)
  if (!cfg) return <div />
  const total = phaseTotal(state, cfg)
  const left = remaining(state, now)
  const paused = state.pausedLeft !== null
  const upd = (patch: Partial<FocusSettings>): void => set({ focus: { ...cfg, ...patch } })

  return (
    <div className="panel focus">
      <Ring progress={total ? 1 - left / total : 0} size={180} stroke={8} tone={toneOf(state.phase)}>
        <div className="focus-time">{fmtClock(state.phase === 'idle' ? cfg.work * 60000 : left)}</div>
        <div className="dim small">{paused ? t('pausiert') : LABEL()[state.phase]}</div>
      </Ring>
      <div className="rounds">
        {Array.from({ length: cfg.rounds }, (_, i) => (
          <i key={i} className={i < state.round - (state.phase === 'work' ? 1 : 0) ? 'done' : i === state.round - 1 && state.phase === 'work' ? 'now' : ''} />
        ))}
      </div>
      <div className="row" style={{ justifyContent: 'center' }}>
        {state.phase === 'idle' ? (
          <button className="btn primary" onClick={() => act('start')} data-testid="focus-start">
            {t('Fokus starten')}
          </button>
        ) : (
          <>
            <button className="btn" onClick={() => act(paused ? 'resume' : 'pause')}>
              {paused ? t('Weiter') : t('Pause')}
            </button>
            <button className="btn" onClick={() => act('skip')}>
              {t('Überspringen')}
            </button>
            <button className="btn ghost" onClick={() => act('reset')}>
              {t('Stopp')}
            </button>
          </>
        )}
      </div>
      <div className="steppers">
        <Stepper label={t('Fokus')} value={cfg.work} min={5} max={120} onChange={(v) => upd({ work: v })} />
        <Stepper label={t('Pause')} value={cfg.short} min={1} max={30} onChange={(v) => upd({ short: v })} />
        <Stepper label={t('Lang')} value={cfg.long} min={5} max={60} onChange={(v) => upd({ long: v })} />
        <Stepper label={t('Runden')} value={cfg.rounds} min={2} max={8} onChange={(v) => upd({ rounds: v })} />
      </div>
      <div className="dim tiny" style={{ textAlign: 'center' }}>
        {t('In Pausen wird die Musik leiser und das Regengeräusch gedämpft.')}
      </div>
    </div>
  )
}
