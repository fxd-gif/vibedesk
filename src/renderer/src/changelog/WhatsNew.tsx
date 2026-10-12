import { create } from 'zustand'
import changelogMd from '../../../../CHANGELOG.md?raw'
import { api } from '../api'
import { useSettings } from '../store/settingsStore'
import { entriesSince, parseChangelog, shouldShowChangelog, UNRELEASED, type ChangelogEntry } from './changelog'

const ALL = parseChangelog(changelogMd)

export const useWhatsNew = create<{ entries: ChangelogEntry[] | null; afterUpdate: boolean }>(() => ({ entries: null, afterUpdate: false }))

/** Manuell (Palette/Menü): die letzten Versionen, inkl. „Demnächst“ im Entwicklungsstand. */
export function showWhatsNew(): void {
  useWhatsNew.setState({ entries: ALL.slice(0, 6), afterUpdate: false })
}

/** Nach dem Start: bei Update einmalig zeigen, dann Version merken. */
export async function checkWhatsNew(): Promise<void> {
  const s = useSettings.getState().s
  if (!s) return
  const current = await api.update.version()
  if (!current) return
  if (shouldShowChangelog(s.lastSeenVersion, current, s.onboarded)) {
    const entries = entriesSince(ALL, s.lastSeenVersion, current)
    if (entries.length) useWhatsNew.setState({ entries, afterUpdate: true })
  }
  if (s.lastSeenVersion !== current) useSettings.getState().set({ lastSeenVersion: current })
}

const TONE: Record<string, string> = { Neu: 'new', Verbessert: 'better', Entfernt: 'removed', Behoben: 'fixed' }

/** **fett** im Changelog-Text */
function rich(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : part))
}

export function WhatsNew(): React.JSX.Element | null {
  const entries = useWhatsNew((s) => s.entries)
  const afterUpdate = useWhatsNew((s) => s.afterUpdate)
  if (!entries) return null
  const close = (): void => useWhatsNew.setState({ entries: null })
  const top = entries[0]
  return (
    <div className="wn-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()} onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div className="wn" role="dialog" aria-label="Was ist neu" data-testid="whats-new">
        <header className="wn-head">
          <span className="wn-kicker">{afterUpdate ? 'Update installiert' : 'Changelog'}</span>
          <h2>{top ? (top.version === UNRELEASED ? 'Demnächst in VibeDesk' : `Was ist neu in ${top.version}`) : 'Was ist neu'}</h2>
        </header>
        <div className="wn-body">
          {!entries.length && <p className="dim">Noch keine Einträge.</p>}
          {entries.map((e, i) => (
            <section key={e.version} className="wn-version">
              {i > 0 && <h3>{e.version === UNRELEASED ? 'Demnächst' : `Version ${e.version}`}</h3>}
              {e.sections.map((sec) => (
                <div key={sec.title} className={`wn-sec ${TONE[sec.title] ?? ''}`}>
                  <h4>{sec.title}</h4>
                  <ul>
                    {sec.items.map((it, j) => (
                      <li key={j}>{rich(it)}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
        <footer className="wn-foot">
          <button className="btn primary" autoFocus onClick={close} data-testid="whats-new-ok">
            {afterUpdate ? 'Los geht’s' : 'Schließen'}
          </button>
        </footer>
      </div>
    </div>
  )
}
