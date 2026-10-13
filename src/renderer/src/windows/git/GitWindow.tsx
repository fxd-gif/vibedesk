// Git & GitHub: Änderungen ansehen, vormerken, committen (mit KI-Nachricht), Verlauf, Push/Pull, Anmeldung.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, errorText } from '../../api'
import { STATUS_LABEL, isStaged, isUnstaged, letter, type GitCommit, type GitFile, type GitState, type GitStatus } from '../../../../shared/git'
import type { Project } from '../../../../shared/types'
import { Icon } from '../../desktop/icons'
import { activeProjectId } from '../../store/activeProject'
import { alert, confirm, useDialog } from '../../store/dialogStore'
import { inform } from '../../store/notifyStore'
import { relTime } from '../../util'
import { DiffView } from './DiffView'
import { cancelLogin, githubLogin, installTool, refreshTools, useGitAuth, withAuth } from './gitAuth'
import './git.css'

const POLL_MS = 3000

interface Sel {
  path: string
  staged: boolean
  untracked: boolean
}

// ---------- Einrichtung: Git fehlt, GitHub-Anmeldung ----------

function InstallLog(): React.JSX.Element | null {
  const install = useGitAuth((s) => s.install)
  if (!install) return null
  return (
    <div className="git-install">
      <span className="spin" /> {install.tool === 'git' ? 'Git' : 'GitHub-CLI'} wird installiert …
      {install.lines.length > 0 && <pre>{install.lines.join('\n')}</pre>}
    </div>
  )
}

function NoGit(): React.JSX.Element {
  const tools = useGitAuth((s) => s.tools)
  const busy = useGitAuth((s) => !!s.install)
  return (
    <div className="git-gate" data-testid="git-missing">
      <Icon name="github" size={32} />
      <h3>Git ist nicht installiert</h3>
      <p>Git merkt sich jede Version deines Projekts – damit kannst du Änderungen ansehen, zurücknehmen und zu GitHub hochladen.</p>
      {tools?.winget ? (
        <button className="btn primary" disabled={busy} onClick={() => void installTool('git')} data-testid="git-install">
          <Icon name="plus" size={14} /> Git installieren
        </button>
      ) : (
        <button className="btn primary" onClick={() => api.git.openWeb('https://git-scm.com/download/win')}>
          <Icon name="external" size={14} /> git-scm.com öffnen
        </button>
      )}
      <InstallLog />
    </div>
  )
}

function LoginOverlay(): React.JSX.Element | null {
  const login = useGitAuth((s) => s.login)
  const [copied, setCopied] = useState(false)
  if (!login) return null
  return (
    <div className="git-login" data-testid="git-login">
      <div className="git-login-card">
        <Icon name="github" size={28} />
        <h3>Bei GitHub anmelden</h3>
        {login.code ? (
          <>
            <p>Dein Browser hat sich geöffnet. Gib dort diesen Code ein und bestätige:</p>
            <button
              className="git-code mono"
              title="Kopieren"
              onClick={() => {
                void navigator.clipboard.writeText(login.code!)
                setCopied(true)
              }}
            >
              {login.code}
              <Icon name={copied ? 'check' : 'copy'} size={16} />
            </button>
            <p className="dim small">
              Kein Browser?{' '}
              <button className="linkish" onClick={() => api.git.openWeb(login.url)}>
                {login.url.replace('https://', '')}
              </button>
            </p>
            <p className="dim small">
              <span className="spin" /> Warte auf deine Bestätigung …
            </p>
          </>
        ) : (
          <p className="dim">
            <span className="spin" /> GitHub wird vorbereitet …
          </p>
        )}
        <button className="btn small ghost" onClick={cancelLogin}>
          Abbrechen
        </button>
      </div>
    </div>
  )
}

