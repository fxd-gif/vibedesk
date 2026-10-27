// Git & GitHub: Änderungen ansehen, vormerken, committen (mit KI-Nachricht), Verlauf, Push/Pull, Anmeldung.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, errorText } from '../../api'
import { isStaged, isUnstaged, letter, validBranchName, type GitCommit, type GitFile, type GitState, type GitStatus } from '../../../../shared/git'
import type { Project } from '../../../../shared/types'
import { Icon } from '../../desktop/icons'
import { activeProjectId } from '../../store/activeProject'
import { alert, confirm, useDialog } from '../../store/dialogStore'
import { inform } from '../../store/notifyStore'
import { relTime } from '../../util'
import { DiffView } from './DiffView'
import { ensureGh, PrPanel } from './PrPanel'
import { cancelLogin, githubLogin, installTool, refreshTools, useGitAuth, withAuth } from './gitAuth'
import { tendPrompt } from '../brain/BrainWindow'
import { addonEvent } from '../../addons/appEvents'
import { promptProject } from '../../store/sessionPrompt'
import { useSettings } from '../../store/settingsStore'
import { t, tn } from '../../../../shared/i18n'
import './git.css'

const POLL_MS = 3000

/** Anzeigename eines Status-Buchstabens (M, N, D …) */
function statusLabel(l: string): string {
  switch (l) {
    case 'M':
      return t('geändert')
    case 'N':
      return t('neu')
    case 'D':
      return t('gelöscht')
    case 'R':
      return t('umbenannt')
    case 'C':
      return t('kopiert')
    case 'T':
      return t('Typ geändert')
    case 'U':
      return t('Konflikt')
    default:
      return l
  }
}

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
      <span className="spin" /> {t('{tool} wird installiert …', { tool: install.tool === 'git' ? 'Git' : 'GitHub CLI' })}
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
      <h3>{t('Git ist nicht installiert')}</h3>
      <p>{t('Git merkt sich jede Version deines Projekts – damit kannst du Änderungen ansehen, zurücknehmen und zu GitHub hochladen.')}</p>
      {tools?.winget ? (
        <button className="btn primary" disabled={busy} onClick={() => void installTool('git')} data-testid="git-install">
          <Icon name="plus" size={14} /> {t('Git installieren')}
        </button>
      ) : (
        <button className="btn primary" onClick={() => api.git.openWeb('https://git-scm.com/download/win')}>
          <Icon name="external" size={14} /> {t('git-scm.com öffnen')}
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
        <h3>{t('Bei GitHub anmelden')}</h3>
        {login.code ? (
          <>
            <p>{t('Dein Browser hat sich geöffnet. Gib dort diesen Code ein und bestätige:')}</p>
            <button
              className="git-code mono"
              title={t('Kopieren')}
              onClick={() => {
                void navigator.clipboard.writeText(login.code!)
                setCopied(true)
              }}
            >
              {login.code}
              <Icon name={copied ? 'check' : 'copy'} size={16} />
            </button>
            <p className="dim small">
              {t('Kein Browser?')}{' '}
              <button className="linkish" onClick={() => api.git.openWeb(login.url)}>
                {login.url.replace('https://', '')}
              </button>
            </p>
            <p className="dim small">
              <span className="spin" /> {t('Warte auf deine Bestätigung …')}
            </p>
          </>
        ) : (
          <p className="dim">
            <span className="spin" /> {t('GitHub wird vorbereitet …')}
          </p>
        )}
        <button className="btn small ghost" onClick={cancelLogin}>
          {t('Abbrechen')}
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
      <button className="git-account" title={t('Bei GitHub angemeldet')} onClick={() => api.git.openWeb(`https://github.com/${tools.ghUser ?? ''}`)} data-testid="git-account">
        <i className="dot done" /> {tools.ghUser ?? 'GitHub'}
      </button>
    )
  if (tools.gh === 'loggedOut')
    return (
      <button className={`btn small${needed ? ' primary' : ''}`} disabled={busy} onClick={() => void githubLogin()} data-testid="git-login-btn">
        <Icon name="github" size={13} /> {t('Bei GitHub anmelden')}
      </button>
    )
  // gh fehlt: nur anbieten, wenn GitHub gerade gebraucht wird
  if (!needed || !tools.winget) return null
  return (
    <button className="btn small" disabled={busy} onClick={() => void installTool('gh').then((ok) => ok && githubLogin())} title={t('Die GitHub-CLI übernimmt die Anmeldung für Push und Pull')}>
      <Icon name="github" size={13} /> {t('GitHub verbinden')}
    </button>
  )
}

