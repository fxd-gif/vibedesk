// Merge Studio: parallele Sessions als Git-Worktrees vergleichen, prüfen und sicher ins Ziel übernehmen.
// Grundregeln: nichts wird still überschrieben, vor jedem Eingriff gibt es einen Checkpoint,
// destruktive Schritte laufen nur mit confirmed = true (der Renderer fragt vorher nach).
import { t } from '../shared/i18n'
import { spawn, execFile, type ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'
import { cleanGitError, defaultRunner, safeRel, type RunResult, type Runner } from './gitService'
import {
  buildPatch,
  parseMergeTree,
  parseNameStatus,
  parseNumstat,
  parseReview,
  parseTestSummary,
  parseWorktrees,
  overlaps,
  reviewPrompt,
  slugBranch,
  type ApplyResult,
  type Checkpoint,
  type MergeFile,
  type MergeFileView,
  type MergeOverview,
  type MergeResult,
  type MergeSession,
  type ReviewResult,
  type TestRun,
  type WorktreeEntry
} from '../shared/merge'

const DIFF_MAX = 400_000
const FILE_MAX = 300_000
const CKPT_NS = 'refs/vibedesk/checkpoints/'
const WT_DIR = path.join('.vibedesk', 'worktrees')
const EXCLUDE_LINE = '/.vibedesk/worktrees/'
/** feste Zeit für Hilfs-Commits → gleicher Stand ergibt denselben Hash, es entstehen keine neuen Objekte pro Abfrage */
const FIXED_DATE = '1700000000 +0000'
const AI_TIMEOUT_MS = 150_000

export interface MergeDeps {
  run?: Runner
  /** Arbeitsordner für Hilfsdateien (temporärer Index, claude -p) */
  tmpDir: string
  claudeCmd?: () => string
}

export class MergeService {
  private run: Runner
  private mergeTreeOk: boolean | null = null
  private test: ChildProcess | null = null
  private testCancelled = false

  constructor(private d: MergeDeps) {
    this.run = d.run ?? defaultRunner
  }

  // ---------- Grundlagen ----------

  private async git(cwd: string, args: string[], o: { input?: string; env?: Record<string, string>; ok?: number[]; timeout?: number } = {}): Promise<RunResult> {
    const r = await this.run('git', args, { cwd, input: o.input, env: o.env, timeout: o.timeout })
    if (!(o.ok ?? [0]).includes(r.code)) throw new Error(cleanGitError(r.stderr || r.stdout) || t('git {cmd} ist fehlgeschlagen', { cmd: args[0] }))
    return r
  }

  private async out(cwd: string, args: string[]): Promise<string> {
    return (await this.git(cwd, args)).stdout.trim()
  }

  private async supportsMergeTree(cwd: string): Promise<boolean> {
    if (this.mergeTreeOk === null) {
      const v = /(\d+)\.(\d+)/.exec((await this.run('git', ['--version'], { cwd })).stdout)
      this.mergeTreeOk = !!v && (Number(v[1]) > 2 || (Number(v[1]) === 2 && Number(v[2]) >= 38))
    }
    return this.mergeTreeOk
  }

  async worktrees(root: string): Promise<WorktreeEntry[]> {
    const out = (await this.git(root, ['worktree', 'list', '--porcelain'])).stdout
    return parseWorktrees(out).map((w) => ({ ...w, path: path.resolve(w.path) }))
  }

  /** Pfad aus dem Fenster muss ein Worktree dieses Repos sein */
  async worktree(root: string, wt: unknown): Promise<WorktreeEntry & { main: boolean }> {
    if (typeof wt !== 'string' || !wt) throw new Error(t('Ungültiger Worktree'))
    const list = await this.worktrees(root)
    const want = path.resolve(wt).toLowerCase()
    const i = list.findIndex((w) => w.path.toLowerCase() === want)
    if (i < 0) throw new Error(t('Worktree nicht gefunden'))
    return { ...list[i], main: i === 0 }
  }

  private async mainWt(root: string): Promise<WorktreeEntry> {
    const main = (await this.worktrees(root))[0]
    if (!main) throw new Error(t('Kein Git-Repository'))
    return main
  }

  /** Zielbranch muss im Haupt-Worktree ausgecheckt sein – sonst wüsste niemand, wohin gemergt wird */
  private async target(root: string): Promise<WorktreeEntry & { branch: string }> {
    const main = await this.mainWt(root)
    if (!main.branch) throw new Error(t('Im Hauptordner ist kein Branch ausgecheckt (losgelöster HEAD).'))
    return main as WorktreeEntry & { branch: string }
  }

  /**
   * Kompletter Arbeitsstand eines Worktrees als Tree – auch neue Dateien –, ohne den echten Index anzufassen:
   * Kopie des Index (behält den Stat-Cache, daher schnell), darauf add -A, dann write-tree.
   */
  private async snapshot(wt: string): Promise<string> {
    const idx = path.resolve(wt, await this.out(wt, ['rev-parse', '--git-path', 'index']))
    fs.mkdirSync(this.d.tmpDir, { recursive: true })
    const tmp = path.join(this.d.tmpDir, `merge-index-${randomUUID()}`)
    try {
      if (fs.existsSync(idx)) fs.copyFileSync(idx, tmp)
      const env = { GIT_INDEX_FILE: tmp }
      await this.git(wt, ['add', '-A'], { env, timeout: 120_000 })
      // verschachtelte Session-Worktrees gehören nie zum Stand des Hauptordners (auch ohne exclude-Eintrag)
      await this.git(wt, ['rm', '-r', '-q', '-f', '--cached', '--ignore-unmatch', '--', '.vibedesk/worktrees'], { env })
      return (await this.git(wt, ['write-tree'], { env })).stdout.trim()
    } finally {
      fs.rmSync(tmp, { force: true })
      fs.rmSync(tmp + '.lock', { force: true })
    }
  }

  /** Hilfs-Commit über einem Arbeitsstand (für merge-tree); deterministisch, damit nichts anwächst */
  private async snapCommit(wt: string, tree: string, parent: string): Promise<string> {
    const env = { GIT_AUTHOR_NAME: 'VibeDesk', GIT_AUTHOR_EMAIL: 'merge@vibedesk.local', GIT_COMMITTER_NAME: 'VibeDesk', GIT_COMMITTER_EMAIL: 'merge@vibedesk.local', GIT_AUTHOR_DATE: FIXED_DATE, GIT_COMMITTER_DATE: FIXED_DATE }
    return (await this.git(wt, ['commit-tree', tree, '-p', parent, '-m', 'vibedesk merge preview'], { env })).stdout.trim()
  }

  // ---------- Überblick ----------

  async overview(root: string, testCmd: string | null): Promise<MergeOverview | null> {
    const top = await this.run('git', ['rev-parse', '--show-toplevel'], { cwd: root })
    if (top.code !== 0) return null
    const list = (await this.worktrees(root)).filter((w) => !w.bare && !w.prunable && fs.existsSync(w.path))
    const main = list[0]
    if (!main || !main.head) return null
    const conflictCheck = await this.supportsMergeTree(root)
    const nested = path.join(main.path, WT_DIR).toLowerCase()
    if (list.some((w) => w.path.toLowerCase().startsWith(nested))) await this.excludeWorktrees(main.path)
    const mainSnap = await this.snapshot(main.path)
    const mainTree = await this.out(main.path, ['rev-parse', `${main.head}^{tree}`])
    const targetCommit = mainSnap === mainTree ? main.head : await this.snapCommit(main.path, mainSnap, main.head)

    const found = (
      await Promise.all(list.map((w, i) => this.session(w, i === 0, main.head, targetCommit, conflictCheck, i === 0 ? mainSnap : undefined).catch(() => null)))
    ).filter((x): x is { s: MergeSession; commit: string | null } => !!x)
    // Sessions untereinander: ändern zwei dieselbe Datei, sagt merge-tree, ob es wirklich kracht
    const others = found.filter((x) => !x.s.main && x.commit)
    for (let i = 0; i < others.length; i++)
      for (let j = i + 1; j < others.length; j++) {
        const a = others[i]
        const b = others[j]
        const both = a.s.files.filter((f) => b.s.files.some((g) => g.path === f.path)).map((f) => f.path)
        if (!both.length) continue
        const r = await this.git(main.path, ['-c', 'core.quotepath=off', 'merge-tree', '--write-tree', '--name-only', '--no-messages', a.commit!, b.commit!], { ok: [0, 1] }).catch(() => null)
        const files = r?.code === 1 ? parseMergeTree(r.stdout).filter((f) => both.includes(f)) : []
        if (!files.length) continue
        a.s.clashes.push({ with: b.s.path, files })
        b.s.clashes.push({ with: a.s.path, files })
      }
    const sessions = found.map((x) => x.s)
    const merging = (await this.run('git', ['rev-parse', '-q', '--verify', 'MERGE_HEAD'], { cwd: main.path })).code === 0
    const unmerged = (await this.out(main.path, ['diff', '--name-only', '--diff-filter=U'])).split(/\r?\n/).filter(Boolean)
    return {
      root: main.path,
      target: main.branch ?? main.head.slice(0, 7),
      targetHead: main.head,
      sessions,
      conflictCheck,
      merging,
      unmerged,
      testCmd: testCmd || this.detectTestCmd(main.path)
    }
  }

  private async session(w: WorktreeEntry, main: boolean, targetHead: string, targetCommit: string, conflictCheck: boolean, snap?: string): Promise<{ s: MergeSession; commit: string | null }> {
    const tree = snap ?? (await this.snapshot(w.path))
    const base = main ? w.head : (await this.run('git', ['merge-base', targetHead, w.head], { cwd: w.path })).stdout.trim() || null
    let files: MergeFile[] = []
    let ahead = 0
    let behind = 0
    const conflicts: string[] = []
    let commit: string | null = null
    if (base) {
      const [num, names, dirtyOut] = await Promise.all([
        this.out(w.path, ['-c', 'core.quotepath=off', 'diff', '--numstat', '-z', '-M', base, tree]),
        this.out(w.path, ['-c', 'core.quotepath=off', 'diff', '--name-status', '-z', '-M', base, tree]),
        this.out(w.path, ['-c', 'core.quotepath=off', 'diff', '--name-only', '-z', w.head, tree])
      ])
      const status = parseNameStatus(names)
      const dirty = new Set(dirtyOut.split('\0').filter(Boolean))
      files = parseNumstat(num).map((f) => ({ ...f, status: status.get(f.path) ?? 'M', dirty: dirty.has(f.path) }))
      if (!main) {
        const lr = (await this.out(w.path, ['rev-list', '--left-right', '--count', `${targetHead}...${w.head}`])).split(/\s+/)
        behind = Number(lr[0]) || 0
        ahead = Number(lr[1]) || 0
        if (conflictCheck && files.length) {
          const headTree = await this.out(w.path, ['rev-parse', `${w.head}^{tree}`])
          const mine = tree === headTree ? w.head : await this.snapCommit(w.path, tree, w.head)
          commit = mine
          const r = await this.git(w.path, ['-c', 'core.quotepath=off', 'merge-tree', '--write-tree', '--name-only', '--no-messages', targetCommit, mine], { ok: [0, 1] })
          if (r.code === 1) conflicts.push(...parseMergeTree(r.stdout))
        }
      }
    }
    let changedAt = Number(await this.out(w.path, ['log', '-1', '--format=%ct', w.head]).catch(() => '0')) * 1000
    for (const f of files.filter((x) => x.dirty).slice(0, 40)) {
      try {
        changedAt = Math.max(changedAt, fs.statSync(path.join(w.path, f.path)).mtimeMs)
      } catch {
        // gelöscht
      }
    }
    const s: MergeSession = {
      path: w.path,
      branch: w.branch,
      head: w.head,
      main,
      base,
      ahead,
      behind,
      files,
      add: files.reduce((n, f) => n + f.add, 0),
      del: files.reduce((n, f) => n + f.del, 0),
      dirty: files.filter((f) => f.dirty).length,
      changedAt,
      conflicts,
      clashes: [],
      locked: w.locked
    }
    return { s, commit }
  }

  detectTestCmd(root: string): string | null {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
      const test = pkg.scripts?.test
      if (test && !/no test specified/i.test(test)) return 'npm test'
    } catch {
      // kein Node-Projekt
    }
    if (fs.existsSync(path.join(root, 'pytest.ini')) || fs.existsSync(path.join(root, 'pyproject.toml'))) return 'python -m pytest'
    if (fs.existsSync(path.join(root, 'Cargo.toml'))) return 'cargo test'
    if (fs.existsSync(path.join(root, 'go.mod'))) return 'go test ./...'
    return null
  }

  // ---------- Dateien ----------

  private async baseOf(root: string, w: WorktreeEntry & { main: boolean }): Promise<string> {
    if (w.main) return w.head
    const main = await this.mainWt(root)
    const b = (await this.run('git', ['merge-base', main.head, w.head], { cwd: w.path })).stdout.trim()
    if (!b) throw new Error(t('Kein gemeinsamer Ursprung mit dem Ziel-Branch'))
    return b
  }

  async fileDiff(root: string, wtPath: string, file: string): Promise<MergeFileView> {
    const w = await this.worktree(root, wtPath)
    const rel = safeRel(w.path, file)
    const [base, tree] = await Promise.all([this.baseOf(root, w), this.snapshot(w.path)])
    let diff = (await this.git(w.path, ['-c', 'core.quotepath=off', 'diff', '--no-color', '--no-ext-diff', '-M', base, tree, '--', rel])).stdout
    if (diff.length > DIFF_MAX) diff = diff.slice(0, DIFF_MAX) + '\n\\ … ' + t('gekürzt')
    const main = await this.mainWt(root)
    let target: string | null = null
    try {
      const abs = path.join(main.path, rel)
      const st = fs.statSync(abs)
      if (st.isFile() && st.size <= FILE_MAX) {
        const buf = fs.readFileSync(abs)
        target = buf.includes(0) ? null : buf.toString('utf8')
      }
    } catch {
      // gibt es im Ziel nicht
    }
    return { diff, target }
  }

  // ---------- Sessions anlegen, committen, aufräumen ----------

  /** Neuer Worktree auf eigenem Branch, abgezweigt vom aktuellen Ziel */
  async create(root: string, name: string): Promise<{ path: string; branch: string }> {
    const main = await this.target(root)
    const slug = slugBranch(name)
    let branch = `vd/${slug}`
    let dir = path.join(main.path, WT_DIR, slug)
    for (let n = 2; (await this.run('git', ['rev-parse', '-q', '--verify', `refs/heads/${branch}`], { cwd: main.path })).code === 0 || fs.existsSync(dir); n++) {
      branch = `vd/${slug}-${n}`
      dir = path.join(main.path, WT_DIR, `${slug}-${n}`)
    }
    await this.git(main.path, ['check-ref-format', '--branch', branch])
    await this.excludeWorktrees(main.path)
    fs.mkdirSync(path.dirname(dir), { recursive: true })
    await this.git(main.path, ['worktree', 'add', '-b', branch, dir, main.head], { timeout: 180_000 })
    // Abhängigkeiten teilen statt neu installieren – nur wenn node_modules ohnehin ignoriert wird
    const nm = path.join(main.path, 'node_modules')
    if (fs.existsSync(nm) && (await this.run('git', ['check-ignore', '-q', 'node_modules'], { cwd: main.path })).code === 0) {
      try {
        fs.symlinkSync(nm, path.join(dir, 'node_modules'), 'junction')
      } catch {
        // dann eben ohne – Tests sagen Bescheid
      }
    }
    return { path: dir, branch }
  }

  /** Worktrees liegen im Projekt (Hooks und Gehirn finden so das Projekt), dürfen aber nie mitcommittet werden – lokal per info/exclude, .gitignore bleibt unberührt */
  private async excludeWorktrees(root: string): Promise<void> {
    const common = path.resolve(root, await this.out(root, ['rev-parse', '--git-common-dir']))
    const exclude = path.join(common, 'info', 'exclude')
    const cur = fs.existsSync(exclude) ? fs.readFileSync(exclude, 'utf8') : ''
    if (cur.split(/\r?\n/).includes(EXCLUDE_LINE)) return
    fs.mkdirSync(path.dirname(exclude), { recursive: true })
    fs.writeFileSync(exclude, cur + (cur && !cur.endsWith('\n') ? '\n' : '') + `# VibeDesk Merge Studio\n${EXCLUDE_LINE}\n`)
  }

  /** Alle Änderungen einer Session committen (eigener Worktree, eigener Branch) */
  async commit(root: string, wtPath: string, message: string): Promise<string> {
    const w = await this.worktree(root, wtPath)
    if (w.main) throw new Error(t('Den Hauptordner committest du im Git-Fenster.'))
    const msg = message.trim()
    if (!msg) throw new Error(t('Die Commit-Nachricht ist leer.'))
    await this.git(w.path, ['add', '-A'])
    await this.git(w.path, ['commit', '-q', '-F', '-'], { input: msg + '\n' })
    return this.out(w.path, ['rev-parse', '--short', 'HEAD'])
  }

  async removeWorktree(root: string, wtPath: string, force: boolean, confirmed: boolean): Promise<void> {
    need(confirmed)
    const w = await this.worktree(root, wtPath)
    if (w.main) throw new Error(t('Der Hauptordner kann nicht entfernt werden.'))
    const dirty = (await this.out(w.path, ['status', '--porcelain'])).split(/\r?\n/).filter((l) => l && !/node_modules\/?$/.test(l))
    if (dirty.length && !force) throw new Error(t('In dieser Session gibt es noch {n} ungespeicherte Änderungen. Erst committen oder mergen – oder ausdrücklich verwerfen.', { n: dirty.length }))
    // geteilte node_modules sind ein Verweis: nur den Verweis lösen, nie den Inhalt
    const nm = path.join(w.path, 'node_modules')
    try {
      if (fs.lstatSync(nm).isSymbolicLink()) fs.unlinkSync(nm)
    } catch {
      // nicht da
    }
    await this.git(root, ['worktree', 'remove', ...(force ? ['--force'] : []), w.path], { timeout: 120_000 })
  }

  /** Nur gemergte Branches löschen (-d, nie -D) */
  async deleteBranch(root: string, branch: string, confirmed: boolean): Promise<void> {
    need(confirmed)
    const main = await this.target(root)
    if (branch === main.branch) throw new Error(t('Der Ziel-Branch kann nicht gelöscht werden.'))
    await this.git(main.path, ['check-ref-format', '--branch', branch])
    await this.git(main.path, ['branch', '-d', '--', branch])
  }

  // ---------- Checkpoints ----------

  async checkpoint(root: string, label: string): Promise<Checkpoint> {
    const main = await this.mainWt(root)
    if (!main.head) throw new Error(t('Ohne ersten Commit gibt es noch keinen Checkpoint.'))
    const tree = await this.snapshot(main.path)
    const text = label.trim().slice(0, 120) || t('Checkpoint')
    const sha = (await this.git(main.path, ['commit-tree', tree, '-p', main.head, '-m', `VibeDesk-Checkpoint: ${text}`])).stdout.trim()
    let time = Date.now()
    while ((await this.run('git', ['rev-parse', '-q', '--verify', CKPT_NS + time], { cwd: main.path })).code === 0) time++
    await this.git(main.path, ['update-ref', CKPT_NS + time, sha])
    return { ref: CKPT_NS + time, sha, parent: main.head, time, label: text }
  }

  async checkpoints(root: string): Promise<Checkpoint[]> {
    const fmt = '%(refname)%00%(objectname)%00%(parent)%00%(creatordate:unix)%00%(contents:subject)'
    const out = (await this.git(root, ['for-each-ref', '--sort=-refname', '--count=40', `--format=${fmt}`, CKPT_NS])).stdout
    return out
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => {
        const [ref, sha, parent, time, subject] = l.split('\0')
        return { ref, sha, parent: parent.split(' ')[0] ?? '', time: Number(ref.slice(CKPT_NS.length)) || Number(time) * 1000, label: subject.replace(/^VibeDesk-Checkpoint: /, '') }
      })
  }

  /**
   * Arbeitsstand eines Checkpoints zurückholen. Vorher wird der jetzige Stand selbst gesichert.
   * resetBranch: Branch zusätzlich auf den Commit von damals setzen (git reset --keep – bricht ab statt etwas zu verlieren).
   */
  async restore(root: string, ref: string, resetBranch: boolean, confirmed: boolean): Promise<Checkpoint> {
    need(confirmed)
    if (!ref.startsWith(CKPT_NS) || !/^[\w./-]+$/.test(ref)) throw new Error(t('Ungültiger Checkpoint'))
    const main = await this.mainWt(root)
    const sha = await this.out(main.path, ['rev-parse', '--verify', ref + '^{commit}'])
    const parent = await this.out(main.path, ['rev-parse', sha + '^'])
    if ((await this.run('git', ['rev-parse', '-q', '--verify', 'MERGE_HEAD'], { cwd: main.path })).code === 0) throw new Error(t('Erst den laufenden Merge abschließen oder abbrechen.'))
    const backup = await this.checkpoint(main.path, t('Vor Wiederherstellung'))
    if (resetBranch && parent !== main.head) await this.git(main.path, ['reset', '--keep', parent])
    await this.git(main.path, ['restore', `--source=${sha}`, '--worktree', '--', '.'])
    return backup
  }

  // ---------- Übernehmen ----------

  /** Ausgewählte Dateien (optional einzelne Hunks) aus einer Session ins Ziel übernehmen – per 3-Wege-Apply */
  async apply(root: string, wtPath: string, files: string[], hunks: Record<string, number[]> | null, confirmed: boolean): Promise<ApplyResult> {
    need(confirmed)
    const main = await this.target(root)
    const w = await this.worktree(root, wtPath)
    if (w.main) throw new Error(t('Das ist schon der Hauptordner.'))
    if (!files.length) throw new Error(t('Keine Dateien ausgewählt.'))
    if ((await this.run('git', ['rev-parse', '-q', '--verify', 'MERGE_HEAD'], { cwd: main.path })).code === 0) throw new Error(t('Erst den laufenden Merge abschließen oder abbrechen.'))
    const rels = files.map((f) => safeRel(w.path, f))
    const busy = (await this.out(main.path, ['-c', 'core.quotepath=off', 'status', '--porcelain', '--', ...rels])).split(/\r?\n/).filter(Boolean)
    if (busy.length) throw new Error(t('Im Ziel sind diese Dateien noch ungespeichert geändert: {files}. Erst committen – sonst würde etwas überschrieben.', { files: busy.map((l) => l.slice(3)).join(', ') }))
    const [base, tree] = await Promise.all([this.baseOf(root, w), this.snapshot(w.path)])
    let patch = ''
    for (const rel of rels) {
      const d = (await this.git(w.path, ['-c', 'core.quotepath=off', 'diff', '--binary', '--no-color', '--no-ext-diff', '--full-index', base, tree, '--', rel])).stdout
      if (!d.trim()) continue
      const pick = hunks?.[rel]
      patch += pick ? buildPatch(d, pick) : d.endsWith('\n') ? d : d + '\n'
    }
    if (!patch.trim()) throw new Error(t('In der Auswahl gibt es keine Änderungen.'))
    const ckpt = await this.checkpoint(main.path, t('Vor Übernahme aus {branch}', { branch: w.branch ?? w.head.slice(0, 7) }))
    const r = await this.run('git', ['apply', '--3way', '--index', '--whitespace=nowarn', '--recount', '-'], { cwd: main.path, input: patch })
    const conflicts = (await this.out(main.path, ['diff', '--name-only', '--diff-filter=U'])).split(/\r?\n/).filter(Boolean)
    if (r.code !== 0 && !conflicts.length) throw new Error(cleanGitError(r.stderr) || t('Die Änderungen ließen sich nicht übernehmen.'))
    return { applied: rels.filter((p) => !conflicts.includes(p)), conflicts, checkpoint: ckpt.ref }
  }

  /** Ganzen Session-Branch ins Ziel mergen (vorher Checkpoint). Bei Konflikten bleibt der Merge offen. */
  async merge(root: string, branch: string, confirmed: boolean): Promise<MergeResult> {
    need(confirmed)
    const main = await this.target(root)
    if (branch === main.branch) throw new Error(t('Branch und Ziel sind gleich.'))
    await this.git(main.path, ['check-ref-format', '--branch', branch])
    const ckpt = await this.checkpoint(main.path, t('Vor Merge von {branch}', { branch }))
    const r = await this.run('git', ['merge', '--no-ff', '--no-edit', '-m', `Merge ${branch} (Merge Studio)`, branch], { cwd: main.path, timeout: 120_000 })
    if (r.code === 0) return { ok: true, conflicts: [], checkpoint: ckpt.ref, message: r.stdout.trim().split('\n')[0] ?? '' }
    const conflicts = (await this.out(main.path, ['diff', '--name-only', '--diff-filter=U'])).split(/\r?\n/).filter(Boolean)
    if (!conflicts.length) throw new Error(cleanGitError(r.stderr || r.stdout) || t('Merge fehlgeschlagen'))
    return { ok: false, conflicts, checkpoint: ckpt.ref, message: '' }
  }

  async abort(root: string, confirmed: boolean): Promise<void> {
    need(confirmed)
    const main = await this.mainWt(root)
    await this.git(main.path, ['merge', '--abort'])
  }

  /** Merge nach gelösten Konflikten abschließen */
  async finish(root: string): Promise<string> {
    const main = await this.mainWt(root)
    const open = (await this.out(main.path, ['diff', '--name-only', '--diff-filter=U'])).split(/\r?\n/).filter(Boolean)
    if (open.length) throw new Error(t('Noch offene Konflikte: {files}', { files: open.join(', ') }))
    const markers = await this.run('git', ['diff', '--cached', '--check'], { cwd: main.path })
    if (/conflict marker|leftover conflict/i.test(markers.stdout)) throw new Error(t('In den Dateien stehen noch Konfliktmarker (<<<<<<<).'))
    await this.git(main.path, ['commit', '-q', '--no-edit'])
    return this.out(main.path, ['rev-parse', '--short', 'HEAD'])
  }

  // ---------- KI-Review ----------

  async review(root: string): Promise<ReviewResult> {
    const ov = await this.overview(root, null)
    if (!ov) throw new Error(t('Kein Git-Repository'))
    const list = ov.sessions.filter((s) => !s.main && s.files.length)
    if (!list.length) throw new Error(t('Keine Session hat Änderungen.'))
    const sessions = await Promise.all(
      list.map(async (s) => {
        const tree = await this.snapshot(s.path)
        const diff = (await this.git(s.path, ['-c', 'core.quotepath=off', 'diff', '--no-color', '--no-ext-diff', '-M', s.base ?? s.head, tree])).stdout
        return { name: s.branch ?? path.basename(s.path), files: s.files, diff, conflicts: s.conflicts }
      })
    )
    const input = reviewPrompt({ target: ov.target, sessions, shared: [...overlaps(ov.sessions).keys()] })
    fs.mkdirSync(this.d.tmpDir, { recursive: true })
    const args = ['/d', '/c', this.d.claudeCmd?.() ?? 'claude', '-p', 'Follow the instructions in the input.', '--model', 'haiku', '--output-format', 'text', '--no-session-persistence', '--tools', '']
    const r = await this.run('cmd.exe', args, { cwd: this.d.tmpDir, input, timeout: AI_TIMEOUT_MS })
    if (r.code !== 0) {
      if (/is not recognized|nicht als interner|ENOENT/i.test(r.stderr)) throw new Error(t('Claude Code wurde nicht gefunden.'))
      throw new Error(r.stderr.trim().split('\n').slice(-2).join(' ') || t('Claude hat nicht geantwortet.'))
    }
    const res = parseReview(r.stdout)
    if (!res.summary) throw new Error(t('Claude hat nicht geantwortet.'))
    return res
  }

  // ---------- Tests ----------

  async runTests(root: string, wtPath: string, cmd: string, onLog: (line: string) => void): Promise<TestRun> {
    const w = await this.worktree(root, wtPath)
    const command = cmd.trim()
    if (!command) throw new Error(t('Kein Testbefehl angegeben.'))
    if (this.test) throw new Error(t('Es laufen schon Tests.'))
    const started = Date.now()
    let log = ''
    this.testCancelled = false
    const code = await new Promise<number>((resolve) => {
      // CI=1: Test-Runner laufen einmal durch statt im Watch-Modus
      const p = spawn('cmd.exe', ['/d', '/c', command], { cwd: w.path, windowsHide: true, env: { ...process.env, CI: '1', FORCE_COLOR: '0', NO_COLOR: '1' } })
      this.test = p
      const read = (b: Buffer): void => {
        const s = b.toString('utf8')
        log = (log + s).slice(-200_000)
        s.split(/\r?\n/)
          .filter((l) => l.trim())
          .forEach(onLog)
      }
      p.stdout.on('data', read)
      p.stderr.on('data', read)
      p.on('error', (e) => (onLog(String(e.message)), resolve(-1)))
      p.on('exit', (c) => resolve(c ?? -1))
    })
    this.test = null
    const sum = parseTestSummary(log)
    return { ok: code === 0 && !this.testCancelled, code, ...sum, ms: Date.now() - started, cancelled: this.testCancelled }
  }

  stopTests(): void {
    const p = this.test
    if (!p?.pid) return
    this.testCancelled = true
    // ganzen Prozessbaum beenden (npm → node → worker)
    execFile('taskkill', ['/pid', String(p.pid), '/t', '/f'], { windowsHide: true }, () => undefined)
  }
}

function need(confirmed: boolean): void {
  if (confirmed !== true) throw new Error(t('Diese Aktion braucht eine ausdrückliche Bestätigung.'))
}