function Account({ needed }: { needed: boolean }): React.JSX.Element | null {
  const tools = useGitAuth((s) => s.tools)
  const busy = useGitAuth((s) => !!s.install || !!s.login)
  if (!tools) return null
  if (tools.gh === 'loggedIn')
    return (
      <button className="git-account" title="Bei GitHub angemeldet" onClick={() => api.git.openWeb(`https://github.com/${tools.ghUser ?? ''}`)} data-testid="git-account">
        <i className="dot done" /> {tools.ghUser ?? 'GitHub'}
      </button>
    )
  if (tools.gh === 'loggedOut')
    return (
      <button className={`btn small${needed ? ' primary' : ''}`} disabled={busy} onClick={() => void githubLogin()} data-testid="git-login-btn">
        <Icon name="github" size={13} /> Bei GitHub anmelden
      </button>
    )
  // gh fehlt: nur anbieten, wenn GitHub gerade gebraucht wird
  if (!needed || !tools.winget) return null
  return (
    <button className="btn small" disabled={busy} onClick={() => void installTool('gh').then((ok) => ok && githubLogin())} title="Die GitHub-CLI übernimmt die Anmeldung für Push und Pull">
      <Icon name="github" size={13} /> GitHub verbinden
    </button>
  )
}

// ---------- Änderungen ----------

function FileRow({ f, staged, active, onSelect, onToggle, onDiscard }: { f: GitFile; staged: boolean; active: boolean; onSelect(): void; onToggle(): void; onDiscard?: () => void }): React.JSX.Element {
  const l = letter(f, staged)
  const slash = f.path.lastIndexOf('/')
  return (
    <li className={`git-file${active ? ' on' : ''}`} onClick={onSelect} data-testid={`git-file-${f.path}`}>
      <span className={`git-letter l-${l}`} title={STATUS_LABEL[l] ?? l}>
        {l}
      </span>
      <span className="git-name" title={f.orig ? `${f.orig} → ${f.path}` : f.path}>
        {f.path.slice(slash + 1)}
        {slash > 0 && <small>{f.path.slice(0, slash)}</small>}
      </span>
      <span className="git-row-actions">
        {onDiscard && (
          <button title="Änderungen verwerfen" onClick={(e) => (e.stopPropagation(), onDiscard())}>
            <Icon name="restart" size={13} />
          </button>
        )}
        <button title={staged ? 'Zurücknehmen' : 'Vormerken'} onClick={(e) => (e.stopPropagation(), onToggle())} data-testid={`git-toggle-${f.path}`}>
          <Icon name={staged ? 'back' : 'plus'} size={13} />
        </button>
      </span>
    </li>
  )
}

