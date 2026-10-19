// Klick-Tour: zeigt Schritt für Schritt, wo was ist – ein Lichtkegel auf dem Element und eine Sprechblase daneben.
import { useEffect, useLayoutEffect, useState } from 'react'
import { create } from 'zustand'
import { useSettings } from '../store/settingsStore'
import { t } from '../../../shared/i18n'

interface Step {
  /** data-testid des Ziels; fehlt es (oder ist nicht da), steht die Blase in der Mitte */
  target?: string
  title: () => string
  body: () => string
}

const STEPS: Step[] = [
  { title: () => t('Dein Desktop in einer Minute'), body: () => t('Wir zeigen dir kurz, wo was ist. Du kannst jederzeit mit Esc abbrechen.') },
  { target: 'dock-projects', title: () => t('Projekte'), body: () => t('Hier legst du ein Projekt an oder öffnest einen Ordner. VibeDesk startet Claude Code direkt darin.') },
  { target: 'start-card', title: () => t('Oder gleich hier'), body: () => t('Solange nichts offen ist, startest du dein zuletzt genutztes Projekt mit einem Klick.') },
  { target: 'dock-palette', title: () => t('Alles per Suche'), body: () => t('Strg+K öffnet die Befehlspalette: Fenster, Projekte und Aktionen – einfach lostippen.') },
  { target: 'dock-ambience', title: () => t('Atmosphäre & Musik'), body: () => t('Szene wechseln, Lofi-Radio oder Spotify hören und das Regengeräusch einstellen.') },
  { target: 'dock-focus', title: () => t('Fokus-Timer'), body: () => t('Pomodoro: In Pausen wird es leiser, unwichtige Mitteilungen warten bis danach.') },
  { target: 'dock-notify', title: () => t('Mitteilungen'), body: () => t('Wartet Claude auf dich oder ist fertig, siehst du es hier und als Karte unten rechts. Freigaben beantwortest du direkt auf der Karte.') },
  { target: 'dock-more', title: () => t('Mehr'), body: () => t('Weitere Werkzeuge wie Gehirn, Git oder Handy-Begleiter – und die Einstellungen mit dem Werkzeugkasten.') },
  { title: () => t('So arbeitest du'), body: () => t('Projekt starten, Claude im Terminal sagen, was es bauen soll – fertig. Werkzeuge erscheinen im Dock, sobald sie etwas zu tun haben. Strg+. blendet alles außer Claude aus.') }
]

export const useTour = create<{ step: number }>(() => ({ step: -1 }))

export function startTour(): void {
  useTour.setState({ step: 0 })
}

function end(): void {
  useTour.setState({ step: -1 })
  if (!useSettings.getState().s?.tourDone) useSettings.getState().set({ tourDone: true })
}

const visible = (id?: string): HTMLElement | null => {
  if (!id) return null
  const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 ? el : null
}

/** nächster Schritt in Richtung dir, dessen Ziel da ist (oder der keins braucht) */
function next(from: number, dir: 1 | -1): number {
  for (let i = from + dir; i >= 0 && i < STEPS.length; i += dir) if (!STEPS[i].target || visible(STEPS[i].target)) return i
  return dir > 0 ? STEPS.length : from
}

const PAD = 8
const BUBBLE_W = 320

export function Tour(): React.JSX.Element | null {
  const step = useTour((s) => s.step)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [, setTick] = useState(0)
  const s = step >= 0 ? STEPS[step] : undefined

  useLayoutEffect(() => {
    if (!s) return
    const measure = (): void => setRect(visible(s.target)?.getBoundingClientRect() ?? null)
    measure()
    // Dock kann sich noch bewegen (Einblenden) – kurz nachmessen
    const timers = [setTimeout(measure, 120), setTimeout(measure, 400)]
    const onResize = (): void => {
      measure()
      setTick((x) => x + 1)
    }
    window.addEventListener('resize', onResize)
    return () => {
      timers.forEach(clearTimeout)
      window.removeEventListener('resize', onResize)
    }
  }, [s])

  useEffect(() => {
    if (!s) return
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') end()
      else if (e.key === 'ArrowRight' || e.key === 'Enter') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [s, step])

  if (!s) return null
  const shown = STEPS.map((x, i) => i).filter((i) => !STEPS[i].target || visible(STEPS[i].target))
  const pos = shown.indexOf(step) + 1
  const last = next(step, 1) >= STEPS.length

  function go(dir: 1 | -1): void {
    const n = next(useTour.getState().step, dir)
    if (n >= STEPS.length) end()
    else useTour.setState({ step: n })
  }

  // Blase: über dem Ziel (Dock unten), rechts daneben (Seitenleiste) oder darunter; ohne Ziel in der Mitte
  const W = window.innerWidth
  const H = window.innerHeight
  let style: React.CSSProperties = { left: (W - BUBBLE_W) / 2, top: H / 2 - 110 }
  if (rect) {
    const cx = Math.min(Math.max(16, rect.left + rect.width / 2 - BUBBLE_W / 2), W - BUBBLE_W - 16)
    if (rect.top > H * 0.55) style = { left: cx, bottom: H - rect.top + PAD + 14 }
    else if (rect.right < W * 0.35) style = { left: rect.right + PAD + 14, top: Math.max(16, Math.min(rect.top, H - 260)) }
    else style = { left: cx, top: rect.bottom + PAD + 14 }
  }

  return (
    <div className="tour" data-testid="tour" role="dialog" aria-label={t('Rundgang')}>
      {rect ? (
        <div className="tour-spot" style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} />
      ) : (
        <div className="tour-dim" />
      )}
      <div className="tour-bubble" style={{ ...style, width: BUBBLE_W }} key={step}>
        <span className="tour-count">
          {pos} / {shown.length}
        </span>
        <b>{s.title()}</b>
        <p>{s.body()}</p>
        <div className="tour-btns">
          <button className="btn small ghost" onClick={end} data-testid="tour-end">
            {last ? t('Schließen') : t('Beenden')}
          </button>
          <span style={{ flex: 1 }} />
          {pos > 1 && (
            <button className="btn small ghost" onClick={() => go(-1)}>
              {t('Zurück')}
            </button>
          )}
          <button className="btn small primary" onClick={() => go(1)} data-testid="tour-next">
            {last ? t('Los geht’s') : t('Weiter')}
          </button>
        </div>
      </div>
    </div>
  )
}
