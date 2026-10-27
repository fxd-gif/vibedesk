// Git-Fenster: führt git (und optional gh/claude) im Projektordner aus – ohne Shell, Pfade immer hinter „--“.
import { t } from '../shared/i18n'
import { execFile, spawn, type ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import { AUTH_MARK, LOG_FORMAT, addedFileDiff, cleanMessage, commitPrompt, parseLog, parseStatus, webUrl, type GitCommit, type GitState, type GitTools, validBranchName, parsePr, prBranchName, prPrompt, stripAiNotes, type PrDraft, type PrInfo } from '../shared/git'
import { parseNumstat, type WrapChanges, type WrapFile } from '../shared/wrapUp'
import { HOTSPOT_TOP, countCommits, hotspotArgs, topHotspots, type Hotspot } from '../shared/hotspots'

const MAX_OUT = 8 * 1024 * 1024
const HOT_CACHE_MS = 5 * 60_000
const DIFF_MAX = 400_000
const FILE_MAX = 300_000
const LOGIN_TIMEOUT_MS = 15 * 60_000

/** Fehler, die sich mit einem GitHub-Login beheben lassen – das Fenster bietet dann die Anmeldung an */
const AUTH_RE = /authentication failed|could not read username|terminal prompts disabled|permission denied \(publickey\)|requested url returned error: 40[13]|invalid username or (password|token)|support for password authentication was removed/i

export interface RunResult {
  code: number
  stdout: string
  stderr: string
}

export type Runner = (file: string, args: string[], opts: { cwd: string; input?: string; timeout?: number; env?: Record<string, string> }) => Promise<RunResult>

export const defaultRunner: Runner = (file, args, opts) =>
  new Promise((resolve) => {
    const p = execFile(
      file,
      args,
      {
        cwd: opts.cwd,
        windowsHide: true,
        maxBuffer: MAX_OUT,
        timeout: opts.timeout ?? 60_000,
        // nie interaktiv nachfragen – Anmeldung läuft über gh/Credential Manager oder schlägt verständlich fehl
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', GH_PROMPT_DISABLED: '1', LC_ALL: 'C', ...opts.env }
      },
      (err, stdout, stderr) => {
        // Exit-Code steht als Zahl in err.code; ENOENT & Co. (Programm fehlt) als Text → -1
        const raw = (err as { code?: unknown } | null)?.code
        const code = !err ? 0 : typeof raw === 'number' ? raw : -1
        resolve({ code, stdout: String(stdout), stderr: String(stderr) || (err && code === -1 ? err.message : '') })
      }
    )
    if (opts.input !== undefined) p.stdin?.end(opts.input)
  })

/** Pfad aus dem Fenster: muss relativ sein und im Projekt bleiben */
export function safeRel(root: string, rel: unknown): string {
  if (typeof rel !== 'string' || !rel || path.isAbsolute(rel)) throw new Error(t('Ungültiger Pfad'))
  const abs = path.resolve(root, rel)
  const r = path.relative(root, abs)
  if (!r || r.startsWith('..') || path.isAbsolute(r)) throw new Error(t('Pfad liegt außerhalb des Projekts'))
  return r.replace(/\\/g, '/')
}

/** git-Fehler lesbar machen: „hint:“-Zeilen und Leerzeilen raus */
export function cleanGitError(s: string): string {
  return s
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith('hint:'))
    .map((l) => l.replace(/^(fatal|error): /, ''))
    .slice(0, 6)
    .join('\n')
}

/** Nach einer frischen winget-Installation steht das Programm noch nicht im PATH dieses Prozesses */
const pf = process.env.ProgramFiles ?? 'C:\\Program Files'
const local = process.env.LOCALAPPDATA ?? ''
const FALLBACKS: Record<Tool, string[]> = {
  git: [path.join(pf, 'Git', 'cmd', 'git.exe'), path.join(local, 'Programs', 'Git', 'cmd', 'git.exe')],
  gh: [path.join(pf, 'GitHub CLI', 'gh.exe'), path.join(local, 'Programs', 'GitHub CLI', 'gh.exe')]
}
type Tool = 'git' | 'gh'

export const WINGET_IDS: Record<Tool, string> = { git: 'Git.Git', gh: 'GitHub.cli' }

export interface GitDeps {
  run?: Runner
  /** Claude Code für die KI-Nachricht (Befehl wie in Sessions) */
  claudeCmd?: () => string
  trash?: (abs: string) => Promise<void>
  exists?: (p: string) => boolean
}

