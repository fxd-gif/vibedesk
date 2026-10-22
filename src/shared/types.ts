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
  /** nicht von dieser VibeDesk-Instanz gestartet (z. B. vor einem Update) – nur im Inspector, ohne Terminal */
  external?: boolean
}

export interface AppInfo {
  version: string
  electron: string
  os: string
  claude: string | null
  /** steht etwas im Fehlerprotokoll? */
  hasErrors: boolean
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
import type { OverlayLook, OverlayState } from './overlay'
import type { WebhookPayload, WebhookSettings } from './webhook'
import type { BrainPulse, BrainView, NoteDetail } from './brain'
import type { GitCommit, GitState, GitTools } from './git'
import type { WrapChanges } from './wrapUp'
import type { LivingScene, LivingStatus } from './living'
import type { ApplyResult, Checkpoint, MergeFileView, MergeOverview, MergeResult, ReviewResult, TestRun } from './merge'
import type { PlanLimits } from './limits'
import type { DevScript } from './devScript'
import type { CustomTheme, DeskCommand } from './desk'
import type { CompanionDevice, CompanionPairing, CompanionSettings, CompanionSnapshot, CompanionStatus, PromptTarget, TermChunk, TermQuery } from './companion'
import type { PermissionAsk, PermissionDecision } from './permissions'
import type { LangSetting } from './i18n'
import type { SpotifyCommand, SpotifyDevice, SpotifyPlayer, SpotifyPlaylist, SpotifyQueue, SpotifyStatus, SpotifyTrack } from './spotify'

export type PanelId = 'projects' | 'skills' | 'inspector' | 'prompts' | 'focus' | 'discord' | 'editor' | 'addons' | 'lounge' | 'streamer' | 'brain' | 'git' | 'companion' | 'ambience' | 'merge' | 'settings'

export type DiscordStatus =
  | { state: 'off' }
  | { state: 'connecting' }
  | { state: 'connected'; user: { id: string; username: string; globalName: string | null; avatar: string | null } }
  | { state: 'unavailable'; reason: string }

export type UpdateStatus =
  | { state: 'idle' | 'checking' | 'none' }
  /** manual = automatische Updates sind aus: erst auf Knopfdruck laden */
  | { state: 'available'; version: string; manual?: boolean }
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

/** Wochenrückblick „Vibe Wrapped“ */
export interface VibeWeek {
  from: string
  to: string
  /** aktive Minuten (mit Claude-Aktivität) */
  minutes: number
  prompts: number
  toolCalls: number
  fails: number
  agents: number
  focus: number
  /** verschiedene bearbeitete Dateien */
  files: number
  tools: { name: string; count: number }[]
  projects: { name: string; count: number }[]
  peakHour: number | null
  bestDay: string | null
  /** Tage in Folge mit Aktivität bis heute */
  streak: number
  days: { date: string; minutes: number; prompts: number }[]
  persona: string
  /** Notizen im persönlichen Gehirn, die in dieser Woche entstanden oder aktualisiert wurden */
  learned?: number
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
  /** Schnell-Prompt von überall per Strg+Alt+Leertaste */
  quickPrompt: boolean
  /** wann der Wochenrückblick zuletzt angeboten wurde (0 = noch nie) */
  lastWrapped: number
  terminal: TerminalSettings
  /** Startet ein Terminal einen lokalen Server (localhost), öffnet sich die Vorschau von selbst */
  previewAutoOpen: boolean
  /** Meldet Claude „Limit erreicht“, schickt VibeDesk nach dem Reset von selbst „mach weiter“ */
  autoResume: boolean
  /** Sprache der Oberfläche; 'auto' folgt der Systemsprache */
  language: LangSetting
  /** Regen-Hintergrund sparsamer zeichnen: 'auto' nur im Akkubetrieb, 'on' immer, 'off' nie */
  energySaver: EnergySaver
  /** Client-ID der eigenen Spotify-App (developer.spotify.com) – öffentlich, kein Geheimnis */
  spotifyClientId: string
  /** Aufbau der Oberfläche: 'desktop' = freie Fenster + Dock, 'studio' = Seitenleiste + Seiten + Statusleiste */
  layout: LayoutTheme
  /** Merge Studio: eigener Testbefehl pro Projekt (sonst aus package.json & Co. erkannt) */
  mergeTestCmd: Record<string, string>
  /** Werkzeugkasten: ausgeblendete Module – erscheinen weder im Dock noch im Mehr-Menü oder in der Palette */
  modulesOff: PanelId[]
  /** leise Tipps (z. B. „Merge Studio“ bei zwei Sessions) statt neuer Symbole */
  hintsOn: boolean
  /** schon gezeigte Tipps – jeder kommt nur einmal */
  hintsSeen: string[]
  /** Panels, die lange nicht benutzt wurden, von selbst minimieren */
  autoTidy: boolean
  /** Dock blendet sich ab, solange man im Terminal tippt */
  dockFade: boolean
  /** Session-Abschluss: hat Claude in einer Runde Dateien geändert, bietet die Fertig-Karte Zusammenfassung und Commit an */
  wrapUp: boolean
  /** Updates selbst laden und beim Start installieren (aus: nur Hinweis, Laden per Knopf) */
  autoUpdate: boolean
  /** Erfahrung aus dem Onboarding – bestimmt die Grundeinstellung ('' = noch nicht gefragt) */
  experience: Experience
  /** ausgeblendete Tabs im Session-Inspector */
  inspectorTabsOff: string[]
  /** Klick-Tour schon gesehen */
  tourDone: boolean
  /** eigenes Terminal-Farbschema (z. B. von Claude über desk_custom_theme erzeugt) – gilt bei terminal.theme 'custom' */
  customTheme: CustomTheme | null
}

export type Experience = '' | 'beginner' | 'pro'

export type LayoutTheme = 'desktop' | 'studio'

export type EnergySaver = 'auto' | 'on' | 'off'

export type TerminalCursor = 'block' | 'bar' | 'underline'
export type ShellKind = 'powershell' | 'pwsh' | 'cmd'

/** Eigenes Shell-Terminal in einem Projektordner */
export interface ShellInfo {
  id: string
  projectId: string
  name: string
  cwd: string
  kind: ShellKind
  /** Shell im geteilten Claude-Fenster dieser Session (sonst eigenes Fenster) */
  attachedTo?: string
}

/** Aussehen und Verhalten der Terminals (Claude und Shell) */
export interface TerminalSettings {
  fontSize: number
  lineHeight: number
  cursorStyle: TerminalCursor
  cursorBlink: boolean
  /** Farbschema; 'scene' = passend zur gewählten Szene */
  theme: string
  /** Shell für eigene Terminals neben Claude */
  shell: ShellKind
  /** Statuszeile mit Modell, Kontext, Kosten und Laufzeit */
  statusBar: boolean
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
  /** alt: kleine Zeile „made with VibeDesk“; false wird zu overlayLook.credit = 'off' */
  overlayCredit?: boolean
  /** Aussehen des Overlays (Position, Größe, Design, Farbe …); fehlt es, gilt DEFAULT_LOOK */
  overlayLook?: Partial<OverlayLook>
  /** gewählte Overlay-Bausteine; fehlt es, sind alle an */
  overlayWidgets?: string[]
  /** !vibedesk im Twitch-Chat zeigt kurz eine Info-Karte im Overlay; fehlt es, gilt an */
  infoCommand?: boolean
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
  /** Anmeldedaten von Claude Code gefunden (Abo-Anmeldung oder API-Schlüssel) – geprüft ohne Netz */
  login: boolean
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
    /** Render-Fehler ins lokale Protokoll (userData/logs/fehler.log) */
    logError(where: string, msg: string): void
    /** öffnet ein vorausgefülltes GitHub-Issue im Browser */
    reportBug(summary?: string): void
    openLog(): void
    info(): Promise<AppInfo>
  }
  setup: {
    check(): Promise<ToolStatus>
    install(tool: ToolId): Promise<boolean>
    openDownload(tool: ToolId): void
  }
  sessions: {
    /** cwd: Worktree im Projekt (Merge Studio) statt des Projektordners */
    start(projectId: string, resumeId?: string, cwd?: string): Promise<SessionInfo>
    /** Dev-Server-Skript aus package.json im Ordner der Session (null = keins) */
    devScript(id: string): Promise<DevScript | null>
    stop(id: string): Promise<void>
    write(id: string, data: string): void
    resize(id: string, cols: number, rows: number): void
    list(): Promise<SessionInfo[]>
    /** Sessions, die VibeDesk nicht selbst gestartet hat, die sich aber per Hook melden */
    externals(): Promise<SessionInfo[]>
  }
  /** Eigene Shell-Terminals (PowerShell/cmd) im Projektordner */
  shells: {
    start(projectId: string, attachedTo?: string): Promise<ShellInfo>
    stop(id: string): Promise<void>
    write(id: string, data: string): void
    resize(id: string, cols: number, rows: number): void
    list(): Promise<ShellInfo[]>
  }
  /** Zwischenablage und Dateien fürs Terminal */
  terminal: {
    /** Text – oder bei einem Bild der Pfad einer Temp-Datei, die man Claude geben kann */
    readClipboard(): Promise<{ text: string } | { image: string } | null>
    writeClipboard(text: string): Promise<void>
    /** Pfad einer per Drag & Drop abgelegten Datei */
    filePath(file: File): string
    /** Windows-Dateidialog (Mehrfachauswahl) – leer, wenn abgebrochen */
    pickFiles(defaultPath?: string): Promise<{ path: string; size: number }[]>
  }
  on: {
    sessionData(cb: (id: string, data: string) => void): Unsubscribe
    sessionExit(cb: (id: string, code: number) => void): Unsubscribe
    sessionExternal(cb: (info: SessionInfo) => void): Unsubscribe
    sessionExternalEnd(cb: (id: string) => void): Unsubscribe
    shellData(cb: (id: string, data: string) => void): Unsubscribe
    shellExit(cb: (id: string, code: number) => void): Unsubscribe
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
    mergeTestLog(cb: (line: string) => void): Unsubscribe
    permissions(cb: (list: PermissionAsk[]) => void): Unsubscribe
    /** Prompt vom Handy: abschicken und mit companion.promptDone(reqId, ok) bestätigen */
    companionPrompt(cb: (reqId: string, target: PromptTarget, text: string) => void): Unsubscribe
    /** gekoppelte Geräte haben sich geändert (neu gekoppelt, abgemeldet) */
    companionDevices(cb: (list: CompanionDevice[], paired?: CompanionDevice) => void): Unsubscribe
    /** Handy hat Herunterfahren/Standby ausgelöst oder abgebrochen */
    companionPower(cb: (action: 'shutdown' | 'sleep' | 'cancel', at: number | null) => void): Unsubscribe
    /** Neuer Stand von Main (z. B. Internet-Link ist da oder hat sich geändert) */
    companionStatus(cb: (s: CompanionStatus) => void): Unsubscribe
    /** Claude steuert den Desktop über das MCP-Werkzeug desk_* */
    deskCommand(cb: (c: DeskCommand) => void): Unsubscribe
    livingChanged(cb: (list: LivingScene[]) => void): Unsubscribe
    /** Main bittet um einen Schnappschuss der laufenden lebenden Szene */
    livingSnapshot(cb: (req: string) => void): Unsubscribe
    /** Neue Abo-Limits aus der Statuszeile von Claude Code */
    limits(cb: (l: PlanLimits) => void): Unsubscribe
    /** Handy will Terminal-Zeilen: lesen und mit companion.termDone(reqId, chunk) antworten */
    companionTerm(cb: (reqId: string, q: TermQuery) => void): Unsubscribe
    /** Schnell-Prompt (Strg+Alt+Leertaste): Text und gewählte Session (null = keine offen) */
    quickPrompt(cb: (text: string, sessionId: string | null) => void): Unsubscribe
    /** Wechsel zwischen Akku (true) und Netzteil (false) */
    power(cb: (onBattery: boolean) => void): Unsubscribe
  }
  vibe: {
    /** Wochenrückblick der letzten 7 Tage */
    week(): Promise<VibeWeek>
    /** eine Fokus-Runde ist geschafft */
    focusDone(): void
    /** Bereich des Fensters als Bild → Zwischenablage + Bilder\VibeDesk; liefert den Pfad */
    capture(rect: { x: number; y: number; width: number; height: number }): Promise<string | null>
  }
  quick: {
    /** globales Tastenkürzel an/aus – false, wenn es schon belegt ist */
    configure(enabled: boolean): Promise<boolean>
    /** Sessions zur Auswahl im Schnell-Prompt (oberste zuerst) */
    targets(list: { id: string; name: string; status: string }[]): void
    /** Eingabefeld sofort öffnen (z. B. aus der Befehls-Palette) */
    open(): void
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
  limits: {
    /** zuletzt gemeldete Abo-Limits (null = noch keine bzw. kein Abo) */
    get(): Promise<PlanLimits | null>
  }
  update: {
    status(): Promise<UpdateStatus>
    version(): Promise<string>
    check(): Promise<void>
    /** Update laden, wenn automatische Updates aus sind */
    download(): void
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
  spotify: {
    status(): Promise<SpotifyStatus>
    /** öffnet den Spotify-Login im Browser und wartet auf die Rückmeldung */
    connect(clientId: string): Promise<SpotifyStatus>
    cancel(): void
    disconnect(): Promise<void>
    player(): Promise<SpotifyPlayer | null>
    devices(): Promise<SpotifyDevice[]>
    playlists(): Promise<SpotifyPlaylist[]>
    playlistTracks(id: string): Promise<SpotifyTrack[]>
    liked(): Promise<SpotifyTrack[]>
    queue(): Promise<SpotifyQueue>
    search(q: string): Promise<{ tracks: SpotifyTrack[]; playlists: SpotifyPlaylist[] }>
    isLiked(uri: string): Promise<boolean>
    setLiked(uri: string, on: boolean): Promise<void>
    command(c: SpotifyCommand): Promise<void>
    openApp(): void
  }
  power: {
    /** läuft der Rechner gerade im Akkubetrieb? */
    onBattery(): Promise<boolean>
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
    /** lokale Branches */
    branches(projectId: string): Promise<string[]>
    /** Branch wechseln; create = neu anlegen */
    switchBranch(projectId: string, name: string, create: boolean): Promise<void>
    openWeb(url: string): void
  }
  /** Lebende Szenen (interaktive Hintergründe, die Claude als Skript schreibt) */
  living: {
    list(): Promise<LivingScene[]>
    delete(id: string): Promise<boolean>
    status(s: LivingStatus): void
    snapshotResult(req: string, data: string | null, error?: string): void
  }
  /** Session-Abschluss – immer im Arbeitsordner der Session (auch Worktrees) */
  wrapUp: {
    /** letzte Antwort von Claude aus dem Protokoll (nur Claudes Projekte-Ordner), sonst '' */
    summary(transcriptPath: string): Promise<string>
    changes(sessionId: string): Promise<WrapChanges>
    aiMessage(sessionId: string): Promise<string>
    /** nimmt alle Änderungen mit; liefert den kurzen Hash */
    commit(sessionId: string, message: string): Promise<string>
  }
  /** Merge Studio: parallele Sessions (Worktrees) vergleichen und sicher zusammenführen. Destruktives nur mit confirmed = true. */
  merge: {
    overview(projectId: string): Promise<MergeOverview | null>
    fileDiff(projectId: string, worktree: string, file: string): Promise<MergeFileView>
    create(projectId: string, name: string): Promise<{ path: string; branch: string }>
    commit(projectId: string, worktree: string, message: string): Promise<string>
    aiMessage(projectId: string, worktree: string): Promise<string>
    apply(projectId: string, worktree: string, files: string[], hunks: Record<string, number[]> | null, confirmed: boolean): Promise<ApplyResult>
    merge(projectId: string, branch: string, confirmed: boolean): Promise<MergeResult>
    abort(projectId: string, confirmed: boolean): Promise<void>
    finish(projectId: string): Promise<string>
    checkpoint(projectId: string, label: string): Promise<Checkpoint>
    checkpoints(projectId: string): Promise<Checkpoint[]>
    restore(projectId: string, ref: string, resetBranch: boolean, confirmed: boolean): Promise<Checkpoint>
    removeWorktree(projectId: string, worktree: string, force: boolean, confirmed: boolean): Promise<void>
    deleteBranch(projectId: string, branch: string, confirmed: boolean): Promise<void>
    review(projectId: string): Promise<ReviewResult>
    runTests(projectId: string, worktree: string, cmd: string): Promise<TestRun>
    stopTests(): void
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
    /** feedback: Rückmeldung zu einem Plan („Ändern …“), geht bei deny an Claude */
    answer(id: string, decision: PermissionDecision, feedback?: string): Promise<boolean>
  }
  companion: {
    /** internet = Internet-Link über Cloudflare (Handy von überall, ohne App) */
    configure(enabled: boolean, port: number, internet: boolean): Promise<CompanionStatus>
    /** Adressen neu ermitteln (z. B. nach einem WLAN-Wechsel) */
    status(): Promise<CompanionStatus>
    /** Einmal-Code zum Koppeln eines Handys (5 Minuten gültig) */
    startPairing(): Promise<CompanionPairing>
    cancelPairing(): void
    devices(): Promise<CompanionDevice[]>
    revoke(id: string): Promise<void>
    revokeAll(): Promise<void>
    cancelShutdown(): Promise<boolean>
    push(s: CompanionSnapshot): void
    promptDone(reqId: string, ok: boolean): void
    termDone(reqId: string, chunk: TermChunk | null): void
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