// ---------- Änderungen ----------

function FileRow({ f, staged, active, onSelect, onToggle, onDiscard }: { f: GitFile; staged: boolean; active: boolean; onSelect(): void; onToggle(): void; onDiscard?: () => void }): React.JSX.Element {
  const l = letter(f, staged)
  const slash = f.path.lastIndexOf('/')
  return (
    <li className={`git-file${active ? ' on' : ''}`} onClick={onSelect} data-testid={`git-file-${f.path}`}>
      <span className={`git-letter l-${l}`} title={statusLabel(l)}>
        {l}
      </span>
      <span className="git-name" title={f.orig ? `${f.orig} → ${f.path}` : f.path}>
        {f.path.slice(slash + 1)}
        {slash > 0 && <small>{f.path.slice(0, slash)}</small>}
      </span>
      <span className="git-row-actions">
        {onDiscard && (
          <button title={t('Änderungen verwerfen')} onClick={(e) => (e.stopPropagation(), onDiscard())}>
            <Icon name="restart" size={13} />
          </button>
        )}
        <button title={staged ? t('Zurücknehmen') : t('Vormerken')} onClick={(e) => (e.stopPropagation(), onToggle())} data-testid={`git-toggle-${f.path}`}>
          <Icon name={staged ? 'back' : 'plus'} size={13} />
        </button>
      </span>
    </li>
  )
}

/** Branch im Kopf: Klick zeigt die lokalen Branches zum Wechseln und „Neuer Branch …“ */
function BranchMenu({ projectId, current, title, disabled, onSwitch }: { projectId: string; current: string; title: string; disabled: boolean; onSwitch(name: string, create: boolean): Promise<void> }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<string[]>([])
  const [name, setName] = useState('')
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    void api.git.branches(projectId).then(setList, () => setList([]))
    const away = (e: PointerEvent): void => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', away, true)
    return () => window.removeEventListener('pointerdown', away, true)
  }, [open, projectId])
  const go = (n: string, create: boolean): void => {
    setOpen(false)
    setName('')
    void onSwitch(n, create)
  }
  const valid = validBranchName(name) && !list.includes(name.trim())
  return (
    <div className="git-branch-wrap" ref={box}>
      <button className="git-branch mono" title={title} disabled={disabled} onClick={() => setOpen((v) => !v)} data-testid="git-branch">
        <Icon name="branch" size={13} /> {current} <span className="git-caret">▾</span>
      </button>
      {open && (
        <div className="git-branch-menu" data-testid="git-branch-menu">
          {list.map((b) => (
            <button key={b} className={`git-branch-item mono${b === current ? ' on' : ''}`} disabled={b === current} onClick={() => go(b, false)} data-testid={`git-branch-${b}`}>
              <span className="git-branch-check">{b === current ? '✓' : ''}</span>
              {b}
            </button>
          ))}
          <form
            className="git-branch-new"
            onSubmit={(e) => {
              e.preventDefault()
              if (valid) go(name.trim(), true)
            }}
          >
            <input className="field small mono" placeholder={t('Neuer Branch …')} value={name} onChange={(e) => setName(e.target.value)} data-testid="git-branch-new" />
            <button className="btn small primary" disabled={!valid} type="submit" data-testid="git-branch-create">
              {t('Anlegen')}
            </button>
          </form>
          <div className="dim tiny">{t('Nicht committete Änderungen nimmt git zum neuen Branch mit, solange sie nicht kollidieren.')}</div>
        </div>
      )}
    </div>
  )
}

/** Vor dem Commit: Notizen im Gehirn, deren Dateien sich seitdem geändert haben */
function BrainCheck({ projectId }: { projectId: string }): React.JSX.Element | null {
  const brainOn = useSettings((s) => s.s?.brainOn ?? true)
  const [stale, setStale] = useState(0)
  const [asked, setAsked] = useState(false)
  useEffect(() => {
    setAsked(false)
    if (!brainOn) return setStale(0)
    let live = true
    const load = (): void => void api.brain.view(projectId).then((v) => live && setStale(v?.stale ?? 0), () => live && setStale(0))
    load()
    const off = api.on.brainChanged((pid) => pid === projectId && load())
    return () => {
      live = false
      off()
    }
  }, [projectId, brainOn])
  if (!stale) return null
  return (
    <div className="git-hint" data-testid="git-brain-check">
      <Icon name="brain" size={13} />
      <span>{tn(stale, '{n} Gehirn-Notiz zu prüfen', '{n} Gehirn-Notizen zu prüfen')}</span>
      <button
        className="linkish"
        disabled={asked}
        title={t('Claude gleicht die Notizen mit dem Code ab, bevor du committest')}
        onClick={() => {
          setAsked(true)
          void promptProject(projectId, tendPrompt())
        }}
      >
        {asked ? t('Claude ist dran') : t('Claude pflegen lassen')}
      </button>
    </div>
  )
}

