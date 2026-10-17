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
  const fmtProj = (min: number): string => (min < 60 ? `${min} Min.` : `${fmtActive(min).big} Std.`)
  const facts: [string, string][] = [
    ...(w.tools[0] ? [['Lieblingswerkzeug', TOOL_LABEL[w.tools[0].name] ?? w.tools[0].name] as [string, string]] : []),
    ...(w.peakHour !== null ? [['Beste Zeit', `${w.peakHour} bis ${(w.peakHour + 1) % 24} Uhr`] as [string, string]] : []),
    ['Serie', w.streak === 1 ? '1 Tag' : `${w.streak} Tage in Folge`],
    ...(w.agents > 0 ? [['Agenten', String(w.agents)] as [string, string]] : []),
    ...(w.focus > 0 ? [['Fokus-Runden', String(w.focus)] as [string, string]] : [])
  ]
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
          <header className="vw-top">
            <b>VibeDesk</b>
            <span>
              {fmtDate(w.from)} bis {fmtDate(w.to)}
            </span>
          </header>

          <p className="vw-lede">Deine Arbeitswoche mit Claude</p>
          <h2 data-testid="vw-persona">{w.persona}</h2>

          <div className="vw-hero">
            <span className="vw-big">{active.big}</span>
            <span className="vw-unit">{active.unit} aktiv</span>
          </div>

          <div className="vw-days" aria-label="Aktive Minuten pro Tag">
            {w.days.map((d, i) => {
              const best = d.date === w.bestDay
              return (
                <div key={d.date} className={best ? 'best' : ''} title={`${fmtDate(d.date)}: ${d.minutes} Min., ${d.prompts} Prompts`}>
                  {best && <em>{d.minutes}m</em>}
                  <i style={{ height: `${Math.max(3, (d.minutes / maxDay) * 100)}%`, animationDelay: `${120 + i * 40}ms` }} />
                  <span>{weekday(d.date)}</span>
                </div>
              )
            })}
          </div>

          <dl className="vw-stats">
            <div>
              <dd data-testid="vw-prompts">{w.prompts}</dd>
              <dt>Prompts</dt>
            </div>
            <div>
              <dd>{w.files}</dd>
              <dt>Dateien geändert</dt>
            </div>
            <div>
              <dd>{w.toolCalls}</dd>
              <dt>Werkzeug-Aufrufe</dt>
            </div>
          </dl>

          {w.projects.length > 0 && (
            <section className="vw-projects">
              <h3>Meiste Zeit in</h3>
              <ol>
                {w.projects.slice(0, 3).map((p, i) => (
                  <li key={p.name}>
                    <span className="vw-rank">{i + 1}</span>
                    <span className="vw-name">{projName(p.name, i)}</span>
                    <span className="vw-time">{fmtProj(p.count)}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <dl className="vw-facts">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {/* steht mit auf dem geteilten Bild – so finden andere VibeDesk */}
          <footer className="vw-foot">fxd-gif.github.io/vibedesk · kostenlos &amp; Open Source</footer>
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
