import { app, BrowserWindow, dialog, Menu, net, protocol, session, shell } from 'electron'
import { pathToFileURL } from 'url'
import { errorLogFile, installErrorLog, logError, registerErrorIpc } from './errorLog'
import '../shared/i18n/en'
import { resolveLang, setLang, t } from '../shared/i18n'
import { registerSceneIpc, SCENE_SCHEME, sceneFile } from './scenes'
import { ADDON_SCHEME, addonPathFromArgv, AddonStore } from './addonStore'
import { registerAddonIpc } from './addonIpc'
import { sniffAsset } from '../shared/addonValidate'
import fs from 'fs'
import { join } from 'path'
import { ProjectStore } from './projectStore'
import { DEFAULT_SETTINGS, SettingsStore } from './settingsStore'
import { registerCoreIpc, registerFileIpc, registerNotesIpc, registerSessionIpc, registerSkillIpc } from './ipc'
import { FileService, FileWatcher } from './fileService'
import { CLAUDE_DOCS_URL, checkTools, installTool, NODE_DOWNLOAD_URL } from './toolSetup'
import { NotesStore } from './notesStore'
import { DiscordRpc, fetchAppInfo, type DiscordStatus } from './discord/rpc'
import { postWebhook, shouldSend, type WebhookKind } from './discord/webhook'
import { setupUpdater } from './updater'
import { showInstallBridge, SplashWindow } from './splashWindow'
import { createSplashGate, splashView } from './splashGate'
import { SkillStore } from './skillStore'
import { localDate, StatsHistory, StatsService } from './statsService'
import os from 'os'
import { registerRunAlias } from './runAlias'
import { claudeOnPath, claudeVersion } from './sessionManager'
import { ipcMain, powerMonitor } from 'electron'
import { randomBytes } from 'crypto'
import * as pty from '@lydell/node-pty'
import { HookServer } from './hookServer'
import { SessionManager } from './sessionManager'
import { OutputBatcher } from './outputBatcher'
import { OverlayServer } from './overlayServer'
import { basename } from 'path'
import { BrainService, projectOfDir, registerBrainIpc } from './brainService'
import { ExternalSessions } from './externalSessions'
import { ShellManager } from './shellManager'
import { registerTerminalIpc } from './terminalIpc'
import type { SessionInfo } from '../shared/types'
import { writeJsonAtomic } from './jsonFile'
import { GitService } from './gitService'
import { registerGitIpc } from './gitIpc'
import { registerSpotifyIpc, SpotifyService } from './spotify'
import { PermissionBroker } from './permissionBroker'
import { setupCompanion } from './companionIpc'
import { QuickPrompt, type QuickTarget } from './quickPrompt'
import { VibeLog } from './vibeLog'
import { captureCard } from './vibeCapture'

