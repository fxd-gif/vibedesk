// „Vibe Wrapped“: sammelt pro Tag, was mit Claude passiert ist (Prompts, Werkzeuge, Dateien, aktive Minuten, Projekte)
// und fasst die Woche zusammen. Nur Zähler und Projektnamen – keine Inhalte.
import { localDate } from './statsService'
import fs from 'fs'
import path from 'path'
import { readJson } from './jsonFile'
import type { HookEvent, VibeWeek } from '../shared/types'

const KEEP_DAYS = 60
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const FILES_MAX = 400

export interface VibeDay {
  prompts: number
  tools: Record<string, number>
  fails: number
  /** Minuten des Tages (0–1439) mit Aktivität */
  minutes: number[]
  /** Projektname → aktive Minuten */
  projects: Record<string, number>
  files: string[]
  agents: number
  focus: number
}

const emptyDay = (): VibeDay => ({ prompts: 0, tools: {}, fails: 0, minutes: [], projects: {}, files: [], agents: 0, focus: 0 })

export class VibeLog {
  private days: Record<string, VibeDay>
  private dirty = false
  private timer: ReturnType<typeof setTimeout> | null = null
  /** zuletzt gezählte Minute pro Projekt – eine Minute zählt pro Projekt nur einmal */
  private lastMinute = new Map<string, string>()

  constructor(
    private file: string | null,
    private now: () => number = Date.now
  ) {
    this.days = file ? readJson(file, {}) : {}
  }

  private day(ts: number): VibeDay {
    const k = localDate(ts)
    const d = (this.days[k] ??= emptyDay())
    // ältere Dateien ohne neue Felder
    d.tools ??= {}
    d.minutes ??= []
    d.projects ??= {}
    d.files ??= []
    return d
  }

  record(e: HookEvent, project: string | undefined): void {
    const ts = e.ts || this.now()
    const d = this.day(ts)
    const p = e.payload
    if (e.name === 'UserPromptSubmit') d.prompts++
    if (e.name === 'PreToolUse' && typeof p.tool_name === 'string') {
      const tool = p.tool_name.slice(0, 40)
      d.tools[tool] = (d.tools[tool] ?? 0) + 1
      const input = p.tool_input as { file_path?: unknown } | undefined
      if (EDIT_TOOLS.has(tool) && typeof input?.file_path === 'string' && !d.files.includes(input.file_path) && d.files.length < FILES_MAX) d.files.push(input.file_path)
    }
    if (e.name === 'PostToolUse') {
      const r = p.tool_response as { is_error?: unknown } | undefined
      if (r && r.is_error === true) d.fails++
    }
    if (e.name === 'SubagentStart') d.agents++
    const t = new Date(ts)
    const minute = t.getHours() * 60 + t.getMinutes()
    if (!d.minutes.includes(minute)) d.minutes.push(minute)
    if (project) {
      const key = `${localDate(ts)}:${minute}`
      if (this.lastMinute.get(project) !== key) {
        this.lastMinute.set(project, key)
        d.projects[project] = (d.projects[project] ?? 0) + 1
      }
    }
    this.save()
  }

  focusDone(ts = this.now()): void {
    this.day(ts).focus++
    this.save()
  }

  private save(): void {
    this.dirty = true
    if (!this.file || this.timer) return
    // gebündelt schreiben – Hooks kommen in Schwärmen
    this.timer = setTimeout(() => this.flush(), 2000)
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (!this.dirty || !this.file) return
    this.dirty = false
    const keys = Object.keys(this.days).sort()
    for (const k of keys.slice(0, Math.max(0, keys.length - KEEP_DAYS))) delete this.days[k]
    // kompakt – die Minutenlisten wären eingerückt riesig
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(this.days), 'utf8')
    fs.renameSync(tmp, this.file)
  }

  /** Die letzten 7 Tage bis einschließlich today (YYYY-MM-DD) */
  week(today = localDate(this.now())): VibeWeek {
    const [y, m, dd] = today.split('-').map(Number)
    const dates: string[] = []
    for (let i = 6; i >= 0; i--) dates.push(localDate(new Date(y, m - 1, dd - i, 12).getTime()))
    const tools: Record<string, number> = {}
    const projects: Record<string, number> = {}
    const hours = new Array<number>(24).fill(0)
    const files = new Set<string>()
    let prompts = 0
    let fails = 0
    let agents = 0
    let focus = 0
    let minutes = 0
    const perDay: VibeWeek['days'] = []
    let streak = 0
    for (const date of dates) {
      const d = this.days[date]
      const active = d?.minutes?.length ?? 0
      perDay.push({ date, minutes: active, prompts: d?.prompts ?? 0 })
      streak = active ? streak + 1 : 0
      if (!d) continue
      prompts += d.prompts
      fails += d.fails
      agents += d.agents
      focus += d.focus ?? 0
      minutes += active
      for (const [k, v] of Object.entries(d.tools ?? {})) tools[k] = (tools[k] ?? 0) + v
      for (const [k, v] of Object.entries(d.projects ?? {})) projects[k] = (projects[k] ?? 0) + v
      for (const f of d.files ?? []) files.add(f)
      for (const mi of d.minutes ?? []) hours[Math.floor(mi / 60)]++
    }
    const toolCalls = Object.values(tools).reduce((a, b) => a + b, 0)
    const top = <T extends Record<string, number>>(r: T, n: number): { name: string; count: number }[] =>
      Object.entries(r)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([name, count]) => ({ name, count }))
    const peak = hours.indexOf(Math.max(...hours))
    const best = perDay.reduce((a, b) => (b.minutes > a.minutes ? b : a), perDay[0])
    return {
      from: dates[0],
      to: dates[6],
      minutes,
      prompts,
      toolCalls,
      fails,
      agents,
      focus,
      files: files.size,
      tools: top(tools, 5),
      projects: top(projects, 5),
      peakHour: minutes ? peak : null,
      bestDay: best && best.minutes ? best.date : null,
      streak,
      days: perDay,
      persona: persona({ minutes, prompts, toolCalls, fails, agents, peak: minutes ? peak : null, tools })
    }
  }
}

/** Ein Augenzwinkern zum Schluss – abhängig davon, wie die Woche lief */
export function persona(w: { minutes: number; prompts: number; toolCalls: number; fails: number; agents: number; peak: number | null; tools: Record<string, number> }): string {
  if (!w.minutes) return 'Die Ruhe vor dem Sturm'
  if (w.peak !== null && (w.peak >= 23 || w.peak < 5)) return 'Nachteule des Codes'
  if (w.peak !== null && w.peak >= 5 && w.peak < 9) return 'Frühaufsteher-Vibes'
  if (w.agents >= 10) return 'Dirigent der Agenten'
  const edits = (w.tools.Edit ?? 0) + (w.tools.Write ?? 0) + (w.tools.MultiEdit ?? 0)
  if (w.toolCalls && edits / w.toolCalls > 0.4) return 'Code-Bildhauer'
  if (w.toolCalls && (w.tools.Bash ?? 0) / w.toolCalls > 0.4) return 'Terminal-Magier'
  if (w.toolCalls && ((w.tools.Read ?? 0) + (w.tools.Grep ?? 0) + (w.tools.Glob ?? 0)) / w.toolCalls > 0.5) return 'Code-Archäologe'
  if (w.fails >= 25) return 'Unbeirrbarer Debugger'
  if (w.prompts >= 150) return 'Prompt-Maschine'
  return 'Entspannter Viber'
}
