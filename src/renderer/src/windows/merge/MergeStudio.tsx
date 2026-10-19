// Merge Studio: parallele Claude-Sessions (Git-Worktrees) vergleichen, Konflikte sehen, prüfen und sicher zusammenführen.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, errorText } from '../../api'
import { overlaps, samePath, sessionState, type Checkpoint, type MergeFile, type MergeOverview, type MergeSession, type ReviewResult, type TestRun } from '../../../../shared/merge'
import type { Project, SessionStatus } from '../../../../shared/types'
import { Icon } from '../../desktop/icons'
import { activeProjectId } from '../../store/activeProject'
import { alert, confirm, useDialog } from '../../store/dialogStore'
import { inform } from '../../store/notifyStore'
import { ensureSession, sendToSession } from '../../store/sessionPrompt'
import { termWin, useSessions } from '../../store/sessionStore'
import { useSettings } from '../../store/settingsStore'
import { useUi } from '../../store/uiStore'
import { useWorkflow } from '../../store/workflowStore'
import { openInEditor } from '../../store/editorStore'
import { relTime } from '../../util'
import { t, tn } from '../../../../shared/i18n'
import { CompareView } from './CompareView'
import { sessionName } from './mergeNames'
import '../git/git.css'
import './merge.css'

const POLL_MS = 4000
const LOG_MAX = 400

type Tab = 'overview' | 'diff' | 'conflicts' | 'review' | 'tests' | 'checkpoints'

/** Pro Session: angehakte Dateien und (teilweise) gewählte Abschnitte */
type Picks = Record<string, { files: Record<string, true>; hunks: Record<string, number[]> }>

/** echte Konflikte einer Session: mit dem Ziel oder mit einer anderen Session */
const clashing = (s: MergeSession, file: string): boolean => s.conflicts.includes(file) || s.clashes.some((c) => c.files.includes(file))

const STATE_LABEL = (): Record<string, string> => ({ conflict: t('Konflikte'), review: t('Prüfen'), ready: t('Bereit'), empty: t('Keine Änderungen') })

function useLiveStatus(path: string): { id: string; status: SessionStatus } | null {
  const s = useSessions((x) => x.sessions.find((y) => samePath(y.cwd, path)))
  const status = useWorkflow((w) => (s ? w.sessions[s.id]?.status ?? 'idle' : 'idle'))
  return s ? { id: s.id, status } : null
}

// ---------- Session-Karte ----------

function SessionCard({ s, on, shared, projectId, onSelect, onCommit, onRemove }: { s: MergeSession; on: boolean; shared: Map<string, string[]>; projectId: string; onSelect(): void; onCommit(): void; onRemove(): void }): React.JSX.Element {
  const live = useLiveStatus(s.path)
  const state = s.main ? null : sessionState(s, shared)
  const startClaude = (): void => {
    if (live) useUi.getState().focus(termWin(live.id))
    else void useSessions.getState().start(projectId, undefined, s.path)
  }
  return (
    <div className={`ms-card${on ? ' on' : ''}${s.main ? ' main' : ''}`} onClick={onSelect} data-testid={`merge-card-${sessionName(s)}`}>
      <div className="ms-card-top">
        <span className={`dot ${live ? live.status : 'idle'}`} title={live ? t('Claude läuft hier') : t('Keine Claude-Session in diesem Ordner')} />
        <b>{sessionName(s)}</b>
        {s.locked && <span className="dim" title={t('Worktree ist gesperrt')}>🔒</span>}
      </div>
      <div className="ms-card-sub dim">{s.main ? t('Ziel aller Merges') : s.files.length ? tn(s.files.length, '{n} Datei geändert', '{n} Dateien geändert') + (s.ahead ? ' · ' + tn(s.ahead, '{n} Commit', '{n} Commits') : '') : t('noch keine Änderungen')}</div>
      <div className="ms-card-row">
        <Icon name="branch" size={13} />
        <span className="mono ms-card-branch">{s.branch ?? s.head.slice(0, 7)}</span>
        <span className="ms-stat">
          <i className="add">+{s.add}</i> <i className="del">−{s.del}</i>
        </span>
        {s.changedAt > 0 && <span className="dim ms-age">{relTime(s.changedAt)}</span>}
      </div>
      <div className="ms-card-foot">
        {s.main ? <span className="ms-badge target">{t('Ziel')}</span> : <span className={`ms-badge ${state}`}>{state === 'conflict' && <Icon name="alert" size={11} />}{STATE_LABEL()[state!]}</span>}
        {s.dirty > 0 && !s.main && <span className="ms-badge dirty" title={t('Noch nicht committete Änderungen')}>{tn(s.dirty, '{n} offen', '{n} offen')}</span>}
        <span className="ms-card-actions" onClick={(e) => e.stopPropagation()}>
          <button className="gbtn" title={live ? t('Terminal zeigen') : t('Claude Code in diesem Worktree starten')} onClick={startClaude} data-testid={`merge-claude-${sessionName(s)}`}>
            <Icon name={live ? 'terminal' : 'play'} size={14} />
          </button>
          {!s.main && s.dirty > 0 && (
            <button className="gbtn" title={t('Änderungen dieser Session committen')} onClick={onCommit}>
              <Icon name="check" size={14} />
            </button>
          )}
          {!s.main && (
            <button className="gbtn" title={t('Worktree entfernen')} onClick={onRemove}>
              <Icon name="trash" size={14} />
            </button>
          )}
        </span>
      </div>
    </div>
  )
}