if (process.env.VIBEDESK_USERDATA) app.setPath('userData', process.env.VIBEDESK_USERDATA)
installErrorLog(app.getPath('userData'))
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
protocol.registerSchemesAsPrivileged([
  { scheme: SCENE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  { scheme: ADDON_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
])

let mainWindow: BrowserWindow | null = null
// Update-Fensterchen beim Start – nur in der installierten App (oder VIBEDESK_SPLASH=1 zum Ausprobieren)
let splash: SplashWindow | null = null
// Per Doppelklick geöffnete .vibeaddon-Datei, bis der Renderer sie abholt
let pendingAddon: string | null = addonPathFromArgv(process.argv)

// Nur eine Instanz: ein zweites "vibe" holt das bestehende Fenster nach vorne
// Ohne feste App-ID zeigt Windows keine Benachrichtigungen (im Installer setzt electron-builder dieselbe)
if (process.platform === 'win32') app.setAppUserModelId('dev.vibedesk.app')

// Eine zweite Instanz darf nichts starten – sie würde endpoint.json mit ihrem Port überschreiben und Hooks/Gehirn kappen
const primary = app.requestSingleInstanceLock()
if (!primary) app.exit(0)
app.on('second-instance', (_e, argv) => {
  const addon = addonPathFromArgv(argv)
  if (addon) {
    if (mainWindow) send('addon:open', addon)
    else pendingAddon = addon
  }
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    frame: false,
    fullscreen: !process.env.VIBEDESK_WINDOWED,
    width: 1440,
    height: 900,
    backgroundColor: '#07090d',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      webviewTag: true
    }
  })
  // Mit Update-Fensterchen entscheidet das Gate, wann das Hauptfenster erscheint
  if (!splash) win.once('ready-to-show', () => win.show())
  // Externe Links nie im App-Fenster öffnen
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  // Das Hauptfenster navigiert nie weg – sonst bekäme eine hineingezogene Seite oder ein Link das Preload samt window.api
  const page = (u: string): string => u.replace(/[?#].*$/, '')
  const stay = (ev: Electron.Event, url: string): void => {
    // Neuladen der eigenen Seite (Sprachwechsel, Strg+R) ist erlaubt
    if (page(url) === page(win.webContents.getURL())) return
    ev.preventDefault()
    if (/^https?:/.test(url)) shell.openExternal(url)
  }
  win.webContents.on('will-navigate', stay)
  // Abgestürzter Renderer: neu laden statt leeres Vollbild – die Sessions in Main laufen weiter und werden wieder angehängt
  win.webContents.on('render-process-gone', (_e, d) => {
    logError('Renderer', d.reason)
    if (d.reason !== 'clean-exit' && !win.isDestroyed()) win.reload()
  })
  win.on('unresponsive', () => logError('Renderer', 'reagiert nicht'))
  win.webContents.on('will-redirect', stay)
  if (process.env['ELECTRON_RENDERER_URL']) win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

const send = (ch: string, ...args: unknown[]): void => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(ch, ...args)
}

let gate: ReturnType<typeof createSplashGate> | null = null

app.whenReady().then(async () => {
  if (!primary) return
  Menu.setApplicationMenu(null)
  // Sprache vor dem ersten sichtbaren Fenster festlegen – auch das Update-Fensterchen spricht sie
  const userData = app.getPath('userData')
  const settings = new SettingsStore(join(userData, 'settings.json'), DEFAULT_SETTINGS(app.getPath('documents')))
  setLang(resolveLang(settings.get().language, app.getLocale()))
  if (app.isPackaged || process.env.VIBEDESK_SPLASH) splash = new SplashWindow()
  if (app.isPackaged) registerRunAlias(process.execPath)
  ipcMain.handle('app:claudeInstalled', () => !!process.env.VIBEDESK_CLAUDE_CMD || claudeOnPath())
  ipcMain.handle('setup:check', () => checkTools())
  ipcMain.handle('setup:install', (_e, tool: string) => {
    if (tool !== 'node' && tool !== 'claude') return false
    return installTool(tool, (line) => send('setup:log', tool, line))
  })
  ipcMain.on('setup:openDownload', (_e, tool: string) => shell.openExternal(tool === 'node' ? NODE_DOWNLOAD_URL : CLAUDE_DOCS_URL))
  ipcMain.handle('app:claudeVersion', () => claudeVersion())
  registerErrorIpc(claudeVersion)
  const projects = new ProjectStore(
    join(userData, 'projects.json'),
    () => process.env.VIBEDESK_PROJECTS_DIR || settings.get().projectsDir,
    (p) => shell.trashItem(p)
  )
  registerCoreIpc({ win: () => mainWindow, projects, settings })
  const scenesDir = join(userData, 'scenes')
  protocol.handle(SCENE_SCHEME, async (req) => {
    const f = sceneFile(scenesDir, req.url)
    if (!f) return new Response('not found', { status: 404 })
    const res = await net.fetch(pathToFileURL(f).toString())
    return new Response(res.body, { status: res.status, headers: { 'content-type': res.headers.get('content-type') ?? 'image/*', 'access-control-allow-origin': '*' } })
  })
  registerSceneIpc(scenesDir)

  const addons = new AddonStore(join(userData, 'addons'))
  protocol.handle(ADDON_SCHEME, (req) => {
    const f = addons.assetFile(req.url)
    if (!f || !fs.existsSync(f)) return new Response('not found', { status: 404 })
    const data = fs.readFileSync(f)
    const type = sniffAsset(data)?.mime ?? 'application/octet-stream'
    return new Response(data, { headers: { 'content-type': type, 'access-control-allow-origin': '*' } })
  })
  registerAddonIpc(addons, () => mainWindow, () => {
    const p = pendingAddon
    pendingAddon = null
    return p
  })

  const token = randomBytes(24).toString('hex')
  const statsHistory = new StatsHistory(join(userData, 'stats.json'))
  const stats = new StatsService({ history: statsHistory, emit: (s) => send('stats:update', s) })
  ipcMain.handle('stats:history', () => statsHistory.lastDays(30, localDate(Date.now())))
  // Energiesparen: Akku/Netz an den Renderer melden (Regen-Hintergrund drosselt im Akkubetrieb)
  ipcMain.handle('power:onBattery', () => powerMonitor.isOnBatteryPower())
  powerMonitor.on('on-battery', () => send('power:battery', true))
  powerMonitor.on('on-ac', () => send('power:battery', false))
  // Wochenrückblick „Vibe Wrapped“
  const vibe = new VibeLog(join(userData, 'vibe.json'))
  // Sessions aus einem früheren App-Start (z. B. vor einem Update) – der Inspector zeigt sie weiter an
  const externals = new ExternalSessions({
    known: (sid) => sessions.list().some((s) => s.id === sid),
    projectOfDir: (dir) => projectOfDir(projects.list(), dir),
    added: (info) => send('session:external', info),
    ended: (sid) => send('session:externalEnd', sid)
  })
  ipcMain.handle('sessions:externals', () => externals.list())
  const sessionInfo = (sid: string): SessionInfo | undefined => sessions.list().find((s) => s.id === sid) ?? externals.get(sid)
  const projectNameOf = (sid: string): string | undefined => {
    const info = sessionInfo(sid)
    return info ? projects.get(info.projectId)?.name : undefined
  }
  ipcMain.handle('vibe:week', () => {
    const w = vibe.week()
    return { ...w, learned: brain.learnedSince(new Date(w.from + 'T00:00:00').getTime()) }
  })
  ipcMain.on('vibe:focusDone', () => vibe.focusDone())
  ipcMain.handle('vibe:capture', (_e, r: unknown) => captureCard(mainWindow, r, process.env.VIBEDESK_PICTURES_DIR || app.getPath('pictures')))
  app.on('before-quit', () => {
    // ein Fehler hier darf das übrige Aufräumen (Sessions, Gehirn, Server) nicht abbrechen
    try {
      vibe.flush()
    } catch (e) {
      logError('vibe.flush', e)
    }
  })
  ipcMain.on('app:openExternal', (_e, url: string) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
  })
  const brain = new BrainService({
    activityDir: join(userData, 'brain'),
    meDir: join(userData, 'me'),
    project: (id) => projects.get(id),
    projectOfSession: (sid) => {
      const info = sessionInfo(sid)
      return info ? projects.get(info.projectId) : undefined
    },
    projectOfDir: (dir) => projectOfDir(projects.list(), dir),
    enabled: () => settings.get().brainOn,
    emit: (ch, payload) => send(ch, payload)
  })
  registerBrainIpc(brain)
  registerSpotifyIpc(new SpotifyService(join(userData, 'spotify.json')))
  registerGitIpc(
    new GitService({ claudeCmd: () => process.env.VIBEDESK_CLAUDE_CMD || 'claude', trash: (p) => shell.trashItem(p) }),
    projects,
    () => mainWindow
  )
  // Freigaben: Karte in VibeDesk und Handy-Begleiter beantworten, was Claude sonst im Terminal fragt
  const broker = new PermissionBroker({
    enabled: () => settings.get().approvalsOn,
    emit: (list) => {
      send('permissions:list', list)
      companion.hub.touch()
    }
  })
  const companion = setupCompanion({
    settings,
    broker,
    send,
    claudeCmd: () => process.env.VIBEDESK_CLAUDE_CMD || 'claude',
    tmpDir: join(app.getPath('temp'), 'vibedesk', 'companion'),
    // Claude Code legt Transkripte unter CLAUDE_CONFIG_DIR bzw. ~/.claude ab – nur dort darf gelesen werden
    transcriptsDir: join(process.env.CLAUDE_CONFIG_DIR || join(os.homedir(), '.claude'), 'projects'),
    devicesFile: join(userData, 'companion.json')
  })
  const hookServer = new HookServer(
    token,
    (e) => {
      // Gehirn-Autopflege: Claude macht nach diesem Stop noch kurz weiter – für Anzeige und Handy ist die Runde nicht fertig
      externals.observe(e)
      const tend = e.name === 'Stop' ? brain.stopOutput(e) : undefined
      const shown = tend ? { ...e, name: 'BrainTend' } : e
      send('hook:event', shown)
      stats.onHook(e)
      vibe.record(e, projectNameOf(e.sessionId))
      brain.onHook(e)
      broker.onHook(e)
      companion.hub.onHook(shown)
      if (tend) return tend
      if (e.name === 'SessionStart') return brain.sessionStartOutput(e.sessionId)
    },
    (sid, tool, args, cwd) => brain.tool(sid, tool, args, cwd),
    (e) => broker.ask(e.sessionId, e.payload)
  )
  const port = await hookServer.start()
  // Laufende Sessions überleben einen Neustart der App (Update) – über diese Datei finden sie die neue wieder
  const endpointFile = join(userData, 'endpoint.json')
  writeJsonAtomic(endpointFile, { port, token })
  const resource = (f: string): string => (app.isPackaged ? join(process.resourcesPath, f) : join(app.getAppPath(), 'resources', f))
  const forwarderPath = resource('hook-forwarder.js')
  const sessions = new SessionManager({
    spawn: (file, args, o) => pty.spawn(file, args, { name: 'xterm-256color', ...o }),
    tmpDir: join(app.getPath('temp'), 'vibedesk'),
    nodeExe: 'node',
    forwarderPath,
    port: () => port,
    token,
    maxSessions: () => settings.get().maxSessions,
    brain: { mcpPath: resource('brain-mcp.js'), enabled: () => settings.get().brainOn },
    endpointFile
  })
  const output = new OutputBatcher((id, d) => send('session:data', id, d))
  sessions.on('data', (id, d) => output.push(id, d))
  sessions.on('exit', (id, code) => {
    output.flush(id)
    stats.flush(id)
    stats.remove(id)
    broker.dropSession(id)
    send('session:exit', id, code)
  })
  registerSessionIpc({ sessions, projects, claudeProjectsDir: join(process.env.CLAUDE_CONFIG_DIR || join(os.homedir(), '.claude'), 'projects') })
  // Eigene Shells neben Claude – gleiche Bündelung der Ausgabe, eigene Kanäle
  const shells = new ShellManager({ spawn: (file, args, o) => pty.spawn(file, args, { name: 'xterm-256color', ...o }), kind: () => settings.get().terminal.shell })
  const shellOutput = new OutputBatcher((id, d) => send('shell:data', id, d))
  shells.on('data', (id, d) => shellOutput.push(id, d))
  shells.on('exit', (id, code) => {
    shellOutput.flush(id)
    send('shell:exit', id, code)
  })
  registerTerminalIpc({ shells, projects, pasteDir: join(app.getPath('temp'), 'vibedesk', 'paste') })
  app.on('before-quit', () => shells.stopAll())
  const skills = new SkillStore(
    process.env.VIBEDESK_SKILLS_DIR || join(os.homedir(), '.claude', 'skills'),
    (id) => {
      const p = projects.get(id)
      return p ? join(p.path, '.claude', 'skills') : undefined
    },
    (p) => shell.trashItem(p)
  )
  registerSkillIpc({ skills, projects })
  registerNotesIpc(new NotesStore(join(userData, 'notes')))
  const fileWatcher = new FileWatcher((c) => send('files:change', c))
  registerFileIpc(new FileService(() => projects.list().filter((p) => !p.missing).map((p) => p.path)), fileWatcher)
  app.on('before-quit', () => fileWatcher.closeAll())

  // Schnell-Prompt von überall (Strg+Alt+Leertaste)
  const quick = new QuickPrompt((text, sessionId) => send('quick:prompt', text, sessionId))
  ipcMain.handle('quick:configure', (_e, enabled: unknown) => quick.configure(enabled === true))
  ipcMain.on('quick:targets', (_e, list: unknown) => {
    if (!Array.isArray(list)) return
    quick.setTargets(
      list
        .filter((x): x is QuickTarget => !!x && typeof x.id === 'string' && typeof x.name === 'string' && typeof x.status === 'string')
        .map((x) => ({ id: x.id.slice(0, 80), name: x.name.slice(0, 80), status: x.status.slice(0, 20) }))
    )
  })
  ipcMain.on('quick:open', () => quick.toggle())
  app.on('will-quit', () => quick.dispose())

  let discordStatus: DiscordStatus = { state: 'off' }
  const discord = new DiscordRpc((st) => {
    discordStatus = st
    send('discord:status', st)
  })
  ipcMain.on('discord:configure', (_e, enabled: boolean, clientId: string) => discord.configure(enabled, clientId))
  ipcMain.on('discord:setActivity', (_e, a) => discord.setActivity(a))
  ipcMain.handle('discord:status', () => discordStatus)
  ipcMain.handle('discord:appInfo', (_e, clientId: string) => fetchAppInfo(clientId))
  // „weg“ = VibeDesk nicht im Vordergrund oder 2 Minuten keine Eingabe
  const away = (): boolean => !mainWindow?.isFocused() || powerMonitor.getSystemIdleTime() >= 120
  ipcMain.handle('discord:webhook', async (_e, kind: WebhookKind, body: unknown) => {
    const hook = settings.get().discordHook
    if (!shouldSend(kind, hook, away)) return { ok: false, skipped: true }
    return postWebhook(hook.url, body)
  })
  const dc = settings.get().discord
  discord.configure(dc.enabled, dc.clientId)
  app.on('before-quit', () => discord.shutdown())
  app.on('before-quit', () => {
    broker.dropAll()
    void companion.stop()
    brain.flushAll()
    sessions.stopAll()
    hookServer.stop()
  })
  // Streamer-Modus: OBS-Overlay (nur localhost) + Benutzername fürs Schwärzen von Pfaden
  const overlay = new OverlayServer(() => settings.get().streamer.overlayToken)
  ipcMain.handle('streamer:configure', async (_e, enabled: boolean, port: number) => {
    if (!enabled) {
      await overlay.stop()
      return overlay.status
    }
    const p = Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : 17345
    return overlay.start(p)
  })
  ipcMain.on('streamer:push', (_e, state: unknown) => overlay.push(state))
  ipcMain.handle('streamer:user', () => basename(os.homedir()))
  app.on('before-quit', () => void overlay.stop())

  const bridgeScript = resource('update-splash.ps1')
  setupUpdater(
    (s) => {
      send('update:status', s)
      if (splash?.open) splash.set(splashView(s))
      gate?.feed(s)
    },
    {
      checkNow: !!splash,
      beforeInstall: async (version) => {
        // Fensterchen zeigen, Brücke für die Installer-Pause starten, dann erst beenden
        if (!splash?.open) splash = new SplashWindow()
        splash.set({ text: version ? t('Installiere Update {version} …', { version }) : t('Installiere Update …'), percent: null })
        // erst beenden, wenn das Brücken-Fensterchen steht – sonst gibt es eine Lücke ohne Fenster
        await showInstallBridge(bridgeScript, version)
      }
    }
  )
  mainWindow = createWindow()
  if (splash) {
    const win = mainWindow
    let ready = false
    let released = false
    const reveal = (): void => {
      if (!ready || !released || win.isDestroyed()) return
      win.show()
      splash?.close()
    }
    win.once('ready-to-show', () => {
      ready = true
      reveal()
    })
    gate = createSplashGate(() => {
      released = true
      reveal()
    })
  }
}).catch((e) => {
  // Startfehler nie als unsichtbar hängende App enden lassen
  logError('Start', e)
  dialog.showErrorBox(t('VibeDesk konnte nicht starten'), `${e instanceof Error ? e.message : String(e)}\n\n${t('Details stehen in {file}', { file: errorLogFile() })}`)
  app.exit(1)
})

// Seiten in der Vorschau bekommen keine Kamera, kein Mikrofon, keinen Standort usw. – nur Vollbild und Zwischenablage-Schreiben
const PREVIEW_ALLOWED = new Set(['fullscreen', 'clipboard-sanitized-write'])
app.whenReady().then(() => {
  const preview = session.fromPartition('persist:vibedesk-preview')
  preview.setPermissionRequestHandler((_wc, permission, cb) => cb(PREVIEW_ALLOWED.has(permission)))
  preview.setPermissionCheckHandler((_wc, permission) => PREVIEW_ALLOWED.has(permission))
})

// Vorschau-Webviews absichern: kein Node, keine Preloads, Popups im System-Browser, nur http(s)
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (_ev, prefs, params) => {
    delete (prefs as { preload?: string }).preload
    prefs.nodeIntegration = false
    prefs.contextIsolation = true
    if (!/^https?:/.test(params.src)) _ev.preventDefault()
  })
  if (contents.getType() !== 'webview') return
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (ev, url) => {
    if (!/^https?:/.test(url)) ev.preventDefault()
  })
})

app.on('window-all-closed', () => app.quit())