export class GitService {
  private run: Runner
  private bins: Partial<Record<Tool, string | null>> = {}
  private login: ChildProcess | null = null
  private hotCache = new Map<string, { at: number; list: Hotspot[] }>()

  constructor(private d: GitDeps = {}) {
    this.run = d.run ?? defaultRunner
  }

  // ---------- Werkzeuge ----------

  /** Programm finden (PATH, sonst Standard-Installationsort); null = nicht installiert */
  private async bin(tool: Tool): Promise<string | null> {
    if (this.bins[tool] !== undefined) return this.bins[tool]!
    const exists = this.d.exists ?? fs.existsSync
    let found: string | null = null
    const r = await this.run(tool, ['--version'], { cwd: process.cwd(), timeout: 15_000 })
    if (r.code === 0) found = tool
    else found = FALLBACKS[tool].find((p) => p && exists(p)) ?? null
    // nur Treffer merken – nach einer Installation soll die nächste Prüfung neu suchen
    if (found) this.bins[tool] = found
    return found
  }

  private async need(tool: Tool): Promise<string> {
    const b = await this.bin(tool)
    if (!b) throw new Error(tool === 'git' ? t('Git ist nicht installiert.') : t('Die GitHub-CLI (gh) ist nicht installiert.'))
    return b
  }

  /** Was ist da? Git-Version, gh und GitHub-Login */
  async tools(): Promise<GitTools> {
    const cwd = process.cwd()
    const [git, gh, winget] = await Promise.all([this.bin('git'), this.bin('gh'), this.run('where', ['winget'], { cwd, timeout: 10_000 })])
    const out: GitTools = { git: null, gh: gh ? 'loggedOut' : 'missing', ghUser: null, winget: winget.code === 0 }
    if (git) out.git = /(\d+\.\d+\.\d+)/.exec((await this.run(git, ['--version'], { cwd })).stdout)?.[1] ?? 'installiert'
    if (gh) {
      const r = await this.run(gh, ['auth', 'status', '--hostname', 'github.com'], { cwd, timeout: 20_000 })
      const text = r.stdout + r.stderr
      if (r.code === 0) {
        out.gh = 'loggedIn'
        out.ghUser = /account (\S+)/.exec(text)?.[1] ?? /as (\S+)/.exec(text)?.[1] ?? null
      }
    }
    return out
  }

