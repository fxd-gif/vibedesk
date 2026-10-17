// „Vibe Wrapped“: Wochenrückblick als Karte – teilbar als Bild (Zwischenablage + Bilder\VibeDesk).
import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { api } from '../api'
import type { VibeWeek } from '../../../shared/types'
import { inform } from '../store/notifyStore'
import { useSettings } from '../store/settingsStore'
import { fmtActive, wrappedDue } from './wrappedMath'
import './wrapped.css'

export const useWrapped = create<{ week: VibeWeek | null }>(() => ({ week: null }))

export async function showWrapped(): Promise<void> {
  useWrapped.setState({ week: await api.vibe.week() })
}

export async function checkWrapped(now = Date.now()): Promise<void> {
  const s = useSettings.getState().s
  if (!s?.onboarded) return
  // erster Start mit dieser Version: erst ab jetzt zählen
  if (!s.lastWrapped) return useSettings.getState().set({ lastWrapped: now })
  const week = await api.vibe.week()
  if (!wrappedDue(s.lastWrapped, now, week.minutes)) return
  useSettings.getState().set({ lastWrapped: now })
  inform('Deine Vibe-Woche ist da', `${fmtActive(week.minutes).big} ${fmtActive(week.minutes).unit} mit Claude – schau dir deinen Rückblick an.`, [
    { label: 'Ansehen', primary: true, run: () => useWrapped.setState({ week }) }
  ])
}

const DAY = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const weekday = (date: string): string => DAY[new Date(date + 'T12:00:00').getDay()]
const fmtDate = (date: string): string => {
  const [, m, d] = date.split('-')
  return `${Number(d)}.${Number(m)}.`
}

const TOOL_LABEL: Record<string, string> = { Edit: 'Bearbeiten', Write: 'Schreiben', Read: 'Lesen', Bash: 'Terminal', Grep: 'Suchen', Glob: 'Dateien finden', Task: 'Agenten', Agent: 'Agenten', WebFetch: 'Web', WebSearch: 'Websuche', TodoWrite: 'Todos' }

export function VibeWrapped(): React.JSX.Element | null {
  const w = useWrapped((s) => s.week)
  const streaming = useSettings((s) => !!s.s?.streamer.enabled)
  const card = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const close = (): void => useWrapped.setState({ week: null })

  useEffect(() => {
    if (!w) return
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [w])

  if (!w) return null
  const active = fmtActive(w.minutes)
  const maxDay = Math.max(1, ...w.days.map((d) => d.minutes))
  const maxProj = Math.max(1, ...w.projects.map((p) => p.count))
  // im Stream keine Projektnamen zeigen
  const projName = (name: string, i: number): string => (streaming ? `Projekt ${i + 1}` : name)

  const share = async (): Promise<void> => {
    const r = card.current?.getBoundingClientRect()
    if (!r) return
    setBusy(true)
    try {
      const file = await api.vibe.capture({ x: r.left, y: r.top, width: r.width, height: r.height })
      inform(file ? 'Rückblick kopiert' : 'Bild ging nicht', file ? 'Liegt in der Zwischenablage und unter Bilder\\VibeDesk.' : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="vw-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()} data-testid="vibe-wrapped">
      <div className="vw-stack">
        <div className="vw-card" ref={card}>
          <div className="vw-glow" />
          <header>
            <span className="vw-kicker">Vibe Wrapped · {fmtDate(w.from)} – {fmtDate(w.to)}</span>
            <h2 data-testid="vw-persona">{w.persona}</h2>
          </header>

          <div className="vw-hero">
            <div className="vw-big">{active.big}</div>
            <div className="vw-unit">
              {active.unit}
              <br />
              <span>mit Claude im Flow</span>
            </div>
          </div>

          <div className="vw-grid">
            <div>
              <b data-testid="vw-prompts">{w.prompts}</b>
              <span>Prompts</span>
            </div>
            <div>
              <b>{w.files}</b>
              <span>Dateien geändert</span>
            </div>
            <div>
              <b>{w.toolCalls}</b>
              <span>Werkzeug-Aufrufe</span>
            </div>
            <div>
              <b>{w.streak}🔥</b>
              <span>Tage in Folge</span>
            </div>
          </div>

          <div className="vw-days" aria-label="Aktive Minuten pro Tag">
            {w.days.map((d) => (
              <div key={d.date} className={d.date === w.bestDay ? 'best' : ''} title={`${fmtDate(d.date)}: ${d.minutes} Min., ${d.prompts} Prompts`}>
                <i style={{ height: `${Math.max(4, (d.minutes / maxDay) * 100)}%` }} />
                <span>{weekday(d.date)}</span>
              </div>
            ))}
          </div>

          {w.projects.length > 0 && (
            <section className="vw-sec">
              <h4>Deine Projekte</h4>
              {w.projects.slice(0, 3).map((p, i) => (
                <div key={p.name} className="vw-bar">
                  <span>{projName(p.name, i)}</span>
                  <i style={{ width: `${(p.count / maxProj) * 100}%` }} />
                  <em>{fmtActive(p.count).big}{p.count < 60 ? ' Min.' : ' Std.'}</em>
                </div>
              ))}
            </section>
          )}

          <footer className="vw-foot">
            {w.tools[0] && (
              <span>
                Lieblingswerkzeug: <b>{TOOL_LABEL[w.tools[0].name] ?? w.tools[0].name}</b>
              </span>
            )}
            {w.peakHour !== null && (
              <span>
                Beste Zeit: <b>{w.peakHour}–{(w.peakHour + 1) % 24} Uhr</b>
              </span>
            )}
            {w.agents > 0 && (
              <span>
                <b>{w.agents}</b> Agenten losgeschickt
              </span>
            )}
            {w.focus > 0 && (
              <span>
                <b>{w.focus}</b> Fokus-Runden
              </span>
            )}
          </footer>
          <div className="vw-brand">VibeDesk</div>
        </div>
        <div className="row vw-actions">
          <button className="btn ghost" onClick={close}>
            Schließen
          </button>
          <button className="btn primary" disabled={busy || !w.minutes} onClick={() => void share()} data-testid="vw-share">
            {busy ? 'Moment …' : 'Als Bild kopieren'}
          </button>
        </div>
      </div>
    </div>
  )
}
