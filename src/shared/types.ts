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
import type { AddonManifest, AddonPackage } from './addonFormat'
import type { BlocklyProgram } from './addonBlocks'
import type { OverlayState } from './overlay'
import type { WebhookPayload, WebhookSettings } from './webhook'
import type { BrainPulse, BrainView, NoteDetail } from './brain'
import type { GitCommit, GitState, GitTools } from './git'
import type { CompanionDevice, CompanionPairing, CompanionSettings, CompanionSnapshot, CompanionStatus, PromptTarget } from './companion'
import type { PermissionAsk, PermissionDecision } from './permissions'

export type PanelId = 'projects' | 'skills' | 'inspector' | 'prompts' | 'focus' | 'discord' | 'editor' | 'addons' | 'lounge' | 'streamer' | 'brain' | 'git' | 'companion'

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

/** Arten von Mitteilungen – jede lässt sich einzeln abschalten */
/** watch = Wächter: Session hängt, Fehlerschleife, Kontext fast voll */
export type NoticeKind = 'waiting' | 'done' | 'error' | 'watch'

export interface NotifySettings {
  /** Karten unten rechts */
  toasts: boolean
  /** Windows-Benachrichtigung, solange VibeDesk im Hintergrund ist */
  windows: boolean
  /** in Fokus-Runden nur Wichtiges zeigen, den Rest danach gesammelt */
  focusQuiet: boolean
  kinds: Record<NoticeKind, boolean>
}

export interface BrainNoteInput {
  title: string
  type: string
  body: string
  tags?: string[]
  files?: string[]
}

export interface BrainFileInfo {
  file: string
  abs: string
  reads: number
  edits: number
  notes: string[]
  co: { file: string; count: number }[]
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
  /** Discord-Webhook für Benachrichtigungen – die URL ist ein Geheimnis */
  discordHook: WebhookSettings
  onboarded: boolean
  /** offene Editor-Tabs pro Projekt (nur Pfade) */
  editorTabs: Record<string, string[]>
  /** zuletzt gesehene Version – für „Was ist neu“ nach Updates */
  lastSeenVersion: string
  lounge: LoungeSettings
  streamer: StreamerSettings
  notify: NotifySettings
  /** alle Dock-Symbole zeigen statt nur der gerade sinnvollen */
  dockAll: boolean
  /** VibeDesk-Gehirn: Claude bekommt Projektgedächtnis (MCP + Überblick beim Start) */
  brainOn: boolean
  /** Freigaben (Erlauben/Ablehnen) als Karte in VibeDesk und auf dem Handy beantworten */
  approvalsOn: boolean
  companion: CompanionSettings
}

export interface LoungeSettings {
  name: string
  emoji: string
  /** Projektnamen in der Lounge zeigen (aus im Streamer-Modus) */
  showProject: boolean
  lastRoom: string
}

export interface StreamerSettings {
  enabled: boolean
  hidePaths: boolean
  maskEmails: boolean
  hideNotes: boolean
  protectFiles: boolean
  /** Kosten im Overlay zeigen */
  overlayCost: boolean
  /** Bash-Befehle im Overlay zeigen (sonst nur „Befehl“) */
  overlayBash: boolean
  overlayPort: number
  overlayToken: string
  twitchChannel: string
  chatCommand: string
  chatModsOnly: boolean
}

export type OverlayStatus = { running: false; error?: string } | { running: true; port: number }

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