  /** Git oder gh per winget installieren (feste Befehle, keine Eingaben aus dem Fenster) */
  async install(tool: Tool, onLog: (line: string) => void): Promise<boolean> {
    const args = ['install', '-e', '--id', WINGET_IDS[tool], '--source', 'winget', '--accept-source-agreements', '--accept-package-agreements', '--disable-interactivity']
    const ok = await new Promise<boolean>((resolve) => {
      const p = spawn('winget', args, { windowsHide: true })
      const log = (b: Buffer): void =>
        b
          .toString('utf8')
          .split(/\r?\n|\r/)
          .map((l) => l.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').trim())
          .filter((l) => l.length > 2 && !/^[-\\|/█▒ ]+$/.test(l))
          .forEach(onLog)
      p.stdout.on('data', log)
      p.stderr.on('data', log)
      p.on('error', () => resolve(false))
      p.on('exit', (code) => resolve(code === 0))
    })
    delete this.bins[tool]
    return ok && !!(await this.bin(tool))
  }

  /**
   * GitHub-Anmeldung über gh im Browser (Device-Flow): Code und Link gehen ans Fenster,
   * danach richtet gh Git so ein, dass Push/Pull die Anmeldung nutzen.
   */
  async githubLogin(onCode: (code: string, url: string) => void): Promise<void> {
    const gh = await this.need('gh')
    this.cancelLogin()
    await new Promise<void>((resolve, reject) => {
      const p = spawn(gh, ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web', '--skip-ssh-key'], { windowsHide: true })
      this.login = p
      let out = ''
      let sent = false
      const read = (b: Buffer): void => {
        out += b.toString('utf8')
        const code = /one-time code:\s*([A-Z0-9]{4}-[A-Z0-9]{4})/i.exec(out)?.[1]
        const url = /(https:\/\/github\.com\/login\/device)/.exec(out)?.[1] ?? 'https://github.com/login/device'
        if (code && !sent) {
          sent = true
          onCode(code, url)
        }
        // ältere gh-Versionen warten auf Enter, bevor sie weitermachen
        if (/press enter/i.test(out)) p.stdin?.write('\n')
      }
      p.stdout?.on('data', read)
      p.stderr?.on('data', read)
      const timer = setTimeout(() => p.kill(), LOGIN_TIMEOUT_MS)
      p.on('error', (err) => (clearTimeout(timer), reject(err)))
      p.on('exit', (code) => {
        clearTimeout(timer)
        if (this.login === p) this.login = null
        if (code === 0) resolve()
        else reject(new Error(p.killed ? t('Anmeldung abgebrochen.') : cleanGitError(out) || t('Anmeldung fehlgeschlagen.')))
      })
    })
    await this.run(gh, ['auth', 'setup-git', '--hostname', 'github.com'], { cwd: process.cwd(), timeout: 30_000 })
  }

  cancelLogin(): void {
    this.login?.kill()
    this.login = null
  }

  // ---------- Git ----------

  private async git(cwd: string, args: string[], input?: string, timeout?: number): Promise<string> {
    const r = await this.run(await this.need('git'), args, { cwd, input, timeout })
    if (r.code !== 0) {
      const msg = cleanGitError(r.stderr || r.stdout) || t('git {cmd} ist fehlgeschlagen', { cmd: args[0] })
      throw new Error(AUTH_RE.test(r.stderr) ? AUTH_MARK + msg : msg)
    }
    return r.stdout
  }

  async status(cwd: string): Promise<GitState> {
    const git = await this.need('git')
    const r = await this.run(git, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all'], { cwd })
    if (r.code !== 0) {
      if (/not a git repository/i.test(r.stderr)) return { repo: false }
      throw new Error(cleanGitError(r.stderr))
    }
    const st = parseStatus(r.stdout)
    const remote = await this.run(git, ['remote', 'get-url', 'origin'], { cwd })
    const remoteUrl = remote.code === 0 ? remote.stdout.trim() || null : null
    return { ...st, remoteUrl, webUrl: webUrl(remoteUrl) }
  }

  async diff(cwd: string, rel: string, staged: boolean, untracked: boolean): Promise<string> {
    const p = safeRel(cwd, rel)
    if (untracked) {
      const abs = path.join(cwd, p)
      const st = fs.statSync(abs)
      if (st.isDirectory()) return ''
      if (st.size > FILE_MAX) return `diff --git a/${p} b/${p}\nBinary files differ\n`
      const buf = fs.readFileSync(abs)
      if (buf.includes(0)) return `diff --git a/${p} b/${p}\nBinary files differ\n`
      return addedFileDiff(p, buf.toString('utf8'))
    }
    const out = await this.git(cwd, ['-c', 'core.quotepath=off', 'diff', '--no-color', '--no-ext-diff', ...(staged ? ['--cached'] : []), '--', p])
    return out.length > DIFF_MAX ? out.slice(0, DIFF_MAX) + '\n\\ … ' + t('gekürzt') : out
  }

  async stage(cwd: string, paths: string[]): Promise<void> {
    const ps = paths.map((p) => safeRel(cwd, p))
    if (ps.length) await this.git(cwd, ['add', '-A', '--', ...ps])
  }

  async stageAll(cwd: string): Promise<void> {
    await this.git(cwd, ['add', '-A'])
  }

  async unstage(cwd: string, paths: string[], unborn: boolean): Promise<void> {
    const ps = paths.map((p) => safeRel(cwd, p))
    if (!ps.length) return
    // ohne ersten Commit gibt es kein HEAD für restore
    await this.git(cwd, unborn ? ['rm', '--cached', '-r', '-q', '--', ...ps] : ['restore', '--staged', '--', ...ps])
  }

  /** Änderungen im Arbeitsverzeichnis verwerfen; neue Dateien wandern in den Papierkorb */
  async discard(cwd: string, files: { path: string; untracked: boolean }[]): Promise<void> {
    const tracked = files.filter((f) => !f.untracked).map((f) => safeRel(cwd, f.path))
    if (tracked.length) await this.git(cwd, ['restore', '--worktree', '--', ...tracked])
    for (const f of files.filter((x) => x.untracked)) {
      const abs = path.join(cwd, safeRel(cwd, f.path))
      if (this.d.trash) await this.d.trash(abs)
      else fs.rmSync(abs, { force: true, recursive: true })
    }
  }

  /** Alles, was „Alles committen“ mitnehmen würde – mit Zeilenzahlen (Session-Abschluss) */
  async changes(cwd: string): Promise<WrapChanges> {
    const st = await this.status(cwd)
    if (!st.repo) return { repo: false }
    const numstat = parseNumstat(st.unborn ? '' : await this.git(cwd, ['-c', 'core.quotepath=off', 'diff', 'HEAD', '--numstat', '-z', '--no-renames']))
    const files: WrapFile[] = st.files.map((f) => {
      const n = numstat.get(f.path)
      if (n) return { path: f.path, ...n, untracked: f.untracked }
      // neue Datei: Zeilen selbst zählen (kleine Textdateien)
      let add: number | null = null
      try {
        const abs = path.join(cwd, safeRel(cwd, f.path))
        const size = fs.statSync(abs).size
        if (size <= FILE_MAX) {
          const buf = fs.readFileSync(abs)
          if (!buf.includes(0)) add = buf.length ? buf.toString('utf8').split('\n').length - (buf[buf.length - 1] === 10 ? 1 : 0) : 0
        }
      } catch {
        // gelöscht oder gesperrt – ohne Zahl
      }
      return { path: f.path, add, del: f.untracked ? 0 : null, untracked: f.untracked }
    })
    return { repo: true, branch: st.branch, files }
  }

  async commit(cwd: string, message: string, all: boolean): Promise<string> {
    const msg = message.trim()
    if (!msg) throw new Error(t('Die Commit-Nachricht ist leer.'))
    if (all) await this.stageAll(cwd)
    await this.git(cwd, ['commit', '-q', '-F', '-'], msg + '\n')
    return (await this.git(cwd, ['rev-parse', '--short', 'HEAD'])).trim()
  }

  async log(cwd: string, n = 40): Promise<GitCommit[]> {
    const git = await this.bin('git')
    if (!git) return []
    const r = await this.run(git, ['log', `-n${n}`, `--pretty=format:${LOG_FORMAT}`], { cwd })
    return r.code === 0 ? parseLog(r.stdout) : []
  }

  /** Meistgeänderte Dateien der letzten 90 Tage (für das Gehirn) – gecacht, ohne Repo oder Git leer */
  async hotspots(cwd: string): Promise<Hotspot[]> {
    const hit = this.hotCache.get(cwd)
    if (hit && Date.now() - hit.at < HOT_CACHE_MS) return hit.list
    const git = await this.bin('git')
    if (!git) return []
    const r = await this.run(git, hotspotArgs(), { cwd, timeout: 20_000 })
    // gelöschte Dateien gehören nicht mehr in den Graph
    const list = r.code === 0 ? topHotspots(countCommits(r.stdout), HOTSPOT_TOP, (f) => fs.existsSync(path.join(cwd, f))) : []
    this.hotCache.set(cwd, { at: Date.now(), list })
    return list
  }

  async show(cwd: string, hash: string): Promise<string> {
    if (!/^[0-9a-f]{4,40}$/i.test(hash)) throw new Error(t('Ungültiger Commit'))
    const out = await this.git(cwd, ['-c', 'core.quotepath=off', 'show', '--no-color', '--no-ext-diff', '--format=%B%x00', hash])
    return out.length > DIFF_MAX ? out.slice(0, DIFF_MAX) + '\n\\ … ' + t('gekürzt') : out
  }

  /** lokale Branches, alphabetisch */
  async branches(cwd: string): Promise<string[]> {
    const out = await this.git(cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/heads'])
    return out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
  }

  /** Branch wechseln oder (create) neu anlegen und wechseln – ungesicherte Änderungen nimmt git mit oder meldet einen Konflikt */
  async switchBranch(cwd: string, name: string, create: boolean): Promise<void> {
    if (!validBranchName(name)) throw new Error(t('Ungültiger Branch-Name'))
    await this.git(cwd, ['check-ref-format', '--branch', name.trim()])
    await this.git(cwd, create ? ['switch', '-c', name.trim()] : ['switch', name.trim()])
  }

  async init(cwd: string): Promise<void> {
    await this.git(cwd, ['init', '-q', '-b', 'main'])
  }

  async pull(cwd: string): Promise<void> {
    await this.git(cwd, ['pull', '--ff-only', '-q'], undefined, 120_000)
  }

  async push(cwd: string, hasUpstream: boolean): Promise<void> {
    await this.git(cwd, hasUpstream ? ['push', '-q'] : ['push', '-q', '-u', 'origin', 'HEAD'], undefined, 120_000)
  }

  async fetch(cwd: string): Promise<void> {
    await this.git(cwd, ['fetch', '-q', '--prune'], undefined, 120_000)
  }

  /** Neues GitHub-Repo anlegen, als origin eintragen und pushen */
  async publish(cwd: string, name: string, priv: boolean): Promise<string> {
    const gh = await this.need('gh')
    const repo = name.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
    if (!repo) throw new Error(t('Ungültiger Repo-Name'))
    const r = await this.run(gh, ['repo', 'create', repo, priv ? '--private' : '--public', '--source', '.', '--remote', 'origin', '--push'], { cwd, timeout: 180_000 })
    if (r.code !== 0) {
      const msg = cleanGitError(r.stderr || r.stdout) || t('GitHub-Repo konnte nicht angelegt werden')
      throw new Error(/gh auth login|not logged in/i.test(r.stderr) || AUTH_RE.test(r.stderr) ? AUTH_MARK + msg : msg)
    }
    return webUrl((await this.run(await this.need('git'), ['remote', 'get-url', 'origin'], { cwd })).stdout.trim()) ?? ''
  }

  // ---------- Pull Requests ----------

  /** Standard-Branch des Servers: origin/HEAD, sonst gh, sonst main */
  private async baseBranch(cwd: string): Promise<string> {
    const git = await this.need('git')
    const r = await this.run(git, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { cwd })
    if (r.code === 0 && r.stdout.trim().startsWith('origin/')) return r.stdout.trim().slice(7)
    const gh = await this.bin('gh')
    if (gh) {
      const v = await this.run(gh, ['repo', 'view', '--json', 'defaultBranchRef', '-q', '.defaultBranchRef.name'], { cwd, timeout: 30_000 })
      if (v.code === 0 && validBranchName(v.stdout.trim())) return v.stdout.trim()
    }
    return 'main'
  }

  async prInfo(cwd: string): Promise<PrInfo> {
    const st = await this.status(cwd)
    if (!st.repo) throw new Error(t('Kein Git-Repository'))
    if (!st.remoteUrl || !/github\.com/i.test(st.remoteUrl)) throw new Error(t('Pull Requests gehen nur mit einem GitHub-Repository.'))
    const base = await this.baseBranch(cwd)
    const branch = st.branch || base
    const git = await this.need('git')
    const range = (await this.run(git, ['rev-parse', '--verify', '-q', `origin/${base}`], { cwd })).code === 0 ? `origin/${base}..HEAD` : 'HEAD'
    const log = await this.run(git, ['log', '--format=%s', '-n', '50', range], { cwd })
    const commits = log.code === 0 ? log.stdout.split('\n').filter(Boolean) : []
    const gh = await this.bin('gh')
    let existing: PrInfo['existing'] = null
    if (gh && branch !== base) {
      const v = await this.run(gh, ['pr', 'view', branch, '--json', 'url,title,state'], { cwd, timeout: 30_000 })
      if (v.code === 0) {
        try {
          const j = JSON.parse(v.stdout) as { url?: string; title?: string; state?: string }
          if (j.state === 'OPEN' && typeof j.url === 'string') existing = { url: j.url, title: String(j.title ?? '') }
        } catch {
          // keine Angaben
        }
      }
    }
    return { base, branch, onBase: branch === base, commits, existing, dirty: st.files.length, gh: gh ? 'ok' : 'missing' }
  }

  /** Titel und Beschreibung von Claude Code aus Commits und Diff gegenüber dem Ziel-Branch */
  async aiPr(cwd: string): Promise<PrDraft> {
    const info = await this.prInfo(cwd)
    if (!info.commits.length) throw new Error(t('Es gibt noch keine Commits für einen Pull Request.'))
    const range = `origin/${info.base}...HEAD`
    const diff = await this.git(cwd, ['diff', range, '--no-color', '--no-ext-diff']).catch(() => '')
    const stat = await this.git(cwd, ['diff', range, '--stat']).catch(() => '')
    const cmd = this.d.claudeCmd?.() ?? 'claude'
    const r = await this.run('cmd.exe', ['/d', '/c', cmd, '-p', 'Write the pull request as instructed in the input.', '--model', 'haiku', '--output-format', 'text'], {
      cwd,
      input: prPrompt(diff, info.commits, stat),
      timeout: 120_000
    })
    if (r.code !== 0) {
      if (/is not recognized|nicht als interner|ENOENT/i.test(r.stderr)) throw new Error(t('Claude Code wurde nicht gefunden.'))
      throw new Error(r.stderr.trim().split('\n').slice(-3).join('\n') || t('Claude hat keine Nachricht geliefert.'))
    }
    const pr = parsePr(r.stdout)
    if (!pr.title) throw new Error(t('Claude hat keine Nachricht geliefert.'))
    return pr
  }

  /** Branch (falls auf dem Ziel-Branch), pushen, PR anlegen → URL */
  async createPr(cwd: string, o: { title: string; body: string; branch?: string; draft: boolean }): Promise<string> {
    const title = o.title.replace(/[\r\n]+/g, ' ').trim().slice(0, 250)
    if (!title) throw new Error(t('Der Pull Request braucht einen Titel.'))
    const gh = await this.need('gh')
    const info = await this.prInfo(cwd)
    if (info.existing) return info.existing.url
    if (!info.commits.length) throw new Error(t('Es gibt noch keine Commits für einen Pull Request.'))
    let branch = info.branch
    if (info.onBase) {
      branch = (o.branch ?? '').trim() || prBranchName(title)
      if (!validBranchName(branch)) throw new Error(t('Ungültiger Branch-Name'))
      await this.git(cwd, ['switch', '-c', branch])
    }
    await this.git(cwd, ['push', '-q', '-u', 'origin', 'HEAD'], undefined, 120_000)
    const args = ['pr', 'create', '--base', info.base, '--head', branch, '--title', title, '--body-file', '-']
    if (o.draft) args.push('--draft')
    const r = await this.run(gh, args, { cwd, input: stripAiNotes(o.body), timeout: 120_000 })
    if (r.code !== 0) {
      const msg = cleanGitError(r.stderr || r.stdout) || t('Pull Request konnte nicht angelegt werden')
      throw new Error(/gh auth login|not logged in/i.test(r.stderr) || AUTH_RE.test(r.stderr) ? AUTH_MARK + msg : msg)
    }
    return /https:\/\/\S+/.exec(r.stdout)?.[0] ?? ''
  }

  /** Commit-Nachricht von Claude Code (claude -p) – nutzt das Abo, kein API-Key nötig */
  async aiMessage(cwd: string): Promise<string> {
    const st = await this.status(cwd)
    if (!st.repo) throw new Error(t('Kein Git-Repository'))
    const staged = st.files.some((f) => !f.untracked && !f.conflict && f.index !== '.')
    // ohne Vorgemerktes: alles, was „Alles committen“ mitnehmen würde
    const range = staged ? ['--cached'] : st.unborn ? null : ['HEAD']
    let diff = range ? await this.git(cwd, ['diff', ...range, '--no-color', '--no-ext-diff']) : ''
    const stat = range ? await this.git(cwd, ['diff', ...range, '--stat']) : ''
    if (!staged) {
      for (const f of st.files.filter((x) => x.untracked).slice(0, 20)) {
        try {
          diff += '\n' + (await this.diff(cwd, f.path, false, true))
        } catch {
          // gerade gelöscht – egal
        }
      }
    }
    if (!diff.trim()) throw new Error(t('Es gibt keine Änderungen für eine Nachricht.'))
    const recent = (await this.log(cwd, 12)).map((c) => c.subject)
    const cmd = this.d.claudeCmd?.() ?? 'claude'
    const r = await this.run('cmd.exe', ['/d', '/c', cmd, '-p', 'Write the commit message as instructed in the input.', '--model', 'haiku', '--output-format', 'text'], {
      cwd,
      input: commitPrompt(diff, recent, stat),
      timeout: 120_000
    })
    if (r.code !== 0) {
      if (/is not recognized|nicht als interner|ENOENT/i.test(r.stderr)) throw new Error(t('Claude Code wurde nicht gefunden.'))
      throw new Error(r.stderr.trim().split('\n').slice(-3).join('\n') || t('Claude hat keine Nachricht geliefert.'))
    }
    const msg = cleanMessage(r.stdout)
    if (!msg) throw new Error(t('Claude hat keine Nachricht geliefert.'))
    return msg
  }
}
