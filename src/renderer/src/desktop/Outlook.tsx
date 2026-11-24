// Ausblick (Strg+Tab): Die Fenster treten zurück, man sieht die Stadt hinter dem Regen.
// Jede Session ist ein beschriftetes Licht gegenüber – Klick oder Enter holt sie nach vorn.
import { useEffect, useRef, useState } from 'react'
import { t } from '../../../shared/i18n'
import { isLivingScene } from '../../../shared/living'
import { waitingLabel } from '../../../shared/waiting'
import { nextLamp, slotPos, type Lamp } from '../ambience/lights'
import { ASCII_SCENE } from '../ambience/sceneParams'
import { toggleOutlook, useLamps, useLights } from '../store/lightsStore'
import { termWin } from '../store/sessionStore'
import { focusTerminal } from '../store/terminals'
import { useSettings } from '../store/settingsStore'
import { useUi } from '../store/uiStore'
import './outlook.css'

function statusText(l: Lamp): string {
  switch (l.status) {
    case 'waiting':
      return waitingLabel(l.waitingSince)
    case 'working':
      return t('arbeitet')
    case 'done':
      return t('fertig')
    case 'error':
      return t('Fehler')
    default:
      return t('bereit')
  }
}

function openSession(id: string): void {
  toggleOutlook(false)
  useUi.getState().focus(termWin(id))
  // gleich weitertippen können: sofort (xterm bleibt auch minimiert eingehängt), nach dem nächsten Bild zur Sicherheit noch einmal
  focusTerminal(id)
  requestAnimationFrame(() => focusTerminal(id))
}

export function Outlook(): React.JSX.Element | null {
  const open = useLights((s) => s.outlook)
  return open ? <OutlookView /> : null
}

function OutlookView(): React.JSX.Element {
  const lamps = useLamps()
  const selected = useLights((s) => s.selected)
  const scene = useSettings((x) => x.s?.scene)
  // Zeichenregen und lebende Szenen haben keinen Regen-Shader – dort zeichnet der Ausblick die Fenster selbst
  const ownPanes = scene === ASCII_SCENE || isLivingScene(scene)
  const list = useRef(lamps)
  list.current = lamps
  // „wartet · 3 min“ bleibt aktuell
  const [, setTick] = useState(0)
  useEffect(() => {
    const i = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(i)
  }, [])

  // Tastatur aus dem Terminal nehmen (Tab soll nicht als Tippen zählen) und ohne Wahl dorthin zurückgeben
  useEffect(() => {
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null
    prev?.blur()
    return () => {
      if (document.activeElement === document.body && prev?.isConnected) prev.focus()
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.altKey || e.metaKey) return // Strg+Tab gehört calm.ts
      const step = e.key === 'Tab' ? (e.shiftKey ? -1 : 1) : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
      const sel = useLights.getState().selected
      if (e.key === 'Escape') toggleOutlook(false)
      else if (step) useLights.getState().select(nextLamp(list.current, sel, step))
      else if (e.key === 'Enter' && sel && list.current.some((l) => l.id === sel)) openSession(sel)
      else return
      // Terminal und andere Fenster bekommen die Taste nicht
      e.preventDefault()
      e.stopPropagation()
    }
    // Klick aufs Dock, eine Karte oder einen Toast: Ausblick zu, der Klick geht trotzdem durch
    const onDown = (e: PointerEvent): void => {
      if (!(e.target as HTMLElement | null)?.closest?.('.outlook')) toggleOutlook(false)
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onDown, true)
    }
  }, [])

  return (
    <div className="outlook" data-testid="outlook" onPointerDown={(e) => e.target === e.currentTarget && toggleOutlook(false)}>
      {lamps.map((l) => {
        const p = slotPos(l.slot)
        return (
          <button
            key={l.id}
            className={`ol-lamp st-${l.status}${selected === l.id ? ' on' : ''}${ownPanes ? ' own' : ''}`}
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
            onClick={() => openSession(l.id)}
            onPointerEnter={() => useLights.getState().select(l.id)}
            data-testid={`outlook-lamp-${l.name}`}
          >
            <span className="ol-pane" aria-hidden />
            <span className="ol-label">
              <span className="ol-name">{l.name}</span>
              <span className="ol-status">{statusText(l)}</span>
            </span>
          </button>
        )
      })}
      {!lamps.length && <p className="ol-empty">{t('Noch keine Sessions – gegenüber ist alles dunkel.')}</p>}
      <p className="ol-hint">{t('Esc bringt deine Fenster zurück.')}</p>
    </div>
  )
}