function ChangesView({ projectId, st, reload }: { projectId: string; st: GitStatus; reload(): Promise<void> }): React.JSX.Element {
  const [sel, setSel] = useState<Sel | null>(null)
  const [diff, setDiff] = useState('')
  const [msg, setMsg] = useState('')
  const [ai, setAi] = useState(false)
  const [busy, setBusy] = useState(false)
  const staged = st.files.filter(isStaged)
  const unstaged = st.files.filter(isUnstaged)

  // Auswahl gültig halten und Diff nachladen, wenn sich etwas tut
  const key = st.files.map((f) => f.path + f.index + f.work).join('|')
  useEffect(() => {
    let s = sel
    if (s && !(s.staged ? staged : unstaged).some((f) => f.path === s!.path)) s = null
    if (!s) {
      const first = unstaged[0] ?? staged[0]
      s = first ? { path: first.path, staged: !unstaged[0], untracked: first.untracked } : null
    }
    if (s !== sel) setSel(s)
    if (!s) return setDiff('')
    let live = true
    api.git
      .diff(projectId, s.path, s.staged, s.untracked)
      .then((d) => live && setDiff(d))
      .catch(() => live && setDiff(''))
    return () => {
      live = false
    }
  }, [key, sel?.path, sel?.staged])

  const act = async (title: string, fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      await alert(title, errorText(err))
    } finally {
      setBusy(false)
      await reload()
    }
  }

  const discard = async (files: GitFile[]): Promise<void> => {
    const one = files.length === 1 ? files[0] : null
    const ok = await confirm({
      title: one ? `Änderungen an „${one.path}“ verwerfen?` : `${files.length} Änderungen verwerfen?`,
      message: one?.untracked ? 'Die neue Datei wandert in den Papierkorb.' : 'Die Datei wird auf den letzten Commit zurückgesetzt. Neue Dateien wandern in den Papierkorb.',
      confirmLabel: 'Verwerfen',
      danger: true
    })
    if (ok) await act('Verwerfen fehlgeschlagen', () => api.git.discard(projectId, files.map((f) => ({ path: f.path, untracked: f.untracked }))))
  }

  const all = staged.length === 0
  const count = all ? unstaged.length : staged.length
  const commit = async (): Promise<void> => {
    if (!msg.trim() || !count) return
    setBusy(true)
    try {
      const hash = await api.git.commit(projectId, msg, all)
      setMsg('')
      inform(`Commit ${hash}`, msg.split('\n')[0], st.remoteUrl ? [{ label: 'Pushen', primary: true, run: () => void withAuth('Push fehlgeschlagen', () => api.git.push(projectId, !!st.upstream)).then(reload) }] : undefined)
    } catch (err) {
      await alert('Commit fehlgeschlagen', errorText(err))
    } finally {
      setBusy(false)
      await reload()
    }
  }

  const writeAi = async (): Promise<void> => {
    setAi(true)
    try {
      setMsg(await api.git.aiMessage(projectId))
    } catch (err) {
      await alert('Keine KI-Nachricht', errorText(err))
    } finally {
      setAi(false)
    }
  }

  const list = (files: GitFile[], isSt: boolean): React.JSX.Element => (
    <ul className="git-files">
      {files.map((f) => (
        <FileRow
          key={(isSt ? 's:' : 'u:') + f.path}
          f={f}
          staged={isSt}
          active={sel?.path === f.path && sel.staged === isSt}
          onSelect={() => setSel({ path: f.path, staged: isSt, untracked: f.untracked })}
          onToggle={() => void act(isSt ? 'Zurücknehmen fehlgeschlagen' : 'Vormerken fehlgeschlagen', () => (isSt ? api.git.unstage(projectId, [f.path], st.unborn) : api.git.stage(projectId, [f.path])))}
          onDiscard={isSt ? undefined : () => void discard([f])}
        />
      ))}
    </ul>
  )

  return (
    <div className="git-split">
      <div className="git-side">
        <div className="git-lists">
          {!st.files.length && (
            <div className="panel-empty">
              Alles committet.
              <br />
              Sobald du oder Claude etwas änderst, erscheint es hier.
            </div>
          )}
          {staged.length > 0 && (
            <>
              <div className="git-group">
                <span>Vorgemerkt · {staged.length}</span>
                <button className="linkish" disabled={busy} onClick={() => void act('Zurücknehmen fehlgeschlagen', () => api.git.unstage(projectId, staged.map((f) => f.path), st.unborn))}>
                  alle zurücknehmen
                </button>
              </div>
              {list(staged, true)}
            </>
          )}
          {unstaged.length > 0 && (
            <>
              <div className="git-group">
                <span>Änderungen · {unstaged.length}</span>
                <span>
                  <button className="linkish" disabled={busy} onClick={() => void discard(unstaged)}>
                    verwerfen
                  </button>
                  <button className="linkish" disabled={busy} onClick={() => void act('Vormerken fehlgeschlagen', () => api.git.stageAll(projectId))} data-testid="git-stage-all">
                    alle vormerken
                  </button>
                </span>
              </div>
              {list(unstaged, false)}
            </>
          )}
        </div>
        <div className="git-commit">
          <textarea
            className="field"
            placeholder={count ? 'Was hast du geändert?' : 'Nichts zu committen'}
            value={msg}
            disabled={ai}
            onChange={(e) => setMsg(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault()
                void commit()
              }
            }}
            data-testid="git-message"
          />
          <div className="row between">
            <button className="btn small" disabled={ai || !st.files.length} onClick={() => void writeAi()} title="Claude schreibt die Nachricht aus deinen Änderungen" data-testid="git-ai">
              {ai ? <span className="spin" /> : <Icon name="spark" size={13} />} {ai ? 'Claude schreibt …' : 'KI-Nachricht'}
            </button>
            <button className="btn small primary" disabled={busy || ai || !msg.trim() || !count} onClick={() => void commit()} title="Strg+Enter" data-testid="git-commit">
              <Icon name="check" size={13} /> {all ? `Alles committen (${count})` : `Committen (${count})`}
            </button>
          </div>
        </div>
      </div>
      <div className="git-main">
        {sel && (
          <div className="git-main-head mono">
            {sel.path}
            <span className="dim">{sel.staged ? ' · vorgemerkt' : sel.untracked ? ' · neu' : ''}</span>
          </div>
        )}
        <DiffView text={diff} empty={sel ? 'Keine Textänderungen.' : 'Wähle links eine Datei.'} />
      </div>
    </div>
  )
}