// ---------- Dateiliste ----------

function FileRow({ f, on, picked, conflict, shared, onOpen, onPick }: { f: MergeFile; on: boolean; picked: boolean; conflict: boolean; shared: boolean; onOpen(): void; onPick?(v: boolean): void }): React.JSX.Element {
  const letter = f.status === 'A' ? 'N' : f.status
  return (
    <li className={`git-file ms-file${on ? ' on' : ''}`} onClick={onOpen} data-testid={`merge-file-${f.path}`}>
      {onPick && <input type="checkbox" checked={picked} onClick={(e) => e.stopPropagation()} onChange={(e) => onPick(e.target.checked)} title={t('Beim selektiven Merge übernehmen')} data-testid={`merge-pick-${f.path}`} />}
      <span className={`git-letter l-${letter}`}>{letter}</span>
      <span className="git-name" title={f.path}>
        {f.path}
        {f.dirty && <small>{t('ungespeichert')}</small>}
      </span>
      <span className="ms-stat">
        {f.binary ? <i className="dim">bin</i> : (
          <>
            <i className="add">+{f.add}</i> <i className="del">−{f.del}</i>
          </>
        )}
      </span>
      {conflict ? <Icon name="alert" size={13} /> : shared ? <span className="ms-shared" title={t('Auch in einer anderen Session geändert')} /> : null}
    </li>
  )
}

// ---------- Fenster ----------

