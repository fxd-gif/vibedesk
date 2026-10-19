// Datei-Vergleich: gewählte Session (mit Hunk-Auswahl) | Ziel | weitere Sessions, die dieselbe Datei ändern.
import { useEffect, useMemo, useState } from 'react'
import { api, errorText } from '../../api'
import { splitHunks, type MergeFileView, type MergeSession } from '../../../../shared/merge'
import { Icon } from '../../desktop/icons'
import { t } from '../../../../shared/i18n'
import { sessionName } from './mergeNames'

interface Props {
  projectId: string
  file: string
  session: MergeSession
  /** weitere Sessions mit derselben Datei (ohne die gewählte, ohne den Hauptordner) */
  others: MergeSession[]
  target: string
  conflict: boolean
  /** gewählte Hunks; undefined = alle */
  hunks: number[] | undefined
  onHunks?: (idx: number[], total: number) => void
  version: string
}

type Loaded = { view: MergeFileView | null; error: string | null }

function useFileView(projectId: string, wt: string, file: string, version: string): Loaded | null {
  const [st, setSt] = useState<Loaded | null>(null)
  useEffect(() => {
    let alive = true
    setSt(null)
    api.merge
      .fileDiff(projectId, wt, file)
      .then((view) => alive && setSt({ view, error: null }))
      .catch((err) => alive && setSt({ view: null, error: errorText(err) }))
    return () => {
      alive = false
    }
  }, [projectId, wt, file, version])
  return st
}

/** Hunks mit Zeilennummern; optional mit Auswahl je Hunk */
function HunkDiff({ diff, chosen, onToggle }: { diff: string; chosen?: Set<number>; onToggle?: (i: number) => void }): React.JSX.Element {
  const { hunks } = useMemo(() => splitHunks(diff), [diff])
  if (/^Binary files/m.test(diff) || /^GIT binary patch/m.test(diff)) return <div className="diff-binary">{t('Binärdatei – keine Textansicht')}</div>
  if (!hunks.length) return <div className="panel-empty">{t('Keine Änderungen.')}</div>
  return (
    <div className="diff ms-diff">
      <table>
        <tbody>
          {hunks.map((h, i) => {
            let o = h.oldStart
            let n = h.newStart
            const off = chosen && !chosen.has(i)
            return [
              <tr key={`h${i}`} className={`d-hunk${off ? ' off' : ''}`}>
                <td colSpan={3}>
                  {onToggle ? (
                    <label className="ms-hunk-pick" title={t('Diesen Abschnitt beim selektiven Merge übernehmen')}>
                      <input type="checkbox" checked={!off} onChange={() => onToggle(i)} data-testid={`merge-hunk-${i}`} />
                      {t('Abschnitt {n}', { n: i + 1 })}
                    </label>
                  ) : (
                    t('Abschnitt {n}', { n: i + 1 })
                  )}
                  <span className="dim mono"> {h.head.replace(/^@@[^@]+@@\s?/, '') || ''}</span>
                </td>
              </tr>,
              ...h.lines.map((l, j) => {
                const kind = l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : l.startsWith('\\') ? 'meta' : 'ctx'
                const oldNo = kind === 'add' || kind === 'meta' ? '' : o++
                const newNo = kind === 'del' || kind === 'meta' ? '' : n++
                return (
                  <tr key={`${i}-${j}`} className={`d-${kind}${off ? ' off' : ''}`}>
                    <td className="d-no">{oldNo}</td>
                    <td className="d-no">{newNo}</td>
                    <td className="d-text">
                      <span className="d-sign">{kind === 'add' ? '+' : kind === 'del' ? '−' : ' '}</span>
                      {l.slice(1)}
                    </td>
                  </tr>
                )
              })
            ]
          })}
        </tbody>
      </table>
    </div>
  )
}

function TargetText({ text }: { text: string | null }): React.JSX.Element {
  if (text === null) return <div className="panel-empty">{t('Im Ziel gibt es diese Datei (noch) nicht.')}</div>
  const lines = text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')
  return (
    <div className="diff ms-diff">
      <table>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="d-ctx">
              <td className="d-no">{i + 1}</td>
              <td className="d-text">{l}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Column({ title, tone, children }: { title: string; tone: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="ms-col">
      <header className={`ms-col-head tone-${tone}`}>
        <span className="ms-col-mark" />
        {title}
      </header>
      <div className="ms-col-body">{children}</div>
    </section>
  )
}

function OtherColumn({ projectId, s, file, version }: { projectId: string; s: MergeSession; file: string; version: string }): React.JSX.Element {
  const st = useFileView(projectId, s.path, file, version)
  return (
    <Column title={sessionName(s)} tone="other">
      {!st ? <div className="panel-empty"><span className="spin" /></div> : st.error ? <div className="panel-empty">{st.error}</div> : <HunkDiff diff={st.view!.diff} />}
    </Column>
  )
}

export function CompareView({ projectId, file, session, others, target, conflict, hunks, onHunks, version }: Props): React.JSX.Element {
  const st = useFileView(projectId, session.path, file, version)
  const total = useMemo(() => (st?.view ? splitHunks(st.view.diff).hunks.length : 0), [st])
  const chosen = useMemo(() => new Set(hunks ?? Array.from({ length: total }, (_, i) => i)), [hunks, total])
  const toggle = (i: number): void => {
    const next = new Set(chosen)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    onHunks?.([...next].sort((a, b) => a - b), total)
  }

  return (
    <div className="ms-compare" data-testid="merge-compare">
      <div className="ms-compare-head">
        <span className="mono">{file}</span>
        {conflict && (
          <span className="ms-badge conflict">
            <Icon name="alert" size={12} /> {t('Konflikt')}
          </span>
        )}
        {onHunks && total > 1 && <span className="dim ms-compare-hint">{t('{n} von {total} Abschnitten ausgewählt', { n: chosen.size, total })}</span>}
      </div>
      <div className="ms-cols">
        <Column title={sessionName(session)} tone="session">
          {!st ? <div className="panel-empty"><span className="spin" /></div> : st.error ? <div className="panel-empty">{st.error}</div> : <HunkDiff diff={st.view!.diff} chosen={onHunks ? chosen : undefined} onToggle={onHunks ? toggle : undefined} />}
        </Column>
        <Column title={t('Aktuell ({branch})', { branch: target })} tone="target">
          {!st ? <div className="panel-empty"><span className="spin" /></div> : <TargetText text={st.view?.target ?? null} />}
        </Column>
        {others.map((o) => (
          <OtherColumn key={o.path} projectId={projectId} s={o} file={file} version={version} />
        ))}
      </div>
    </div>
  )
}
