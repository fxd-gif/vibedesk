// Pull Request aus dem Git-Fenster: Claude schlägt Titel und Beschreibung vor, du prüfst und schickst ab.
import { useEffect, useRef, useState } from 'react'
import { api, errorText } from '../../api'
import { prBranchName, validBranchName, type PrInfo } from '../../../../shared/git'
import { t } from '../../../../shared/i18n'
import { Icon } from '../../desktop/icons'
import { alert } from '../../store/dialogStore'
import { inform } from '../../store/notifyStore'
import { githubLogin, installTool, refreshTools, useGitAuth, withAuth } from './gitAuth'

/** gh da und angemeldet? Sonst installieren bzw. anmelden – false = abgebrochen */
export async function ensureGh(): Promise<boolean> {
  const tl = useGitAuth.getState().tools ?? (await refreshTools())
  if (tl.gh === 'loggedIn') return true
  if (tl.gh === 'missing' && !(await installTool('gh'))) return false
  return githubLogin()
}

export function PrPanel({ projectId, onClose, onDone }: { projectId: string; onClose(): void; onDone(): void }): React.JSX.Element {
  const [info, setInfo] = useState<PrInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [branch, setBranch] = useState('')
  const [branchTouched, setBranchTouched] = useState(false)
  const [draft, setDraft] = useState(false)
  const [ai, setAi] = useState(false)
  const [busy, setBusy] = useState(false)
  const asked = useRef(false)

  const writeAi = async (): Promise<void> => {
    setAi(true)
    try {
      const pr = await api.git.aiPr(projectId)
      setTitle(pr.title)
      setBody(pr.body)
    } catch (err) {
      await alert(t('Kein Vorschlag von Claude'), errorText(err))
    } finally {
      setAi(false)
    }
  }

  useEffect(() => {
    let live = true
    api.git
      .prInfo(projectId)
      .then((i) => {
        if (!live) return
        setInfo(i)
        // Claude schreibt gleich los – du musst nur noch prüfen
        if (!i.existing && i.commits.length && !asked.current) {
          asked.current = true
          void writeAi()
        }
      })
      .catch((err) => live && setError(errorText(err)))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  // Branch-Name folgt dem Titel, bis man ihn selbst ändert
  useEffect(() => {
    if (!branchTouched) setBranch(title ? prBranchName(title) : '')
  }, [title, branchTouched])

  const send = async (): Promise<void> => {
    if (!info || !title.trim()) return
    if (info.onBase && !validBranchName(branch)) return void alert(t('Ungültiger Branch-Name'), t('Erlaubt sind Buchstaben, Ziffern, „-“, „_“, „.“ und „/“.'))
    setBusy(true)
    try {
      if (!(await ensureGh())) return
      const url = await withAuth(t('Pull Request fehlgeschlagen'), () => api.git.createPr(projectId, { title, body, branch: info.onBase ? branch : undefined, draft }))
      if (url === undefined) return
      inform(t('Pull Request geöffnet'), url || title, url ? [{ label: t('Ansehen'), primary: true, run: () => api.git.openWeb(url) }] : undefined)
      onDone()
    } finally {
      setBusy(false)
    }
  }

  let content: React.JSX.Element
  if (error) content = <div className="panel-empty">{error}</div>
  else if (!info) content = <div className="panel-empty"><span className="spin" /></div>
  else if (info.existing)
    content = (
      <div className="git-pr-existing" data-testid="pr-existing">
        <p>{t('Für „{branch}“ ist schon ein Pull Request offen:', { branch: info.branch })}</p>
        <b>{info.existing.title}</b>
        <button className="btn small primary" onClick={() => api.git.openWeb(info.existing!.url)}>
          <Icon name="external" size={13} /> {t('Auf GitHub ansehen')}
        </button>
        <p className="dim small">{t('Neue Commits landen nach einem Push automatisch darin.')}</p>
      </div>
    )
  else if (!info.commits.length) content = <div className="panel-empty">{t('Auf „{branch}“ gibt es noch keine Commits, die nicht schon auf „{base}“ sind.', { branch: info.branch, base: info.base })}</div>
  else
    content = (
      <>
        <div className="git-pr-route small">
          {info.onBase ? (
            <label className="row">
              <span className="dim">{t('Neuer Branch')}</span>
              <input
                className="field small mono"
                value={branch}
                onChange={(e) => {
                  setBranch(e.target.value)
                  setBranchTouched(true)
                }}
                data-testid="pr-branch"
              />
            </label>
          ) : (
            <span className="mono">{info.branch}</span>
          )}
          <span className="dim">→</span>
          <span className="mono">{info.base}</span>
          <span className="dim">· {t('{n} Commits', { n: info.commits.length })}</span>
        </div>
        <input className="field" placeholder={ai ? t('Claude schreibt …') : t('Titel')} value={title} disabled={ai} onChange={(e) => setTitle(e.target.value)} data-testid="pr-title" />
        <textarea className="field git-pr-body" placeholder={ai ? '' : t('Beschreibung (Markdown)')} value={body} disabled={ai} onChange={(e) => setBody(e.target.value)} data-testid="pr-body" />
        {info.dirty > 0 && <div className="dim small">{t('{n} nicht committete Änderungen kommen nicht mit.', { n: info.dirty })}</div>}
        <div className="row between">
          <span className="row">
            <button className="btn small" disabled={ai || busy} onClick={() => void writeAi()} data-testid="pr-ai">
              {ai ? <span className="spin" /> : <Icon name="spark" size={13} />} {ai ? t('Claude schreibt …') : t('Neu vorschlagen')}
            </button>
            <label className="row small">
              <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} data-testid="pr-draft" /> {t('Als Entwurf')}
            </label>
          </span>
          <button className="btn small primary" disabled={ai || busy || !title.trim()} onClick={() => void send()} data-testid="pr-send">
            {busy ? <span className="spin" /> : <Icon name="github" size={13} />} {t('Pull Request öffnen')}
          </button>
        </div>
      </>
    )

  return (
    <div className="git-pr-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="git-pr" role="dialog" aria-label={t('Pull Request')} data-testid="pr-panel">
        <div className="row between">
          <b>{t('Pull Request')}</b>
          <button className="btn small ghost" onClick={onClose} aria-label={t('Schließen')}>
            ×
          </button>
        </div>
        {content}
      </div>
    </div>
  )
}