export type FileErrorCode = 'outside' | 'binary' | 'too_large' | 'conflict' | 'not_found' | 'io' | 'exists' | 'invalid'

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
    /** Windows-Benachrichtigung; ein Klick darauf holt VibeDesk nach vorn und meldet die id zurück */
    notify(id: number, title: string, body: string): void
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
    addonOpen(cb: (path: string) => void): Unsubscribe
    notifyClick(cb: (id: number) => void): Unsubscribe
    brainChanged(cb: (projectId: string) => void): Unsubscribe
    brainPulse(cb: (p: BrainPulse) => void): Unsubscribe
    gitLoginCode(cb: (code: string, url: string) => void): Unsubscribe
    gitInstallLog(cb: (tool: 'git' | 'gh', line: string) => void): Unsubscribe
    permissions(cb: (list: PermissionAsk[]) => void): Unsubscribe
    /** Prompt vom Handy: abschicken und mit companion.promptDone(reqId, ok) bestätigen */
    companionPrompt(cb: (reqId: string, target: PromptTarget, text: string) => void): Unsubscribe
    /** gekoppelte Geräte haben sich geändert (neu gekoppelt, abgemeldet) */
    companionDevices(cb: (list: CompanionDevice[], paired?: CompanionDevice) => void): Unsubscribe
    /** Handy hat Herunterfahren/Standby ausgelöst oder abgebrochen */
    companionPower(cb: (action: 'shutdown' | 'sleep' | 'cancel', at: number | null) => void): Unsubscribe
  }
  addons: {
    list(): Promise<InstalledAddon[]>
    /** Pfad zu einer .vibeaddon-Datei oder deren Bytes */
    inspect(src: string | Uint8Array): Promise<AddonPreview>
    install(src: string | Uint8Array): Promise<InstalledAddon>
    remove(id: string): Promise<void>
    setEnabled(id: string, on: boolean): Promise<void>
    saveDraft(p: AddonPackage): Promise<InstalledAddon>
    /** Speichern-Dialog; liefert den Zielpfad oder null bei Abbruch */
    exportTo(id: string): Promise<string | null>
    pickFile(): Promise<string | null>
    /** Beim Start per Doppelklick übergebene Datei (einmalig) */
    takePending(): Promise<string | null>
    getState(id: string): Promise<Record<string, StoredValue>>
    setState(id: string, data: Record<string, StoredValue>): Promise<void>
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
    webhook(kind: 'waiting' | 'recap' | 'test', body: WebhookPayload): Promise<{ ok: boolean; skipped?: boolean; error?: string }>
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
  git: {
    tools(): Promise<GitTools>
    install(tool: 'git' | 'gh'): Promise<boolean>
    login(): Promise<void>
    cancelLogin(): void
    status(projectId: string): Promise<GitState>
    diff(projectId: string, file: string, staged: boolean, untracked: boolean): Promise<string>
    stage(projectId: string, paths: string[]): Promise<void>
    stageAll(projectId: string): Promise<void>
    unstage(projectId: string, paths: string[], unborn: boolean): Promise<void>
    discard(projectId: string, files: { path: string; untracked: boolean }[]): Promise<void>
    commit(projectId: string, message: string, all: boolean): Promise<string>
    log(projectId: string): Promise<GitCommit[]>
    show(projectId: string, hash: string): Promise<string>
    init(projectId: string): Promise<void>
    pull(projectId: string): Promise<void>
    push(projectId: string, hasUpstream: boolean): Promise<void>
    fetch(projectId: string): Promise<void>
    publish(projectId: string, name: string, priv: boolean): Promise<string>
    aiMessage(projectId: string): Promise<string>
    openWeb(url: string): void
  }
  brain: {
    view(projectId: string): Promise<BrainView | null>
    note(projectId: string, title: string): Promise<NoteDetail | null>
    file(projectId: string, file: string): Promise<BrainFileInfo | null>
    write(projectId: string, note: BrainNoteInput, previousTitle?: string): Promise<NoteDetail>
    remove(projectId: string, title: string): Promise<boolean>
    reveal(projectId: string): Promise<boolean>
  }
  openExternal(url: string): void
  preview: {
    /** PNG (Data-URL) speichern → Dateipfad für Claude */
    saveShot(dataUrl: string): Promise<string | null>
  }
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
    exportCode(dir: string, from: string): Promise<string>
    importCode(code: string): Promise<SkillCandidateSummary[]>
  }
  streamer: {
    configure(enabled: boolean, port: number): Promise<OverlayStatus>
    push(state: OverlayState): void
    user(): Promise<string>
  }
  permissions: {
    list(): Promise<PermissionAsk[]>
    answer(id: string, decision: PermissionDecision): Promise<boolean>
  }
  companion: {
    configure(enabled: boolean, port: number): Promise<CompanionStatus>
    /** Adressen neu ermitteln (z. B. nachdem Tailscale gestartet wurde) */
    status(): Promise<CompanionStatus>
    /** Tailscale installieren (falls nötig) und Anmeldung im Browser starten */
    setupTailscale(): Promise<boolean>
    /** Windows-Firewall für Tailscale und das eigene Netz öffnen (fragt per UAC) */
    openFirewall(): Promise<boolean>
    /** Einmal-Code zum Koppeln eines Handys (5 Minuten gültig) */
    startPairing(): Promise<CompanionPairing>
    cancelPairing(): void
    devices(): Promise<CompanionDevice[]>
    revoke(id: string): Promise<void>
    revokeAll(): Promise<void>
    cancelShutdown(): Promise<boolean>
    push(s: CompanionSnapshot): void
    promptDone(reqId: string, ok: boolean): void
  }
  clipboard: {
    write(text: string): void
    read(): Promise<string>
  }
}

export interface FilesApi {
  list(dir: string): Promise<FileResult<{ entries: FileEntry[] }>>
  read(path: string): Promise<FileResult<FileContent>>
  write(path: string, text: string, expectedMtime: number | null, eol: Eol, bom: boolean): Promise<FileResult<{ mtime: number }>>
  watch(path: string): void
  unwatch(path: string): void
  reveal(path: string): void
  /** legt eine Datei/einen Ordner an; name darf Unterordner enthalten (a/b.ts) */
  create(parent: string, name: string, kind: 'file' | 'dir'): Promise<FileResult<{ path: string }>>
  rename(path: string, newName: string): Promise<FileResult<{ path: string }>>
  /** verschiebt in den Papierkorb */
  trash(path: string): Promise<FileResult<{ path: string }>>
}

export interface InstalledAddon {
  manifest: AddonManifest
  enabled: boolean
  program: BlocklyProgram
  assetNames: string[]
}

export interface AddonPreview {
  manifest: AddonManifest
  capabilityLabels: string[]
  images: { name: string; dataUrl: string }[]
  existing: { name: string; author: string; version: number } | null
}

export type { AddonPackage }

/** Wert, den ein Addon dauerhaft speichern darf */
export type StoredValue = number | string | boolean | (number | string | boolean)[]