export function MergeStudio(): React.JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState<string | null>(null)
  const [ov, setOv] = useState<MergeOverview | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [selPath, setSelPath] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [file, setFile] = useState<string | null>(null)
  const [picks, setPicks] = useState<Picks>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [review, setReview] = useState<ReviewResult | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [testLog, setTestLog] = useState<string[]>([])
  const [testRun, setTestRun] = useState<(TestRun & { wt: string }) | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [ckpts, setCkpts] = useState<Checkpoint[]>([])
  const busyRef = useRef(false)
  const visible = useUi((s) => s.open.includes('merge') && !s.minimized.includes('merge') && (s.open[s.open.length - 1] === 'merge' || useSettings.getState().s?.layout !== 'studio'))
  const testCmdSetting = useSettings((s) => (projectId ? s.s?.mergeTestCmd?.[projectId] : undefined))
  const [testCmd, setTestCmd] = useState('')

  useEffect(() => {
    void api.projects.list().then((list) => {
      setProjects(list.filter((p) => !p.missing))
      setProjectId((cur) => cur ?? activeProjectId(list))
    })
  }, [])

  const reload = useCallback(async () => {
    if (!projectId) return
    try {
      const o = await api.merge.overview(projectId)
      setOv(o)
      setError(null)
    } catch (err) {
      setError(errorText(err))
    }
  }, [projectId])

  const loadCkpts = useCallback(async () => {
    if (!projectId) return
    setCkpts(await api.merge.checkpoints(projectId).catch(() => []))
  }, [projectId])

  useEffect(() => {
    setOv(undefined)
    setSelPath(null)
    setFile(null)
    setPicks({})
    setReview(null)
    setTestRun(null)
    setTestLog([])
    void reload()
    void loadCkpts()
  }, [reload, loadCkpts])

  useEffect(() => {
    if (!visible) return
    const timer = setInterval(() => !busyRef.current && document.visibilityState === 'visible' && void reload(), POLL_MS)
    return () => clearInterval(timer)
  }, [reload, visible])

  useEffect(() => api.on.mergeTestLog((line) => setTestLog((l) => [...l, line].slice(-LOG_MAX))), [])

  useEffect(() => {
    setTestCmd(testCmdSetting ?? ov?.testCmd ?? '')
  }, [testCmdSetting, ov?.testCmd])

  const sessions = ov?.sessions ?? []
  const shared = useMemo(() => overlaps(sessions), [ov])
  const others = sessions.filter((s) => !s.main)
  // Standard: erste Session mit Änderungen, sonst die erste parallele, sonst der Hauptordner
  const sel = sessions.find((s) => selPath && samePath(s.path, selPath)) ?? others.find((s) => s.files.length) ?? others[0] ?? sessions[0] ?? null
  const version = ov ? `${sessions.map((s) => s.head + s.add + ':' + s.del + ':' + s.dirty).join('|')}` : ''
  const pick = sel ? picks[sel.path] ?? { files: {}, hunks: {} } : { files: {}, hunks: {} }
  const pickedFiles = Object.keys(pick.files).filter((p) => sel?.files.some((f) => f.path === p))
  const curFile = sel?.files.find((f) => f.path === file) ? file : sel?.files[0]?.path ?? null
  const live = useSessions((x) => x.sessions.filter((s) => s.projectId === projectId).length)

  const setPick = (wt: string, fn: (p: Picks[string]) => Picks[string]): void => setPicks((all) => ({ ...all, [wt]: fn(all[wt] ?? { files: {}, hunks: {} }) }))

  const act = async (label: string, title: string, fn: () => Promise<unknown>): Promise<boolean> => {
    setBusy(label)
    busyRef.current = true
    try {
      await fn()
      return true
    } catch (err) {
      await alert(title, errorText(err))
      return false
    } finally {
      busyRef.current = false
      setBusy(null)
      await reload()
    }
  }

  // ---------- Aktionen ----------

  const newSession = async (): Promise<void> => {
    if (!projectId) return
    const r = await useDialog.getState().ask({
      kind: 'prompt',
      title: t('Isolierte Session anlegen'),
      message: t('Claude bekommt einen eigenen Arbeitsordner (Git-Worktree) auf einem eigenen Branch. So kommen sich parallele Sessions nicht in die Quere – zusammengeführt wird erst hier.'),
      placeholder: t('Wofür? z. B. Login-System'),
      checkbox: t('Nur anlegen, Claude noch nicht starten'),
      confirmLabel: t('Anlegen')
    })
    if (!r.ok || !r.value.trim()) return
    await act('create', t('Session konnte nicht angelegt werden'), async () => {
      const wt = await api.merge.create(projectId, r.value)
      setSelPath(wt.path)
      if (!r.checked) await useSessions.getState().start(projectId, undefined, wt.path)
    })
  }

  const commitSession = async (s: MergeSession): Promise<boolean> => {
    if (!projectId) return false
    let suggestion = ''
    setBusy('ai')
    try {
      suggestion = await api.merge.aiMessage(projectId, s.path)
    } catch {
      // ohne Vorschlag weiter
    } finally {
      setBusy(null)
    }
    const r = await useDialog.getState().ask({
      kind: 'prompt',
      title: t('Session „{name}“ committen', { name: sessionName(s) }),
      message: t('Alle {n} offenen Änderungen dieser Session werden auf ihrem Branch committet. Der Hauptordner bleibt unberührt.', { n: s.dirty }),
      defaultValue: suggestion.split('\n')[0],
      placeholder: t('Commit-Nachricht'),
      confirmLabel: t('Committen')
    })
    if (!r.ok) return false
    return act('commit', t('Commit fehlgeschlagen'), () => api.merge.commit(projectId, s.path, r.value || suggestion))
  }

  const removeSession = async (s: MergeSession): Promise<void> => {
    if (!projectId) return
    const liveS = useSessions.getState().sessions.find((x) => samePath(x.cwd, s.path))
    const ok = await confirm({
      title: t('Worktree „{name}“ entfernen?', { name: sessionName(s) }),
      message:
        (liveS ? t('Die Claude-Session darin wird beendet. ') : '') +
        t('Der Ordner wird gelöscht, der Branch {branch} bleibt erhalten.', { branch: s.branch ?? '' }) +
        (s.dirty ? ' ' + t('Achtung: {n} Änderungen sind noch nicht committet und gehen verloren.', { n: s.dirty }) : ''),
      confirmLabel: t('Entfernen'),
      danger: true
    })
    if (!ok) return
    if (s.dirty) {
      const really = await confirm({ title: t('Wirklich verwerfen?'), message: t('{n} ungespeicherte Änderungen in „{name}“ werden endgültig gelöscht.', { n: s.dirty, name: sessionName(s) }), confirmLabel: t('Endgültig verwerfen'), danger: true })
      if (!really) return
    }
    if (liveS) await useSessions.getState().close(liveS.id)
    const done = await act('remove', t('Entfernen fehlgeschlagen'), () => api.merge.removeWorktree(projectId, s.path, s.dirty > 0, true))
    if (done && s.branch && s.ahead === 0) {
      if (await confirm({ title: t('Branch {branch} auch löschen?', { branch: s.branch }), message: t('Er enthält nichts, was nicht schon im Ziel ist.'), confirmLabel: t('Branch löschen') }))
        await act('branch', t('Branch konnte nicht gelöscht werden'), () => api.merge.deleteBranch(projectId, s.branch!, true))
    }
  }

  const runTests = async (s: MergeSession): Promise<TestRun | null> => {
    if (!projectId) return null
    const cmd = testCmd.trim()
    if (!cmd) {
      setTab('tests')
      await alert(t('Kein Testbefehl'), t('Trag im Reiter „Tests“ ein, wie die Tests gestartet werden (z. B. npm test).'))
      return null
    }
    setTab('tests')
    setTestLog([])
    setTesting(s.path)
    try {
      const r = await api.merge.runTests(projectId, s.path, cmd)
      setTestRun({ ...r, wt: s.path })
      return r
    } catch (err) {
      await alert(t('Tests konnten nicht starten'), errorText(err))
      return null
    } finally {
      setTesting(null)
    }
  }

  const mergeAll = async (s: MergeSession): Promise<void> => {
    if (!projectId || !ov || !s.branch) return
    if (s.dirty) {
      const go = await confirm({ title: t('Erst committen'), message: t('„{name}“ hat {n} noch nicht committete Änderungen. Ein Merge nimmt nur Commits mit – jetzt committen?', { name: sessionName(s), n: s.dirty }), confirmLabel: t('Committen') })
      if (!go || !(await commitSession(s))) return
    }
    const r = await useDialog.getState().ask({
      kind: 'confirm',
      title: t('{branch} in {target} mergen?', { branch: s.branch, target: ov.target }),
      message:
        t('Vorher wird automatisch ein Checkpoint gesetzt. Bei Konflikten bleibt der Merge offen – du löst sie und schließt ab oder brichst ab.') +
        (s.conflicts.length ? '\n\n' + t('Erwartete Konflikte: {files}', { files: s.conflicts.join(', ') }) : ''),
      checkbox: testCmd.trim() ? t('Vorher Tests in der Session ausführen') : undefined,
      confirmLabel: t('Mergen'),
      danger: s.conflicts.length > 0
    })
    if (!r.ok) return
    if (r.checked) {
      const tr = await runTests(s)
      if (!tr) return
      if (!tr.ok && !(await confirm({ title: t('Tests fehlgeschlagen'), message: t('Trotzdem mergen?'), confirmLabel: t('Trotzdem mergen'), danger: true }))) return
    }
    await act('merge', t('Merge fehlgeschlagen'), async () => {
      const res = await api.merge.merge(projectId, s.branch!, true)
      if (res.ok) {
        inform(t('{branch} gemergt', { branch: s.branch! }), t('Checkpoint vorher gesetzt – zurück geht es unter „Checkpoints“.'), [{ label: t('Worktree aufräumen'), run: () => void removeSession({ ...s, ahead: 0, dirty: 0 }) }])
      } else {
        setTab('conflicts')
        inform(t('Merge hat Konflikte'), res.conflicts.join(', '))
      }
      void loadCkpts()
    })
  }

  const mergePicked = async (s: MergeSession): Promise<void> => {
    if (!projectId || !ov || !pickedFiles.length) return
    const partial = Object.fromEntries(Object.entries(pick.hunks).filter(([p]) => pickedFiles.includes(p)))
    const ok = await confirm({
      title: tn(pickedFiles.length, '{n} Datei übernehmen?', '{n} Dateien übernehmen?'),
      message:
        t('Aus „{name}“ nach {target}: {files}', { name: sessionName(s), target: ov.target, files: pickedFiles.join(', ') }) +
        (Object.keys(partial).length ? '\n' + t('Bei {n} Datei(en) nur die ausgewählten Abschnitte.', { n: Object.keys(partial).length }) : '') +
        '\n\n' +
        t('Vorher wird ein Checkpoint gesetzt. Ungespeicherte Änderungen im Ziel werden nie überschrieben; Konflikte bleiben als Marker stehen.'),
      confirmLabel: t('Übernehmen')
    })
    if (!ok) return
    await act('apply', t('Übernehmen fehlgeschlagen'), async () => {
      const res = await api.merge.apply(projectId, s.path, pickedFiles, Object.keys(partial).length ? partial : null, true)
      setPick(s.path, () => ({ files: {}, hunks: {} }))
      if (res.conflicts.length) {
        setTab('conflicts')
        inform(t('Teilweise übernommen – Konflikte'), res.conflicts.join(', '))
      } else inform(tn(res.applied.length, '{n} Datei übernommen', '{n} Dateien übernommen'), t('Die Änderungen liegen vorgemerkt im Hauptordner – committe sie im Git-Fenster.'))
      void loadCkpts()
    })
  }

  const checkpointNow = async (): Promise<void> => {
    if (!projectId) return
    const label = await useDialog.getState().ask({ kind: 'prompt', title: t('Checkpoint setzen'), message: t('Sichert den kompletten Arbeitsstand des Hauptordners (auch neue Dateien), ohne etwas zu verändern.'), defaultValue: t('Manueller Checkpoint'), confirmLabel: t('Sichern') })
    if (!label.ok) return
    await act('checkpoint', t('Checkpoint fehlgeschlagen'), async () => {
      await api.merge.checkpoint(projectId, label.value)
      await loadCkpts()
      inform(t('Checkpoint gesetzt'), label.value)
    })
  }

  const restore = async (c: Checkpoint): Promise<void> => {
    if (!projectId || !ov) return
    const moved = c.parent !== ov.targetHead
    const r = await useDialog.getState().ask({
      kind: 'confirm',
      title: t('Checkpoint „{label}“ wiederherstellen?', { label: c.label }),
      message: t('Die Dateien im Hauptordner bekommen den Stand von {time}. Der jetzige Stand wird vorher selbst als Checkpoint gesichert.', { time: new Date(c.time).toLocaleString() }),
      checkbox: moved ? t('Branch auch auf den Commit von damals zurücksetzen (z. B. um einen Merge rückgängig zu machen)') : undefined,
      confirmLabel: t('Wiederherstellen'),
      danger: true
    })
    if (!r.ok) return
    await act('restore', t('Wiederherstellen fehlgeschlagen'), async () => {
      await api.merge.restore(projectId, c.ref, moved && r.checked, true)
      await loadCkpts()
      inform(t('Checkpoint wiederhergestellt'), c.label)
    })
  }

  const abortMerge = async (): Promise<void> => {
    if (!projectId) return
    if (await confirm({ title: t('Merge abbrechen?'), message: t('Alles kehrt zum Stand vor dem Merge zurück, auch bereits gelöste Konflikte.'), confirmLabel: t('Merge abbrechen'), danger: true }))
      await act('abort', t('Abbrechen fehlgeschlagen'), () => api.merge.abort(projectId, true))
  }

  const finishMerge = async (): Promise<void> => {
    if (!projectId) return
    await act('finish', t('Abschließen fehlgeschlagen'), async () => {
      const h = await api.merge.finish(projectId)
      inform(t('Merge abgeschlossen'), h)
    })
  }

  const claudeResolve = async (files: string[]): Promise<void> => {
    if (!projectId || !ov) return
    const id = await ensureSession(projectId, ov.root)
    if (!id) return
    sendToSession(
      id,
      t('Im Hauptordner läuft ein Git-Merge mit Konflikten in: {files}. Löse die Konfliktmarker so, dass die Absichten beider Seiten erhalten bleiben, prüfe, ob alles baut, und markiere die Dateien mit git add als gelöst. Nicht committen.', { files: files.join(', ') })
    )
  }

  const runReview = async (): Promise<void> => {
    if (!projectId) return
    setReviewing(true)
    try {
      setReview(await api.merge.review(projectId))
    } catch (err) {
      await alert(t('KI-Review fehlgeschlagen'), errorText(err))
    } finally {
      setReviewing(false)
    }
  }

  // ---------- Darstellung ----------

  if (!projectId) return <div className="panel-empty">{t('Öffne zuerst ein Projekt.')}</div>

  const head = (
    <header className="ms-head">
      <div className="ms-logo">
        <Icon name="merge" size={24} />
      </div>
      <div className="ms-title">
        <h2>
          {t('Merge Studio')} <span className="ms-beta">Beta</span>
        </h2>
        <p className="dim">{t('Verwalte parallele Sessions, erkenne Konflikte und merge deine Änderungen sicher.')}</p>
      </div>
      <span className="git-spacer" />
      <select className="field small ms-project" value={projectId} onChange={(e) => setProjectId(e.target.value)} data-testid="merge-project">
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <span className="ms-pill">
        <span className={`dot ${live ? 'working' : 'idle'}`} /> {tn(live, '{n} aktive Session', '{n} aktive Sessions')}
      </span>
      <button className="btn primary" disabled={!!busy || !ov} onClick={() => void newSession()} data-testid="merge-new">
        <Icon name="plus" size={14} /> {t('Isolierte Session')}
      </button>
    </header>
  )

  if (ov === undefined && !error)
    return (
      <div className="ms">
        {head}
        <div className="panel-empty">
          <span className="spin" /> {t('Lese Git-Daten …')}
        </div>
      </div>
    )
  if (ov === null || error)
    return (
      <div className="ms">
        {head}
        <div className="git-gate">
          <Icon name="merge" size={32} />
          <h3>{error ? t('Git-Daten nicht lesbar') : t('Kein Git-Repository')}</h3>
          <p>{error ?? t('Merge Studio braucht Git. Lege das Repository im Git-Fenster an – danach kannst du hier parallele Sessions starten.')}</p>
        </div>
      </div>
    )

  const target = ov!.target
  const selShared = sel ? sel.files.filter((f) => shared.has(f.path)) : []
  const selOnly = sel ? sel.files.filter((f) => !shared.has(f.path)) : []
  const testTarget = sel ?? sessions[0]
  const steps = nextSteps()

  function nextSteps(): { icon: string; tone: string; text: string; run?: () => void }[] {
    const out: { icon: string; tone: string; text: string; run?: () => void }[] = []
    if (ov!.merging) out.push({ icon: 'alert', tone: 'red', text: ov!.unmerged.length ? tn(ov!.unmerged.length, 'Konflikt in {n} Datei lösen, dann abschließen', 'Konflikte in {n} Dateien lösen, dann abschließen') : t('Merge abschließen'), run: () => setTab('conflicts') })
    for (const s of others)
      for (const c of s.conflicts.slice(0, 2))
        out.push({ icon: 'alert', tone: 'yellow', text: t('Konflikt in {file} prüfen ({name})', { file: c.split('/').pop() ?? c, name: sessionName(s) }), run: () => (setSelPath(s.path), setFile(c), setTab('diff')) })
    for (const s of others)
      for (const c of s.clashes.filter((x) => s.path < x.with).slice(0, 2)) {
        const o = others.find((x) => samePath(x.path, c.with))
        if (o) out.push({ icon: 'alert', tone: 'yellow', text: t('„{a}“ und „{b}“ ändern dieselben Stellen in {file}', { a: sessionName(s), b: sessionName(o), file: c.files[0].split('/').pop() ?? c.files[0] }), run: () => (setSelPath(s.path), setFile(c.files[0]), setTab('diff')) })
      }
    for (const s of others.filter((x) => x.dirty)) out.push({ icon: 'check', tone: 'blue', text: t('„{name}“: {n} Änderungen committen', { name: sessionName(s), n: s.dirty }), run: () => void commitSession(s) })
    if (testCmd.trim() && sel && !sel.main)
      out.push({ icon: 'play', tone: testRun && !testRun.ok ? 'red' : 'blue', text: testRun && samePath(testRun.wt, sel.path) ? (testRun.ok ? t('Tests bestanden') : t('Tests ausführen ({n} fehlgeschlagen)', { n: testRun.failed ?? '?' })) : t('Tests ausführen'), run: () => void runTests(sel) })
    if (sel && !sel.main && sel.ahead + sel.files.length > 0 && !ov!.merging) out.push({ icon: 'merge', tone: 'green', text: t('„{name}“ mergen', { name: sessionName(sel) }), run: () => void mergeAll(sel) })
    out.push({ icon: 'flag', tone: 'dim', text: t('Backup-Checkpoint erstellen'), run: () => void checkpointNow() })
    for (const st of review?.steps ?? []) out.push({ icon: 'spark', tone: 'dim', text: st })
    return out.slice(0, 6)
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: t('Übersicht') },
    { id: 'diff', label: t('Datei-Diff'), count: sel?.files.length },
    { id: 'conflicts', label: t('Konflikte'), count: shared.size + ov!.unmerged.length || undefined },
    { id: 'review', label: t('KI-Zusammenfassung') },
    { id: 'tests', label: t('Tests'), count: testRun?.failed ?? undefined },
    { id: 'checkpoints', label: t('Checkpoints'), count: ckpts.length || undefined }
  ]

  return (
    <div className="ms" data-testid="merge-studio">
      {head}
      {ov!.merging && (
        <div className="ms-merging" data-testid="merge-running">
          <Icon name="alert" size={16} />
          <span>
            <b>{t('Merge läuft')}</b> – {ov!.unmerged.length ? tn(ov!.unmerged.length, '{n} Datei mit Konflikt', '{n} Dateien mit Konflikt') : t('alle Konflikte gelöst')}
          </span>
          <span className="git-spacer" />
          {ov!.unmerged.length > 0 && (
            <button className="btn small" onClick={() => void claudeResolve(ov!.unmerged)}>
              <Icon name="spark" size={13} /> {t('Claude lösen lassen')}
            </button>
          )}
          <button className="btn small primary" disabled={!!busy || ov!.unmerged.length > 0} onClick={() => void finishMerge()}>
            {t('Merge abschließen')}
          </button>
          <button className="btn small ghost" disabled={!!busy} onClick={() => void abortMerge()}>
            {t('Abbrechen')}
          </button>
        </div>
      )}

      <div className="ms-cards">
        {sessions.map((s) => (
          <SessionCard
            key={s.path}
            s={s}
            on={!!sel && samePath(sel.path, s.path)}
            shared={shared}
            projectId={projectId}
            onSelect={() => setSelPath(s.path)}
            onCommit={() => void commitSession(s)}
            onRemove={() => void removeSession(s)}
          />
        ))}
        {others.length === 0 && (
          <button className="ms-card ms-card-new" onClick={() => void newSession()}>
            <Icon name="plus" size={18} />
            <b>{t('Parallele Session starten')}</b>
            <span className="dim">{t('Eigener Worktree + Branch – nichts kommt sich in die Quere')}</span>
          </button>
        )}
      </div>

      <div className="ms-panel">
        <nav className="ms-tabs">
          {tabs.map((x) => (
            <button key={x.id} className={tab === x.id ? 'on' : ''} onClick={() => setTab(x.id)} data-testid={`merge-tab-${x.id}`}>
              {x.label}
              {!!x.count && <span className="ms-count">{x.count}</span>}
            </button>
          ))}
        </nav>
        <div className="ms-tab-body">
          {tab === 'overview' && (
            <div className="ms-overview">
              <table className="ms-table">
                <thead>
                  <tr>
                    <th>{t('Session')}</th>
                    <th>{t('Branch')}</th>
                    <th>{t('Dateien')}</th>
                    <th>{t('Änderungen')}</th>
                    <th>{t('Commits')}</th>
                    <th>{t('Offen')}</th>
                    <th>{t('Status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => {
                    const st = s.main ? null : sessionState(s, shared)
                    return (
                      <tr key={s.path} className={sel && samePath(sel.path, s.path) ? 'on' : ''} onClick={() => setSelPath(s.path)}>
                        <td>{sessionName(s)}</td>
                        <td className="mono">{s.branch ?? s.head.slice(0, 7)}</td>
                        <td>{s.files.length}</td>
                        <td className="ms-stat">
                          <i className="add">+{s.add}</i> <i className="del">−{s.del}</i>
                        </td>
                        <td>{s.main ? '–' : `↑${s.ahead} ↓${s.behind}`}</td>
                        <td>{s.dirty || '–'}</td>
                        <td>{s.main ? <span className="ms-badge target">{t('Ziel')}</span> : <span className={`ms-badge ${st}`}>{STATE_LABEL()[st!]}</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {!ov!.conflictCheck && <p className="dim ms-note">{t('Hinweis: Deine Git-Version kann Konflikte nicht vorab berechnen (ab Git 2.38). Merge Studio zeigt dann nur Überschneidungen.')}</p>}
              {others.length === 0 && (
                <p className="dim ms-note">
                  {t('Noch keine parallelen Sessions. Mit „Isolierte Session“ bekommt Claude einen eigenen Worktree auf eigenem Branch – Änderungen kommen sich nicht in die Quere, bis du sie hier zusammenführst.')}
                </p>
              )}
            </div>
          )}

          {tab === 'diff' && sel && (
            <div className="ms-split">
              <aside className="ms-files">
                {!sel.files.length && <div className="panel-empty">{t('Diese Session hat keine Änderungen.')}</div>}
                {selShared.length > 0 && (
                  <>
                    <div className="git-group">{t('Gemeinsam geändert')}</div>
                    <ul className="git-files">
                      {selShared.map((f) => (
                        <FileRow key={f.path} f={f} on={curFile === f.path} picked={!!pick.files[f.path]} conflict={clashing(sel, f.path)} shared onOpen={() => setFile(f.path)} onPick={sel.main ? undefined : (v) => setPick(sel.path, (p) => ({ files: v ? { ...p.files, [f.path]: true } : Object.fromEntries(Object.entries(p.files).filter(([k]) => k !== f.path)) as Record<string, true>, hunks: v ? p.hunks : Object.fromEntries(Object.entries(p.hunks).filter(([k]) => k !== f.path)) }))} />
                      ))}
                    </ul>
                  </>
                )}
                {selOnly.length > 0 && (
                  <>
                    <div className="git-group">{t('Nur in dieser Session geändert')}</div>
                    <ul className="git-files">
                      {selOnly.map((f) => (
                        <FileRow key={f.path} f={f} on={curFile === f.path} picked={!!pick.files[f.path]} conflict={clashing(sel, f.path)} shared={false} onOpen={() => setFile(f.path)} onPick={sel.main ? undefined : (v) => setPick(sel.path, (p) => ({ files: v ? { ...p.files, [f.path]: true } : Object.fromEntries(Object.entries(p.files).filter(([k]) => k !== f.path)) as Record<string, true>, hunks: v ? p.hunks : Object.fromEntries(Object.entries(p.hunks).filter(([k]) => k !== f.path)) }))} />
                      ))}
                    </ul>
                  </>
                )}
              </aside>
              <div className="ms-diff-main">
                {curFile ? (
                  <CompareView
                    projectId={projectId}
                    file={curFile}
                    session={sel}
                    others={sessions.filter((o) => !o.main && !samePath(o.path, sel.path) && o.files.some((f) => f.path === curFile))}
                    target={target}
                    conflict={clashing(sel, curFile)}
                    version={version}
                    hunks={pick.hunks[curFile]}
                    onHunks={
                      sel.main
                        ? undefined
                        : (idx, total) =>
                            setPick(sel.path, (p) => {
                              const hunks = { ...p.hunks }
                              const files = { ...p.files }
                              if (idx.length === total) delete hunks[curFile]
                              else hunks[curFile] = idx
                              if (idx.length) files[curFile] = true
                              else {
                                delete files[curFile]
                                delete hunks[curFile]
                              }
                              return { files, hunks }
                            })
                    }
                  />
                ) : (
                  <div className="panel-empty">{t('Wähle links eine Datei.')}</div>
                )}
              </div>
            </div>
          )}

          {tab === 'conflicts' && (
            <div className="ms-list-wrap">
              {ov!.unmerged.length > 0 && (
                <section className="ms-block">
                  <h4>{t('Offene Konflikte im Hauptordner')}</h4>
                  <ul className="ms-list">
                    {ov!.unmerged.map((f) => (
                      <li key={f}>
                        <Icon name="alert" size={14} />
                        <span className="mono">{f}</span>
                        <span className="git-spacer" />
                        <button className="linkish" onClick={() => void openInEditor(`${ov!.root}/${f}`.replace(/\//g, '\\'), '<<<<<<<')}>
                          {t('Im Editor öffnen')}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="dim ms-note">{t('Marker <<<<<<< / ======= / >>>>>>> auflösen, speichern – dann oben „Merge abschließen“.')}</p>
                </section>
              )}
              <section className="ms-block">
                <h4>{t('Von mehreren Sessions geändert')}</h4>
                {shared.size === 0 ? (
                  <p className="dim">{t('Keine Überschneidungen – jede Session arbeitet an eigenen Dateien.')}</p>
                ) : (
                  <ul className="ms-list">
                    {[...shared].map(([f, paths]) => {
                      const real = sessions.filter((s) => clashing(s, f))
                      return (
                        <li key={f} data-testid={`merge-overlap-${f}`}>
                          <Icon name={real.length ? 'alert' : 'branch'} size={14} />
                          <span className="mono">{f}</span>
                          <span className="dim">{paths.map((p) => sessionName(sessions.find((s) => samePath(s.path, p))!)).join(' · ')}</span>
                          <span className="git-spacer" />
                          {real.length ? <span className="ms-badge conflict">{t('Konflikt erwartet')}</span> : <span className="ms-badge ready">{t('lässt sich zusammenführen')}</span>}
                          <button
                            className="linkish"
                            onClick={() => {
                              const owner = sessions.find((s) => !s.main && paths.some((p) => samePath(p, s.path)))
                              if (owner) setSelPath(owner.path)
                              setFile(f)
                              setTab('diff')
                            }}
                          >
                            {t('Vergleichen')}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
                <p className="dim ms-note">{t('„Konflikt erwartet“ berechnet Git vorab, ohne etwas zu verändern – auch für noch nicht committete Änderungen.')}</p>
              </section>
            </div>
          )}

          {tab === 'review' && (
            <div className="ms-list-wrap">
              <div className="row">
                <button className="btn primary" disabled={reviewing || !others.some((s) => s.files.length)} onClick={() => void runReview()} data-testid="merge-review">
                  {reviewing ? <span className="spin" /> : <Icon name="spark" size={14} />} {review ? t('Neu prüfen') : t('KI-Review erstellen')}
                </button>
                <span className="dim">{t('Claude (Haiku, über dein Abo) liest die Diffs aller Sessions – ohne Werkzeuge, ohne etwas zu ändern.')}</span>
              </div>
              {review && (
                <>
                  <section className="ms-block">
                    <h4>{t('Zusammenfassung')}</h4>
                    <p className="ms-text">{review.summary}</p>
                  </section>
                  {review.risks.length > 0 && (
                    <section className="ms-block">
                      <h4>{t('Mögliche Probleme')}</h4>
                      <ul className="ms-list">
                        {review.risks.map((r, i) => (
                          <li key={i}>
                            <Icon name="alert" size={14} /> {r}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  {review.steps.length > 0 && (
                    <section className="ms-block">
                      <h4>{t('Empfohlene Schritte')}</h4>
                      <ol className="ms-steps">
                        {review.steps.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ol>
                    </section>
                  )}
                </>
              )}
            </div>
          )}

          {tab === 'tests' && testTarget && (
            <div className="ms-tests">
              <div className="row ms-test-bar">
                <input
                  className="field small mono"
                  value={testCmd}
                  placeholder="npm test"
                  onChange={(e) => setTestCmd(e.target.value)}
                  onBlur={() => projectId && useSettings.getState().set({ mergeTestCmd: { ...(useSettings.getState().s?.mergeTestCmd ?? {}), [projectId]: testCmd.trim() } })}
                  data-testid="merge-test-cmd"
                />
                <span className="dim">{t('in')}</span>
                <b>{sessionName(testTarget)}</b>
                {testing ? (
                  <button className="btn small" onClick={() => api.merge.stopTests()}>
                    {t('Stoppen')}
                  </button>
                ) : (
                  <button className="btn small primary" disabled={!testCmd.trim()} onClick={() => void runTests(testTarget)} data-testid="merge-test-run">
                    <Icon name="play" size={13} /> {t('Tests ausführen')}
                  </button>
                )}
                {testRun && !testing && (
                  <span className={`ms-badge ${testRun.ok ? 'ready' : 'conflict'}`} data-testid="merge-test-result">
                    {testRun.cancelled ? t('abgebrochen') : testRun.ok ? t('bestanden') : t('fehlgeschlagen')}
                    {testRun.passed !== null && ` · ${testRun.passed} ✓`}
                    {!!testRun.failed && ` · ${testRun.failed} ✗`}
                    {` · ${(testRun.ms / 1000).toFixed(1)} s`}
                  </span>
                )}
              </div>
              <pre className="ms-log mono" data-testid="merge-test-log">
                {testLog.length ? testLog.join('\n') : testing ? t('Starte …') : t('Noch kein Testlauf. Tests laufen im Ordner der gewählten Session – so prüfst du Änderungen, bevor sie ins Ziel kommen.')}
              </pre>
            </div>
          )}

          {tab === 'checkpoints' && (
            <div className="ms-list-wrap">
              <div className="row">
                <button className="btn" disabled={!!busy} onClick={() => void checkpointNow()} data-testid="merge-checkpoint">
                  <Icon name="flag" size={14} /> {t('Checkpoint jetzt')}
                </button>
                <span className="dim">{t('Vor jedem Merge setzt Merge Studio automatisch einen. Gespeichert als Git-Ref unter refs/vibedesk/checkpoints – nichts landet in deiner Historie.')}</span>
              </div>
              {ckpts.length === 0 ? (
                <p className="dim">{t('Noch keine Checkpoints.')}</p>
              ) : (
                <ul className="ms-list">
                  {ckpts.map((c) => (
                    <li key={c.ref}>
                      <Icon name="flag" size={14} />
                      <span>{c.label}</span>
                      <span className="dim">{relTime(c.time)}</span>
                      <span className="dim mono">{c.sha.slice(0, 7)}</span>
                      <span className="git-spacer" />
                      <button className="linkish" disabled={!!busy || ov!.merging} onClick={() => void restore(c)}>
                        {t('Wiederherstellen')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      <footer className="ms-foot">
        <section className="ms-box">
          <h4>
            <Icon name="spark" size={14} /> {t('Änderungszusammenfassung (KI)')} <span className="ms-beta">Beta</span>
          </h4>
          {review ? (
            <p className="ms-text clamp">{review.summary}</p>
          ) : (
            <p className="dim">
              {others.some((s) => s.files.length) ? t('Lass Claude die Änderungen aller Sessions zusammenfassen und auf Probleme prüfen.') : t('Sobald Sessions etwas geändert haben, fasst Claude hier zusammen, was passiert ist.')}{' '}
              {others.some((s) => s.files.length) && (
                <button className="linkish" disabled={reviewing} onClick={() => (setTab('review'), void runReview())}>
                  {reviewing ? t('prüft …') : t('Jetzt prüfen')}
                </button>
              )}
            </p>
          )}
        </section>
        <section className="ms-box">
          <h4>{t('Empfohlene nächste Schritte')}</h4>
          <ul className="ms-next">
            {steps.map((s, i) => (
              <li key={i}>
                <button className={`tone-${s.tone}`} onClick={s.run} disabled={!s.run}>
                  <Icon name={s.icon} size={14} />
                  <span>{s.text}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="ms-box ms-actions">
          <h4>{t('Merge-Optionen')}</h4>
          <button className="btn primary" disabled={!!busy || !sel || sel.main || ov!.merging || sel.ahead + sel.files.length === 0} onClick={() => sel && void mergeAll(sel)} data-testid="merge-all">
            {busy === 'merge' ? <span className="spin" /> : <Icon name="merge" size={14} />} {t('Änderungen mergen')}
          </button>
          <button className="btn" disabled={!!busy || !sel || sel.main || !pickedFiles.length || ov!.merging} onClick={() => sel && void mergePicked(sel)} data-testid="merge-picked">
            {busy === 'apply' ? <span className="spin" /> : null}
            {pickedFiles.length ? tn(pickedFiles.length, 'Nur {n} ausgewählte Datei mergen', 'Nur {n} ausgewählte Dateien mergen') : t('Nur ausgewählte Dateien mergen')}
          </button>
          <button className="btn" disabled={!!testing || !sel} onClick={() => sel && void runTests(sel)}>
            <Icon name="play" size={13} /> {t('Vorschau & Tests ausführen')}
          </button>
        </section>
      </footer>
    </div>
  )
}