// ---------- Verlauf ----------

function HistoryView({ projectId, headKey }: { projectId: string; headKey: string }): React.JSX.Element {
  const [log, setLog] = useState<GitCommit[] | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [show, setShow] = useState('')
  useEffect(() => {
    void api.git.log(projectId).then((l) => {
      setLog(l)
      setSel((s) => s ?? l[0]?.hash ?? null)
    })
  }, [projectId, headKey])
  useEffect(() => {
    if (!sel) return setShow('')
    let live = true
    api.git
      .show(projectId, sel)
      .then((s) => live && setShow(s))
      .catch(() => live && setShow(''))
    return () => {
      live = false
    }
  }, [projectId, sel])
  const [body, patch] = useMemo(() => {
    const i = show.indexOf('\0')
    return i < 0 ? ['', show] : [show.slice(0, i).trim(), show.slice(i + 1)]
  }, [show])
  if (!log) return <div className="panel-empty"><span className="spin" /></div>
  if (!log.length) return <div className="panel-empty">Noch keine Commits.</div>
  return (
    <div className="git-split">
      <ul className="git-side git-log">
        {log.map((c) => (
          <li key={c.hash} className={sel === c.hash ? 'on' : ''} onClick={() => setSel(c.hash)}>
            <b>{c.subject}</b>
            <small>
              <span className="mono">{c.short}</span> · {c.author} · {relTime(c.time)}
            </small>
          </li>
        ))}
      </ul>
      <div className="git-main">
        {body && <pre className="git-body">{body}</pre>}
        <DiffView text={patch} />
      </div>
    </div>
  )
}

// ---------- Fenster ----------

