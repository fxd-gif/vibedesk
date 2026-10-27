// Session-Abschluss: was Claude in der Runde gemacht hat, welche Dateien sich geändert haben,
// was ins Gehirn kam – und ein Commit mit Nachricht von Claude, alles in einem Schritt.
import { useEffect, useState } from 'react'
import { turnShare, type WrapChanges } from '../../../shared/wrapUp'
import { t, tn } from '../../../shared/i18n'
import { api, errorText } from '../api'
import { Icon } from '../desktop/icons'
import { inform } from '../store/notifyStore'
import { termWin, useSessions } from '../store/sessionStore'
import { useSettings } from '../store/settingsStore'
import { redactText } from '../store/streamerStore'
import { useUi } from '../store/uiStore'
import { closeWrapUp, finishWrapUp, useWrapUp } from '../store/wrapUpStore'
import { Markdown } from './brain/Markdown'
import { addonEvent } from '../addons/appEvents'

export function WrapUpDialog(): React.JSX.Element | null {
  const open = useWrapUp((s) => s.open)
  // eigene Instanz pro Session → alles lädt frisch
  return open ? <WrapUpBox key={open} sessionId={open} /> : null
}

const MAX_FILES_SHOWN = 40

function WrapUpBox({ sessionId }: { sessionId: string }): React.JSX.Element {
  const session = useSessions((s) => s.sessions.find((x) => x.id === sessionId))
  const turn = useWrapUp((s) => s.turns[sessionId])
  const notes = useWrapUp((s) => (session ? s.notes[session.projectId] : undefined)) ?? []
  const brainOn = useSettings((s) => s.s?.brainOn)
  const [changes, setChanges] = useState<WrapChanges | null>(null)
  const [loadError, setLoadError] = useState('')
  const [message, setMessage] = useState('')
  const [writing, setWriting] = useState(false)
  const [msgError, setMsgError] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const suggest = (): void => {
    setWriting(true)
    setMsgError('')
    api.wrapUp
      .aiMessage(sessionId)
      .then((m) => setMessage((cur) => (cur.trim() ? cur : m)))
      .catch((e) => setMsgError(errorText(e)))
      .finally(() => setWriting(false))
  }

  useEffect(() => {
    let alive = true
    api.wrapUp
      .changes(sessionId)
      .then((c) => {
        if (!alive) return
        setChanges(c)
        if (c.repo && c.files.length) suggest()
      })
      .catch((e) => alive && setLoadError(errorText(e)))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const files = changes?.repo ? changes.files : []
  const share = session && turn ? turnShare(turn.files, session.cwd, files) : null
  const mine = new Set((turn?.files ?? []).map((f) => f.replace(/\\/g, '/').toLowerCase()))
  const root = (session?.cwd ?? '').replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '') + '/'
  const isMine = (p: string): boolean => mine.has(root + p.toLowerCase())

  const commit = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const hash = await api.wrapUp.commit(sessionId, message)
      finishWrapUp(sessionId)
      addonEvent({ type: 'commit', message: message.split('\n')[0], ...(session ? { project: session.name } : {}), session: sessionId })
      inform(t('Commit {hash} erstellt', { hash }), message.split('\n')[0], [{ label: t('Git-Fenster'), run: () => useUi.getState().openWin('git') }], `wrapup:${sessionId}`)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const toGit = (): void => {
    useUi.getState().openWin('git')
    closeWrapUp()
  }

  const name = session?.name ?? 'Claude'
  return (
    <div className="dlg-backdrop" onPointerDown={(e) => e.target === e.currentTarget && closeWrapUp()}>
      <div className="dlg wrapup-dlg" role="dialog" aria-label={t('Abschluss: {name}', { name })} onKeyDown={(e) => e.key === 'Escape' && closeWrapUp()} data-testid="wrapup">
        <h3>
          <Icon name="check" size={15} /> {t('Abschluss: {name}', { name })}
          {changes?.repo && <span className="dim wrapup-branch">· {changes.branch}</span>}
        </h3>

        <div className="wrapup-section">
          <div className="wrapup-label">{t('Was Claude gemacht hat')}</div>
          {turn?.summary ? (
            <div className="wrapup-summary">
              <Markdown text={redactText(turn.summary)} onLink={() => {}} />
            </div>
          ) : (
            <p className="dim small">
              {t('Keine Zusammenfassung gefunden – die letzte Antwort steht im Terminal.')}{' '}
              <button className="linkish" onClick={() => (useUi.getState().focus(termWin(sessionId)), closeWrapUp())}>
                {t('Zum Terminal')}
              </button>
            </p>
          )}
        </div>

        <div className="wrapup-section">
          <div className="wrapup-label">
            {t('Änderungen')}
            {share && share.other > 0 && <span className="dim"> · {tn(share.other, 'eine davon nicht aus dieser Runde', '{n} davon nicht aus dieser Runde')}</span>}
          </div>
          {loadError ? (
            <p className="warn small">{loadError}</p>
          ) : !changes ? (
            <p className="dim small">{t('Lädt …')}</p>
          ) : !changes.repo ? (
            <p className="dim small">{t('Dieser Ordner ist kein Git-Repository – im Git-Fenster kannst du eins anlegen.')}</p>
          ) : !files.length ? (
            <p className="dim small">{t('Alles ist schon committet.')}</p>
          ) : (
            <ul className="wrapup-files" data-testid="wrapup-files">
              {files.slice(0, MAX_FILES_SHOWN).map((f) => (
                <li key={f.path} className={isMine(f.path) ? '' : 'other'} title={isMine(f.path) ? undefined : t('nicht aus dieser Runde')}>
                  <span className="mono path">{redactText(f.path)}</span>
                  {f.untracked && <span className="tag">{t('neu')}</span>}
                  <span className="mono nums">
                    {f.add !== null && <span className="add">+{f.add}</span>}
                    {f.del !== null && f.del > 0 && <span className="del">−{f.del}</span>}
                  </span>
                </li>
              ))}
              {files.length > MAX_FILES_SHOWN && <li className="dim">{t('… und {n} weitere', { n: files.length - MAX_FILES_SHOWN })}</li>}
            </ul>
          )}
        </div>

        {brainOn && (
          <div className="wrapup-section">
            <div className="wrapup-label">{t('Gehirn')}</div>
            <p className="small">
              {notes.length ? (
                <>
                  {tn(notes.length, 'Eine Notiz festgehalten:', '{n} Notizen festgehalten:')} <span className="dim">{notes.join(' · ')}</span>
                </>
              ) : (
                <span className="dim">{t('Nichts Neues festgehalten – die nächste Session startet mit dem bisherigen Wissen.')}</span>
              )}
            </p>
          </div>
        )}

        {changes?.repo && files.length > 0 && (
          <div className="wrapup-section">
            <div className="wrapup-label">
              {t('Commit-Nachricht')}
              {!writing && (
                <button className="linkish" onClick={() => (setMessage(''), suggest())} data-testid="wrapup-suggest">
                  {t('Neu vorschlagen')}
                </button>
              )}
            </div>
            <textarea
              className="field mono"
              rows={4}
              value={message}
              placeholder={writing ? t('Claude schreibt die Nachricht …') : t('Was hat sich geändert?')}
              onChange={(e) => setMessage(e.target.value)}
              data-testid="wrapup-message"
            />
            {msgError && <p className="warn small">{msgError}</p>}
          </div>
        )}

        {error && <p className="warn small">{error}</p>}
        <div className="dlg-actions">
          <button className="btn ghost" onClick={closeWrapUp}>
            {t('Später')}
          </button>
          {changes?.repo && (
            <button className="btn" onClick={toGit}>
              {t('Im Git-Fenster')}
            </button>
          )}
          {changes?.repo && files.length > 0 && (
            <button className="btn primary" disabled={busy || !message.trim()} onClick={() => void commit()} data-testid="wrapup-commit">
              {busy ? t('Committet …') : tn(files.length, 'Datei committen', '{n} Dateien committen')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
