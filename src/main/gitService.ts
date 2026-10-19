// Git-Fenster: führt git (und optional gh/claude) im Projektordner aus – ohne Shell, Pfade immer hinter „--“.
import { t } from '../shared/i18n'
import { execFile, spawn, type ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import { AUTH_MARK, LOG_FORMAT, addedFileDiff, cleanMessage, commitPrompt, parseLog, parseStatus, webUrl, type GitCommit, type GitState, type GitTools } from '../shared/git'

const MAX_OUT = 8 * 1024 * 1024
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

  async show(cwd: string, hash: string): Promise<string> {
    if (!/^[0-9a-f]{4,40}$/i.test(hash)) throw new Error(t('Ungültiger Commit'))
    const out = await this.git(cwd, ['-c', 'core.quotepath=off', 'show', '--no-color', '--no-ext-diff', '--format=%B%x00', hash])
    return out.length > DIFF_MAX ? out.slice(0, DIFF_MAX) + '\n\\ … ' + t('gekürzt') : out
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