/** Konflikte nach Merge, Pull oder Rebase: Claude löst die Konfliktmarker */
function ConflictHelp({ projectId, files }: { projectId: string; files: GitFile[] }): React.JSX.Element {
  const [asked, setAsked] = useState(false)
  const key = files.map((f) => f.path).join('|')
  useEffect(() => setAsked(false), [key])
  return (
    <div className="git-conflict" data-testid="git-conflicts">
      <Icon name="alert" size={14} />
      <span>
        {tn(files.length, '{n} Datei mit Konflikt', '{n} Dateien mit Konflikt')}
        <small>{t('Beide Seiten haben dieselben Stellen geändert.')}</small>
      </span>
      <button
        className="btn small primary"
        disabled={asked}
        onClick={() => {
          setAsked(true)
          void promptProject(
            projectId,
            t('In diesem Projekt gibt es Git-Konflikte in: {files}. Löse die Konfliktmarker so, dass die Absichten beider Seiten erhalten bleiben, prüfe, ob alles baut, und markiere die Dateien mit git add als gelöst. Nicht committen.', {
              files: files.map((f) => f.path).join(', ')
            })
          )
        }}
        data-testid="git-conflicts-claude"
      >
        <Icon name="spark" size={13} /> {asked ? t('Claude ist dran') : t('Claude löst das')}
      </button>
    </div>
  )
}

