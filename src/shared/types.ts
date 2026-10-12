export interface Project {
  id: string
  name: string
  path: string
  createdAt: number
  lastOpenedAt: number | null
  missing?: boolean
}

export type SessionStatus = 'idle' | 'working' | 'waiting' | 'done' | 'error'

export interface SessionInfo {
  id: string
  projectId: string
  name: string
  cwd: string
}

export interface HookEvent {
  sessionId: string
  name: string
  payload: Record<string, unknown>
  ts: number
}

export interface WindowRect {
  x: number
  y: number
  w: number
  h: number
}

import type { Activity, PresenceConfig } from './presence'

export type PanelId = 'projects' | 'skills' | 'inspector' | 'prompts' | 'focus' | 'discord' | 'editor'

export type DiscordStatus =
  | { state: 'off' }
  | { state: 'connecting' }
  | { state: 'connected'; user: { id: string; username: string; globalName: string | null; avatar: string | null } }
  | { state: 'unavailable'; reason: string }

export type UpdateStatus =
  | { state: 'idle' | 'checking' | 'none' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; percent: number; version: string }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }

export interface DiscordAppInfo {
  name: string
  icon: string | null
  assets: { id: string; name: string; url: string }[]
}

export interface Prompt {
  id: string
  title: string
  text: string
}

export interface FocusSettings {
  work: number
  short: number
  long: number
  rounds: number
}

export interface Usage {
  input: number
  output: number
  cacheRead: number
  cacheWrite5m: number
  cacheWrite1h: number
}

export interface SessionStats {
  sessionId: string
  model: string | null
  total: Usage
  contextUsed: number
  contextWindow: number
  costUsd: number
  estimated: boolean
  responses: number
  startedAt: number | null
}

export interface DayStats {
  date: string
  tokens: number
  cacheRead: number
  costUsd: number
}

export interface ClaudeSessionMeta {
  id: string
  title: string
  mtime: number
  size: number
}

export interface Settings {
  projectsDir: string
  streamUrl: string
  musicOn: boolean
  musicVolume: number
  rainSoundOn: boolean
  rainSoundVolume: number
  rainIntensity: number
  blur: number
  scene: string
  customScenes: string[]
  visiblePanels: PanelId[]
  windowRects: Record<string, WindowRect>
  maxSessions: number
  chimeOn: boolean
  chimeVolume: number
  prompts: Prompt[]
  focus: FocusSettings
  discord: PresenceConfig
  onboarded: boolean
  /** offene Editor-Tabs pro Projekt (nur Pfade) */
  editorTabs: Record<string, string[]>
  /** zuletzt gesehene Version – für „Was ist neu“ nach Updates */
  lastSeenVersion: string
}

export interface FileEntry {
  name: string
  path: string
  dir: boolean
}

export type Eol = 'lf' | 'crlf'

export interface FileContent {
  /** aufgelöster, kanonischer Pfad – Schlüssel für Tabs und Watcher */
  path: string
  text: string
  mtime: number
  eol: Eol
  bom: boolean
}

export type FileErrorCode = 'outside' | 'binary' | 'too_large' | 'conflict' | 'not_found' | 'io'

export type FileResult<T> = ({ ok: true } & T) | { ok: false; code: FileErrorCode; message: string }

export type FileChange = { path: string; kind: 'changed'; mtime: number } | { path: string; kind: 'deleted' }

export type ToolId = 'node' | 'claude'

export interface ToolStatus {
  /** Version oder null, wenn nicht gefunden */
  node: string | null
  claude: string | null
  winget: boolean
}

export interface SkillInfo {
  name: string
  description: string
  dir: string
  /** 'global' or the projectId */
  scope: 'global' | string
}

export type SkillTarget = { kind: 'global' } | { kind: 'project'; projectId: string }

export interface SkillCandidateSummary {
  token: string
  name: string
  description: string
}

export type Unsubscribe = () => void

export interface VibedeskApi {
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
  }
  projects: {
    list(): Promise<Project[]>
    create(name: string): Promise<Project>
    add(dir: string): Promise<Project>
    remove(id: string, trash: boolean): Promise<void>
  }
  fs: {
    suggestDirs(prefix: string): Promise<string[]>
    pathForFile(file: File): string
  }
  app: {
    exitFullscreen(): void
    toggleFullscreen(): void
    quit(): void
    claudeInstalled(): Promise<boolean>
    claudeVersion(): Promise<string | null>
  }
  setup: {
    check(): Promise<ToolStatus>
    install(tool: ToolId): Promise<boolean>
    openDownload(tool: ToolId): void
  }
  sessions: {
    start(projectId: string, resumeId?: string): Promise<SessionInfo>
    stop(id: string): Promise<void>
    write(id: string, data: string): void
    resize(id: string, cols: number, rows: number): void
    list(): Promise<SessionInfo[]>
  }
  on: {
    sessionData(cb: (id: string, data: string) => void): Unsubscribe
    sessionExit(cb: (id: string, code: number) => void): Unsubscribe
    hookEvent(cb: (e: HookEvent) => void): Unsubscribe
    stats(cb: (s: SessionStats) => void): Unsubscribe
    discordStatus(cb: (s: DiscordStatus) => void): Unsubscribe
    update(cb: (s: UpdateStatus) => void): Unsubscribe
    fileChange(cb: (c: FileChange) => void): Unsubscribe
    setupLog(cb: (tool: ToolId, line: string) => void): Unsubscribe
  }
  update: {
    status(): Promise<UpdateStatus>
    version(): Promise<string>
    check(): Promise<void>
    install(): void
  }
  discord: {
    configure(enabled: boolean, clientId: string): void
    setActivity(a: Activity | null): void
    status(): Promise<DiscordStatus>
    appInfo(clientId: string): Promise<DiscordAppInfo | null>
  }
  stats: {
    history(): Promise<DayStats[]>
  }
  history: {
    list(projectId: string): Promise<ClaudeSessionMeta[]>
  }
  notes: {
    get(projectId: string): Promise<string>
    set(projectId: string, text: string): Promise<void>
  }
  openExternal(url: string): void
  files: FilesApi
  scenes: {
    addCustom(path: string): Promise<string>
  }
  skills: {
    list(): Promise<SkillInfo[]>
    importPaths(paths: string[]): Promise<SkillCandidateSummary[]>
    importGithub(url: string): Promise<SkillCandidateSummary[]>
    install(tokens: string[], target: SkillTarget, replace: boolean): Promise<SkillInfo[]>
    remove(dir: string): Promise<void>
  }
}

export interface FilesApi {
  list(dir: string): Promise<FileResult<{ entries: FileEntry[] }>>
  read(path: string): Promise<FileResult<FileContent>>
  write(path: string, text: string, expectedMtime: number | null, eol: Eol, bom: boolean): Promise<FileResult<{ mtime: number }>>
  watch(path: string): void
  unwatch(path: string): void
  reveal(path: string): void
}