export function GitWindow(): React.JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState<string | null>(null)
  const [st, setSt] = useState<GitState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'changes' | 'history'>('changes')
  const [sync, setSync] = useState<null | 'pull' | 'push' | 'fetch' | 'publish'>(null)
  const tools = useGitAuth((s) => s.tools)
  const busyRef = useRef(false)

  useEffect(() => {
    void refreshTools()
    void api.projects.list().then((list) => {
      setProjects(list)
      setProjectId((cur) => cur ?? activeProjectId(list))
    })
  }, [])

  const reload = useCallback(async () => {
    if (!projectId) return
    try {
      setSt(await api.git.status(projectId))
      setError(null)
    } catch (err) {
      setError(errorText(err))
    }
  }, [projectId])

  useEffect(() => {
    setSt(null)
    void reload()
    const t = setInterval(() => !busyRef.current && document.visibilityState === 'visible' && void reload(), POLL_MS)
    return () => clearInterval(t)
  }, [reload])

  const run = async (kind: NonNullable<typeof sync>, title: string, fn: () => Promise<unknown>): Promise<void> => {
    setSync(kind)
    busyRef.current = true
    try {
      await withAuth(title, fn)
    } finally {
      busyRef.current = false
      setSync(null)
      await reload()
    }
  }

  const publish = async (s: GitStatus): Promise<void> => {
    const name = projects.find((p) => p.id === projectId)?.name ?? ''
    const r = await useDialog.getState().ask({
      kind: 'prompt',
      title: 'Auf GitHub veröffentlichen',
      message: 'Legt ein neues Repository in deinem GitHub-Konto an und lädt alle Commits hoch.',
      defaultValue: name.replace(/\s+/g, '-'),
      placeholder: 'Repo-Name',
      checkbox: 'Öffentlich sichtbar (sonst privat)',
      confirmLabel: 'Veröffentlichen'
    })
    if (!r.ok || !projectId) return
    if (s.unborn) return void alert('Noch kein Commit', 'Committe zuerst deine Dateien – dann kann VibeDesk sie hochladen.')
    await run('publish', 'Veröffentlichen fehlgeschlagen', async () => {
      const t = useGitAuth.getState().tools ?? (await refreshTools())
      if (t.gh !== 'loggedIn') {
        if (t.gh === 'missing' && !(await installTool('gh'))) return
        if (!(await githubLogin())) return
      }
      const url = await api.git.publish(projectId, r.value, !r.checked)
      inform('Auf GitHub veröffentlicht', url, url ? [{ label: 'Öffnen', primary: true, run: () => api.git.openWeb(url) }] : undefined)
    })
  }

  const project = projects.find((p) => p.id === projectId)
  const repo = st && st.repo ? st : null
  const githubNeeded = !!repo && (!repo.remoteUrl || /github\.com/i.test(repo.remoteUrl))

  let body: React.JSX.Element
  if (tools && !tools.git) body = <NoGit />
  else if (!projectId) body = <div className="panel-empty">Lege zuerst ein Projekt an.</div>
  else if (error) body = <div className="panel-empty">{error}</div>
  else if (!st) body = <div className="panel-empty"><span className="spin" /></div>
  else if (!st.repo)
    body = (
      <div className="git-gate" data-testid="git-norepo">
        <Icon name="github" size={32} />
        <h3>{project?.name ?? 'Dieses Projekt'} ist noch kein Git-Repository</h3>
        <p>Mit Git siehst du genau, was Claude geändert hat, kannst jederzeit zurück und dein Projekt auf GitHub sichern.</p>
        <button className="btn primary" onClick={() => void api.git.init(projectId).then(reload).catch((e) => alert('Git einrichten fehlgeschlagen', errorText(e)))} data-testid="git-init">
          <Icon name="plus" size={14} /> Git einrichten
        </button>
      </div>
    )
  else body = tab === 'changes' ? <ChangesView projectId={projectId} st={st} reload={reload} /> : <HistoryView projectId={projectId} headKey={`${st.branch}:${st.ahead}:${st.files.length}`} />

  return (
    <div className="git" data-testid="git-window">
      <div className="git-bar">
        <select className="field small git-project" value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value)}>
          {!projectId && <option value="">Projekt wählen</option>}
          {projects
            .filter((p) => !p.missing)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
        {repo && (
          <>
            <span className="git-branch mono" title={repo.upstream ? `verfolgt ${repo.upstream}` : 'ohne Gegenstück auf dem Server'}>
              <Icon name="agents" size={13} /> {repo.branch || 'main'}
            </span>
            <div className="row tabs git-tabs">
              <button className={`tab${tab === 'changes' ? ' on' : ''}`} onClick={() => setTab('changes')}>
                Änderungen{repo.files.length > 0 && <span className="tab-count">{repo.files.length}</span>}
              </button>
              <button className={`tab${tab === 'history' ? ' on' : ''}`} onClick={() => setTab('history')} data-testid="git-tab-history">
                Verlauf
              </button>
            </div>
          </>
        )}
        <span className="git-spacer" />
        {repo && repo.remoteUrl && (
          <>
            <button className="btn small ghost" disabled={!!sync} title="Neues vom Server holen" onClick={() => void run('fetch', 'Aktualisieren fehlgeschlagen', () => api.git.fetch(projectId!))}>
              {sync === 'fetch' ? <span className="spin" /> : <Icon name="restart" size={13} />}
            </button>
            <button className="btn small" disabled={!!sync || !repo.upstream} onClick={() => void run('pull', 'Pull fehlgeschlagen', () => api.git.pull(projectId!))} title="Änderungen vom Server holen">
              {sync === 'pull' ? <span className="spin" /> : '↓'} Pull{repo.behind ? ` ${repo.behind}` : ''}
            </button>
            <button
              className={`btn small${repo.ahead || !repo.upstream ? ' primary' : ''}`}
              disabled={!!sync || repo.unborn}
              onClick={() => void run('push', 'Push fehlgeschlagen', () => api.git.push(projectId!, !!repo.upstream))}
              title="Deine Commits hochladen"
              data-testid="git-push"
            >
              {sync === 'push' ? <span className="spin" /> : '↑'} Push{repo.ahead ? ` ${repo.ahead}` : ''}
            </button>
            {repo.webUrl && (
              <button className="btn small ghost" title={repo.webUrl} onClick={() => api.git.openWeb(repo.webUrl!)}>
                <Icon name="external" size={13} />
              </button>
            )}
          </>
        )}
        {repo && !repo.remoteUrl && (
          <button className="btn small primary" disabled={!!sync} onClick={() => void publish(repo)} data-testid="git-publish">
            {sync === 'publish' ? <span className="spin" /> : <Icon name="github" size={13} />} Auf GitHub veröffentlichen
          </button>
        )}
        <Account needed={githubNeeded} />
      </div>
      <InstallLog />
      <div className="git-body-wrap">{body}</div>
      <LoginOverlay />
    </div>
  )
}