function ChangesView({ projectId, projectName, st, reload }: { projectId: string; projectName?: string; st: GitStatus; reload(): Promise<void> }): React.JSX.Element {
  const [sel, setSel] = useState<Sel | null>(null)
  const [diff, setDiff] = useState('')
  const [msg, setMsg] = useState('')
  const [ai, setAi] = useState(false)
  const [busy, setBusy] = useState(false)
  const staged = st.files.filter(isStaged)
  const unstaged = st.files.filter(isUnstaged)
  const conflicts = st.files.filter((f) => f.conflict)

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
      title: one ? t('Änderungen an „{path}“ verwerfen?', { path: one.path }) : t('{n} Änderungen verwerfen?', { n: files.length }),
      message: one?.untracked ? t('Die neue Datei wandert in den Papierkorb.') : t('Die Datei wird auf den letzten Commit zurückgesetzt. Neue Dateien wandern in den Papierkorb.'),
      confirmLabel: t('Verwerfen'),
      danger: true
    })
    if (ok) await act(t('Verwerfen fehlgeschlagen'), () => api.git.discard(projectId, files.map((f) => ({ path: f.path, untracked: f.untracked }))))
  }

  const all = staged.length === 0
  const count = all ? unstaged.length : staged.length
  const commit = async (): Promise<void> => {
    if (!msg.trim() || !count) return
    setBusy(true)
    try {
      const hash = await api.git.commit(projectId, msg, all)
      addonEvent({ type: 'commit', message: msg.split('\n')[0], ...(projectName ? { project: projectName } : {}) })
      setMsg('')
      inform(t('Commit {hash}', { hash }), msg.split('\n')[0], st.remoteUrl ? [{ label: t('Pushen'), primary: true, run: () => void withAuth(t('Push fehlgeschlagen'), () => api.git.push(projectId, !!st.upstream)).then(reload) }] : undefined)
    } catch (err) {
      await alert(t('Commit fehlgeschlagen'), errorText(err))
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
      await alert(t('Keine KI-Nachricht'), errorText(err))
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
          onToggle={() => void act(isSt ? t('Zurücknehmen fehlgeschlagen') : t('Vormerken fehlgeschlagen'), () => (isSt ? api.git.unstage(projectId, [f.path], st.unborn) : api.git.stage(projectId, [f.path])))}
          onDiscard={isSt ? undefined : () => void discard([f])}
        />
      ))}
    </ul>
  )

  return (
    <div className="git-split">
      <div className="git-side">
        <div className="git-lists">
          {conflicts.length > 0 && <ConflictHelp projectId={projectId} files={conflicts} />}
          {!st.files.length && (
            <div className="panel-empty">
              {t('Alles committet.')}
              <br />
              {t('Sobald du oder Claude etwas änderst, erscheint es hier.')}
            </div>
          )}
          {staged.length > 0 && (
            <>
              <div className="git-group">
                <span>{t('Vorgemerkt · {n}', { n: staged.length })}</span>
                <button className="linkish" disabled={busy} onClick={() => void act(t('Zurücknehmen fehlgeschlagen'), () => api.git.unstage(projectId, staged.map((f) => f.path), st.unborn))}>
                  {t('alle zurücknehmen')}
                </button>
              </div>
              {list(staged, true)}
            </>
          )}
          {unstaged.length > 0 && (
            <>
              <div className="git-group">
                <span>{t('Änderungen · {n}', { n: unstaged.length })}</span>
                <span>
                  <button className="linkish" disabled={busy} onClick={() => void discard(unstaged)}>
                    {t('verwerfen')}
                  </button>
                  <button className="linkish" disabled={busy} onClick={() => void act(t('Vormerken fehlgeschlagen'), () => api.git.stageAll(projectId))} data-testid="git-stage-all">
                    {t('alle vormerken')}
                  </button>
                </span>
              </div>
              {list(unstaged, false)}
            </>
          )}
        </div>
        <div className="git-commit">
          {st.files.length > 0 && <BrainCheck projectId={projectId} />}
          <textarea
            className="field"
            placeholder={count ? t('Was hast du geändert?') : t('Nichts zu committen')}
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
            <button className="btn small" disabled={ai || !st.files.length} onClick={() => void writeAi()} title={t('Claude schreibt die Nachricht aus deinen Änderungen')} data-testid="git-ai">
              {ai ? <span className="spin" /> : <Icon name="spark" size={13} />} {ai ? t('Claude schreibt …') : t('KI-Nachricht')}
            </button>
            <button className="btn small primary" disabled={busy || ai || !msg.trim() || !count} onClick={() => void commit()} title={t('Strg+Enter')} data-testid="git-commit">
              <Icon name="check" size={13} /> {all ? t('Alles committen ({n})', { n: count }) : t('Committen ({n})', { n: count })}
            </button>
          </div>
        </div>
      </div>
      <div className="git-main">
        {sel && (
          <div className="git-main-head mono">
            {sel.path}
            <span className="dim">{sel.staged ? t(' · vorgemerkt') : sel.untracked ? t(' · neu') : ''}</span>
          </div>
        )}
        <DiffView text={diff} empty={sel ? t('Keine Textänderungen.') : t('Wähle links eine Datei.')} />
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
  if (!log.length) return <div className="panel-empty">{t('Noch keine Commits.')}</div>
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
  const [sync, setSync] = useState<null | 'pull' | 'push' | 'fetch' | 'publish' | 'switch'>(null)
  const [pr, setPr] = useState(false)
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
    const timer = setInterval(() => !busyRef.current && document.visibilityState === 'visible' && void reload(), POLL_MS)
    return () => clearInterval(timer)
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
      title: t('Auf GitHub veröffentlichen'),
      message: t('Legt ein neues Repository in deinem GitHub-Konto an und lädt alle Commits hoch.'),
      defaultValue: name.replace(/\s+/g, '-'),
      placeholder: t('Repo-Name'),
      checkbox: t('Öffentlich sichtbar (sonst privat)'),
      confirmLabel: t('Veröffentlichen')
    })
    if (!r.ok || !projectId) return
    if (s.unborn) return void alert(t('Noch kein Commit'), t('Committe zuerst deine Dateien – dann kann VibeDesk sie hochladen.'))
    await run('publish', t('Veröffentlichen fehlgeschlagen'), async () => {
      if (!(await ensureGh())) return
      const url = await api.git.publish(projectId, r.value, !r.checked)
      inform(t('Auf GitHub veröffentlicht'), url, url ? [{ label: t('Öffnen'), primary: true, run: () => api.git.openWeb(url) }] : undefined)
    })
  }

  const project = projects.find((p) => p.id === projectId)
  const repo = st && st.repo ? st : null
  const githubNeeded = !!repo && (!repo.remoteUrl || /github\.com/i.test(repo.remoteUrl))

  let body: React.JSX.Element
  if (tools && !tools.git) body = <NoGit />
  else if (!projectId) body = <div className="panel-empty">{t('Lege zuerst ein Projekt an.')}</div>
  else if (error) body = <div className="panel-empty">{error}</div>
  else if (!st) body = <div className="panel-empty"><span className="spin" /></div>
  else if (!st.repo)
    body = (
      <div className="git-gate" data-testid="git-norepo">
        <Icon name="github" size={32} />
        <h3>{project ? t('{name} ist noch kein Git-Repository', { name: project.name }) : t('Dieses Projekt ist noch kein Git-Repository')}</h3>
        <p>{t('Mit Git siehst du genau, was Claude geändert hat, kannst jederzeit zurück und dein Projekt auf GitHub sichern.')}</p>
        <button className="btn primary" onClick={() => void api.git.init(projectId).then(reload).catch((e) => alert(t('Git einrichten fehlgeschlagen'), errorText(e)))} data-testid="git-init">
          <Icon name="plus" size={14} /> {t('Git einrichten')}
        </button>
      </div>
    )
  else body = tab === 'changes' ? <ChangesView projectId={projectId} projectName={project?.name} st={st} reload={reload} /> : <HistoryView projectId={projectId} headKey={`${st.branch}:${st.ahead}:${st.files.length}`} />

  return (
    <div className="git" data-testid="git-window">
      <div className="git-bar">
        <select className="field small git-project" value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value)}>
          {!projectId && <option value="">{t('Projekt wählen')}</option>}
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
            <BranchMenu
              projectId={projectId!}
              current={repo.branch || 'main'}
              title={repo.upstream ? t('verfolgt {upstream}', { upstream: repo.upstream }) : t('ohne Gegenstück auf dem Server')}
              disabled={!!sync}
              onSwitch={(name, create) => run('switch', create ? t('Branch anlegen fehlgeschlagen') : t('Branch wechseln fehlgeschlagen'), () => api.git.switchBranch(projectId!, name, create))}
            />
            <div className="row tabs git-tabs">
              <button className={`tab${tab === 'changes' ? ' on' : ''}`} onClick={() => setTab('changes')}>
                {t('Änderungen')}{repo.files.length > 0 && <span className="tab-count">{repo.files.length}</span>}
              </button>
              <button className={`tab${tab === 'history' ? ' on' : ''}`} onClick={() => setTab('history')} data-testid="git-tab-history">
                {t('Verlauf')}
              </button>
            </div>
          </>
        )}
        <span className="git-spacer" />
        {repo && repo.remoteUrl && (
          <>
            <button className="btn small ghost" disabled={!!sync} title={t('Neues vom Server holen')} onClick={() => void run('fetch', t('Aktualisieren fehlgeschlagen'), () => api.git.fetch(projectId!))}>
              {sync === 'fetch' ? <span className="spin" /> : <Icon name="restart" size={13} />}
            </button>
            <button className="btn small" disabled={!!sync || !repo.upstream} onClick={() => void run('pull', t('Pull fehlgeschlagen'), () => api.git.pull(projectId!))} title={t('Änderungen vom Server holen')}>
              {sync === 'pull' ? <span className="spin" /> : '↓'} Pull{repo.behind ? ` ${repo.behind}` : ''}
            </button>
            <button
              className={`btn small${repo.ahead || !repo.upstream ? ' primary' : ''}`}
              disabled={!!sync || repo.unborn}
              onClick={() => void run('push', t('Push fehlgeschlagen'), () => api.git.push(projectId!, !!repo.upstream))}
              title={t('Deine Commits hochladen')}
              data-testid="git-push"
            >
              {sync === 'push' ? <span className="spin" /> : '↑'} Push{repo.ahead ? ` ${repo.ahead}` : ''}
            </button>
            {/github\.com/i.test(repo.remoteUrl) && !repo.unborn && (
              <button className="btn small" disabled={!!sync} onClick={() => setPr(true)} title={t('Branch pushen und auf GitHub einen Pull Request öffnen')} data-testid="git-pr">
                <Icon name="merge" size={13} /> {t('Pull Request')}
              </button>
            )}
            {repo.webUrl && (
              <button className="btn small ghost" title={repo.webUrl} onClick={() => api.git.openWeb(repo.webUrl!)}>
                <Icon name="external" size={13} />
              </button>
            )}
          </>
        )}
        {repo && !repo.remoteUrl && (
          <button className="btn small primary" disabled={!!sync} onClick={() => void publish(repo)} data-testid="git-publish">
            {sync === 'publish' ? <span className="spin" /> : <Icon name="github" size={13} />} {t('Auf GitHub veröffentlichen')}
          </button>
        )}
        <Account needed={githubNeeded} />
      </div>
      <InstallLog />
      <div className="git-body-wrap">{body}</div>
      <LoginOverlay />
      {pr && projectId && (
        <PrPanel
          projectId={projectId}
          onClose={() => setPr(false)}
          onDone={() => {
            setPr(false)
            void reload()
          }}
        />
      )}
    </div>
  )
}
