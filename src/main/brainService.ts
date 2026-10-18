// Gehirn-Dienst: sammelt aus den Hooks mit, was Claude liest und ändert, beantwortet Claudes
// Werkzeug-Aufrufe (MCP) und liefert dem Graph-Fenster Daten.
import { t } from '../shared/i18n'
import { ipcMain, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import {
  BRAIN_DIR,
  ME_ID,
  NOTE_TYPE_LABEL,
  backlinks,
  buildGraph,
  coEditedWith,
  fileId,
  isStale,
  noteId,
  normalizeActivity,
  overview,
  personalOverview,
  recordTouch,
  relPath,
  searchNotes,
  titleKey,
  type Activity,
  type BrainPulse,
  type BrainView,
  type NoteDetail
} from '../shared/brain'
import type { BrainNoteInput, HookEvent, Project } from '../shared/types'
import { BrainStore, type NoteInput } from './brainStore'
import { readJson, writeJsonAtomic } from './jsonFile'
import { shouldTend, stopHookReply, type TurnActivity } from './brainTend'

const READ_TOOLS = new Set(['Read', 'NotebookRead'])
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const SAVE_DELAY_MS = 2000

export interface BrainDeps {
  activityDir: string
  /** Ordner des persönlichen Gehirns (gilt in allen Projekten); ohne ihn gibt es nur Projekt-Gehirne */
  meDir?: string
  project: (id: string) => Project | undefined
  /** Projekt einer laufenden VibeDesk-Session */
  projectOfSession: (sessionId: string) => Project | undefined
  /** Projekt, in dessen Ordner dieser Pfad liegt (für Sessions, die die App nicht mehr kennt) */
  projectOfDir?: (dir: string) => Project | undefined
  enabled: () => boolean
  emit: (channel: 'brain:changed' | 'brain:pulse', payload: unknown) => void
}

export class BrainService {
  private acts = new Map<string, Activity>()
  private saveTimers = new Map<string, NodeJS.Timeout>()
  private prompts = new Map<string, string>()
  /** laufende Runde je Session – für die Gehirn-Autopflege beim Stop */
  private turns = new Map<string, TurnActivity>()
  private watchers = new Map<string, fs.FSWatcher>()
  private changeTimers = new Map<string, NodeJS.Timeout>()

  constructor(private d: BrainDeps) {}

  store(p: Project): BrainStore {
    return new BrainStore(p.path)
  }

  /** Das persönliche Gehirn als Pseudo-Projekt – so funktionieren Fenster, Watcher und Pulse ohne Sonderwege */
  private me(): Project | undefined {
    return this.d.meDir ? ({ id: ME_ID, name: t('Über dich'), path: this.d.meDir, createdAt: 0, lastOpenedAt: null } as Project) : undefined
  }

  private proj(id: string): Project | undefined {
    return id === ME_ID ? this.me() : this.d.project(id)
  }

  private personal(): string {
    const me = this.me()
    return me ? personalOverview(this.store(me).list()) : ''
  }

  // ---------- Aktivität ----------

  private actFile(projectId: string): string {
    return path.join(this.d.activityDir, `${projectId.replace(/[^A-Za-z0-9-]/g, '')}.json`)
  }

  activity(projectId: string): Activity {
    let a = this.acts.get(projectId)
    if (!a) {
      a = normalizeActivity(readJson<unknown>(this.actFile(projectId), null))
      this.acts.set(projectId, a)
    }
    return a
  }

  private scheduleSave(projectId: string): void {
    if (this.saveTimers.has(projectId)) return
    this.saveTimers.set(
      projectId,
      setTimeout(() => this.save(projectId), SAVE_DELAY_MS)
    )
  }

  private save(projectId: string): void {
    clearTimeout(this.saveTimers.get(projectId))
    this.saveTimers.delete(projectId)
    const a = this.acts.get(projectId)
    if (!a) return
    try {
      fs.mkdirSync(this.d.activityDir, { recursive: true })
      writeJsonAtomic(this.actFile(projectId), a)
    } catch (err) {
      console.error('[brain] Aktivität nicht gespeichert', err)
    }
  }

  flushAll(): void {
    for (const id of [...this.saveTimers.keys()]) this.save(id)
    for (const w of this.watchers.values()) w.close()
    this.watchers.clear()
  }

  onHook(e: HookEvent): void {
    const p = this.d.projectOfSession(e.sessionId)
    if (!p) return
    if (e.name === 'UserPromptSubmit') this.turns.set(e.sessionId, { edits: 0, tended: false })
    if (e.name === 'UserPromptSubmit' && typeof e.payload.prompt === 'string') {
      if (!this.prompts.has(e.sessionId)) this.prompts.set(e.sessionId, e.payload.prompt.replace(/\s+/g, ' ').slice(0, 160))
      return
    }
    if (e.name === 'SessionEnd') {
      this.prompts.delete(e.sessionId)
      this.turns.delete(e.sessionId)
      return
    }
    if (e.name !== 'PostToolUse' && e.name !== 'PreToolUse') return
    const tool = typeof e.payload.tool_name === 'string' ? e.payload.tool_name : ''
    const kind = EDIT_TOOLS.has(tool) ? 'edit' : READ_TOOLS.has(tool) ? 'read' : null
    if (!kind) return
    const input = (e.payload.tool_input ?? {}) as Record<string, unknown>
    const raw = typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : ''
    const rel = raw && relPath(raw, p.path)
    if (rel && rel.startsWith(BRAIN_DIR + '/') && kind === 'edit' && e.name === 'PostToolUse') this.markTended(e.sessionId)
    if (!rel || rel.startsWith(BRAIN_DIR + '/') || rel.startsWith('.git/')) return
    // Pre: nur fürs Aufleuchten im Graph; gezählt wird nach erfolgreicher Ausführung
    if (e.name === 'PreToolUse') {
      this.d.emit('brain:pulse', { projectId: p.id, id: fileId(rel), kind } satisfies BrainPulse)
      return
    }
    const turn = this.turns.get(e.sessionId)
    if (turn && kind === 'edit') turn.edits++
    recordTouch(this.activity(p.id), { id: e.sessionId, prompt: this.prompts.get(e.sessionId) }, rel, kind, e.ts)
    this.scheduleSave(p.id)
  }

  // ---------- Claude ----------

  /** Hook-Antwort beim Session-Start: der Überblick landet in Claudes Kontext */
  sessionStartOutput(sessionId: string): string | undefined {
    if (!this.d.enabled()) return undefined
    const p = this.d.projectOfSession(sessionId)
    if (!p) return undefined
    const text = overview(p.name, this.store(p).list(), this.activity(p.id)) + this.personal()
    return JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } })
  }

  /** Hook-Antwort beim Stop: Runde mit Änderungen, aber ohne Gehirn-Pflege → Claude macht kurz weiter */
  stopOutput(e: HookEvent): string | undefined {
    if (!this.d.enabled() || !this.d.projectOfSession(e.sessionId)) return undefined
    const turn = this.turns.get(e.sessionId)
    if (!shouldTend(turn, e.payload.stop_hook_active === true)) return undefined
    turn!.tended = true
    return stopHookReply()
  }

  private markTended(sessionId: string): void {
    const turn = this.turns.get(sessionId)
    if (turn) turn.tended = true
  }

  /** Werkzeug-Aufruf vom MCP-Server. Antwort ist Text für Claude. */
  tool(sessionId: string, name: string, args: Record<string, unknown>, cwd?: string): { text: string; isError?: boolean } {
    if (!this.d.enabled()) return { text: t('Das VibeDesk-Gehirn ist ausgeschaltet.'), isError: true }
    // Session aus einem früheren App-Start (z. B. vor einem Update): Projekt über den Arbeitsordner finden
    const p = this.d.projectOfSession(sessionId) ?? (cwd ? this.d.projectOfDir?.(cwd) : undefined)
    if (!p) return { text: t('Diese Session gehört zu keinem VibeDesk-Projekt.'), isError: true }
    const store = this.store(p)
    const act = this.activity(p.id)
    const s = (k: string): string => (typeof args[k] === 'string' ? (args[k] as string) : '')
    const me = this.me()
    const meStore = me && this.store(me)
    // scope "me": Wissen über den User selbst, gilt in allen Projekten
    const mine = s('scope') === 'me' && !!me
    const pulse = (title: string, kind: BrainPulse['kind'], projectId = p.id): void =>
      this.d.emit('brain:pulse', { projectId, id: noteId(title), kind, ...(kind === 'write' ? { title } : {}) } satisfies BrainPulse)
    try {
      switch (name) {
        case 'brain_overview':
          return { text: overview(p.name, store.list(), act, 12_000) + this.personal() }
        case 'brain_search': {
          const hits = searchNotes(store.list(), s('query'))
          const meHits = meStore ? searchNotes(meStore.list(), s('query'), 5) : []
          hits.forEach((h) => pulse(h.title, 'read'))
          meHits.forEach((h) => pulse(h.title, 'read', ME_ID))
          const lines = [
            ...hits.map((h) => `- [[${h.title}]] (${NOTE_TYPE_LABEL[h.type]}) – ${h.snippet}`),
            ...meHits.map((h) => `- [[${h.title}]] (${t('{type}, über dich', { type: NOTE_TYPE_LABEL[h.type] })}) – ${h.snippet}`)
          ]
          if (!lines.length) return { text: t('Keine Notizen zu „{query}“. Wenn du dir das gerade erschließt, halte es danach mit brain_write fest.', { query: s('query') }) }
          return { text: lines.join('\n') }
        }
        case 'brain_read': {
          // ohne scope: erst das Projekt, dann das persönliche Gehirn
          const fromMe = mine || (!store.get(s('title')) && !!meStore?.get(s('title')))
          const src = fromMe && meStore ? meStore : store
          const n = src.get(s('title'))
          if (!n) {
            const alt = searchNotes(src.list(), s('title'), 5)
            return { text: t('Keine Notiz „{title}“.', { title: s('title') }) + (alt.length ? ' ' + t('Meintest du: {list}?', { list: alt.map((h) => `[[${h.title}]]`).join(', ') }) : ''), isError: true }
          }
          pulse(n.title, 'read', fromMe ? ME_ID : p.id)
          const back = backlinks(src.list(), n.title)
          const head = [`# ${n.title}${fromMe ? ' · ' + t('über dich') : ''}`, t('Typ: {type} · aktualisiert {date}', { type: NOTE_TYPE_LABEL[n.type], date: new Date(n.updated).toISOString().slice(0, 10) }) + (isStale(n, act) ? ' · ' + t('ZU PRÜFEN: verknüpfte Dateien wurden seitdem geändert') : '')]
          if (n.files.length) head.push(t('Dateien: {list}', { list: n.files.join(', ') }))
          if (n.tags.length) head.push(`Tags: ${n.tags.join(', ')}`)
          return { text: [...head, '', n.body, ...(back.length ? ['', t('Verlinkt von: {list}', { list: back.map((b) => `[[${b}]]`).join(', ') })] : [])].join('\n') }
        }
        case 'brain_related': {
          const rel = relPath(s('file'), p.path)
          if (!rel) return { text: t('Bitte einen Pfad innerhalb des Projekts angeben.'), isError: true }
          const notes = store.list().filter((n) => n.files.includes(rel) || n.body.includes(rel))
          notes.forEach((n) => pulse(n.title, 'read'))
          const co = coEditedWith(act, rel)
          const f = act.files[rel]
          const lines = [t('# Wissen zu {file}', { file: rel })]
          lines.push(notes.length ? notes.map((n) => `- [[${n.title}]] (${NOTE_TYPE_LABEL[n.type]})${isStale(n, act) ? ' – ' + t('zu prüfen') : ''}`).join('\n') : '- ' + t('noch keine Notiz zu dieser Datei'))
          if (co.length) lines.push('', t('Wird oft zusammen geändert mit:'), ...co.map((c) => `- ${c.file} (${c.count}×)`))
          if (f) lines.push('', t('Bisher {reads}× gelesen, {edits}× geändert.', { reads: f.reads, edits: f.edits }))
          return { text: lines.join('\n') }
        }
        case 'brain_write': {
          const target = mine ? me! : p
          const tStore = mine ? meStore! : store
          const { note, created } = tStore.write(
            {
              title: s('title'),
              type: s('type'),
              body: s('body'),
              files: !mine && Array.isArray(args.files) ? (args.files as unknown[]).map((f) => relPath(String(f), p.path)).filter((f): f is string => !!f) : undefined,
              tags: Array.isArray(args.tags) ? (args.tags as unknown[]).map(String) : undefined
            } satisfies NoteInput
          )
          pulse(note.title, 'write', target.id)
          this.markTended(sessionId)
          this.watch(target)
          this.changed(target.id)
          const missing = note.links.filter((l) => !tStore.get(l))
          const label = `[[${note.title}]]`
          const head = mine
            ? created
              ? t('Angelegt (über dich): {note}', { note: label })
              : t('Aktualisiert (über dich): {note}', { note: label })
            : created
              ? t('Angelegt: {note}', { note: label })
              : t('Aktualisiert: {note}', { note: label })
          return { text: head + (missing.length ? '\n' + t('Noch ohne Notiz: {list}', { list: missing.map((m) => `[[${m}]]`).join(', ') }) : '') }
        }
        case 'brain_forget': {
          const target = mine ? me! : p
          const ok = this.store(target).remove(s('title'))
          if (ok) this.changed(target.id)
          return ok ? { text: t('{note} archiviert.', { note: `[[${s('title')}]]` }) } : { text: t('Keine Notiz „{title}“.', { title: s('title') }), isError: true }
        }
        default:
          return { text: t('Unbekanntes Werkzeug {name}', { name }), isError: true }
      }
    } catch (err) {
      return { text: err instanceof Error ? err.message : String(err), isError: true }
    }
  }

  // ---------- Graph-Fenster ----------

  view(projectId: string): BrainView | null {
    const p = this.proj(projectId)
    if (!p || p.missing) return null
    this.watch(p)
    const notes = this.store(p).list()
    const act = this.activity(p.id)
    return {
      projectId: p.id,
      dir: path.join(p.path, BRAIN_DIR),
      graph: buildGraph(notes, act),
      notes: notes.length,
      stale: notes.filter((n) => isStale(n, act)).length,
      sessions: act.sessions.slice(-12).reverse()
    }
  }

  note(projectId: string, title: string): NoteDetail | null {
    const p = this.proj(projectId)
    if (!p) return null
    const store = this.store(p)
    const n = store.get(title)
    if (!n) return null
    const act = this.activity(p.id)
    return { ...n, stale: isStale(n, act), backlinks: backlinks(store.list(), n.title), path: path.join(store.dir, n.title + '.md') }
  }

  fileInfo(projectId: string, file: string): { file: string; abs: string; reads: number; edits: number; notes: string[]; co: { file: string; count: number }[] } | null {
    const p = this.proj(projectId)
    if (!p) return null
    const act = this.activity(p.id)
    const f = act.files[file]
    const notes = this.store(p)
      .list()
      .filter((n) => n.files.includes(file))
      .map((n) => n.title)
    return { file, abs: path.join(p.path, file), reads: f?.reads ?? 0, edits: f?.edits ?? 0, notes, co: coEditedWith(act, file) }
  }

  write(projectId: string, input: NoteInput, previousTitle?: string): NoteDetail {
    const p = this.proj(projectId)
    if (!p) throw new Error(t('Projekt nicht gefunden'))
    const store = this.store(p)
    if (previousTitle && titleKey(previousTitle) !== titleKey(input.title)) store.rename(previousTitle, input.title)
    const { note } = store.write(input)
    this.watch(p)
    this.changed(p.id)
    return this.note(p.id, note.title)!
  }

  remove(projectId: string, title: string): boolean {
    const p = this.proj(projectId)
    if (!p) return false
    const ok = this.store(p).remove(title)
    if (ok) this.changed(p.id)
    return ok
  }

  private changed(projectId: string): void {
    clearTimeout(this.changeTimers.get(projectId))
    this.changeTimers.set(
      projectId,
      setTimeout(() => {
        this.changeTimers.delete(projectId)
        this.d.emit('brain:changed', projectId)
      }, 150)
    )
  }

  /** Änderungen von außen (Obsidian, Editor, Git) live übernehmen */
  private watch(p: Project): void {
    if (this.watchers.has(p.id)) return
    const dir = path.join(p.path, BRAIN_DIR)
    // den Ordner legt erst die erste Notiz an – Projekte ohne Gehirn bleiben unberührt
    if (!fs.existsSync(dir)) return
    try {
      const w = fs.watch(dir, { recursive: true }, (_ev, f) => {
        if (f && String(f).toLowerCase().endsWith('.md')) this.changed(p.id)
      })
      w.on('error', () => {
        w.close()
        this.watchers.delete(p.id)
      })
      this.watchers.set(p.id, w)
    } catch {
      // ohne Watcher aktualisiert das Fenster beim nächsten Öffnen
    }
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** Projekt, das den Ordner enthält – das innerste gewinnt (Windows: Groß-/Kleinschreibung egal) */
export function projectOfDir(projects: Project[], dir: string): Project | undefined {
  const norm = (p: string): string => path.resolve(p).replace(/[\\/]+$/, '').toLowerCase()
  const d = norm(dir)
  return projects
    .filter((p) => !p.missing && (d === norm(p.path) || d.startsWith(norm(p.path) + path.sep)))
    .sort((a, b) => b.path.length - a.path.length)[0]
}

export function registerBrainIpc(brain: BrainService): void {
  ipcMain.handle('brain:view', (_e, projectId: unknown) => brain.view(str(projectId)))
  ipcMain.handle('brain:note', (_e, projectId: unknown, title: unknown) => brain.note(str(projectId), str(title)))
  ipcMain.handle('brain:file', (_e, projectId: unknown, file: unknown) => brain.fileInfo(str(projectId), str(file)))
  ipcMain.handle('brain:write', (_e, projectId: unknown, note: BrainNoteInput, prev: unknown) =>
    brain.write(str(projectId), { title: str(note?.title), type: str(note?.type), body: str(note?.body), tags: note?.tags, files: note?.files }, str(prev) || undefined)
  )
  ipcMain.handle('brain:remove', (_e, projectId: unknown, title: unknown) => brain.remove(str(projectId), str(title)))
  ipcMain.handle('brain:reveal', async (_e, projectId: unknown) => {
    const v = brain.view(str(projectId))
    if (!v || !fs.existsSync(v.dir)) return false
    return (await shell.openPath(v.dir)) === ''
  })
}
