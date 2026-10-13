import { app, BrowserWindow, Menu, net, protocol, shell } from 'electron'
import { pathToFileURL } from 'url'
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
import { OverlayServer } from './overlayServer'
import { basename } from 'path'
import { BrainService, registerBrainIpc } from './brainService'

if (process.env.VIBEDESK_USERDATA) app.setPath('userData', process.env.VIBEDESK_USERDATA)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
protocol.registerSchemesAsPrivileged([
  { scheme: SCENE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  { scheme: ADDON_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
])

let mainWindow: BrowserWindow | null = null
// Per Doppelklick geöffnete .vibeaddon-Datei, bis der Renderer sie abholt
let pendingAddon: string | null = addonPathFromArgv(process.argv)

// Nur eine Instanz: ein zweites "vibe" holt das bestehende Fenster nach vorne
// Ohne feste App-ID zeigt Windows keine Benachrichtigungen (im Installer setzt electron-builder dieselbe)
if (process.platform === 'win32') app.setAppUserModelId('dev.vibedesk.app')

if (!app.requestSingleInstanceLock()) app.quit()
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
      sandbox: false,
      contextIsolation: true,
      webviewTag: true
    }
  })
  win.once('ready-to-show', () => win.show())
  // Externe Links nie im App-Fenster öffnen
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env['ELECTRON_RENDERER_URL']) win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

const send = (ch: string, ...args: unknown[]): void => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(ch, ...args)
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  if (app.isPackaged) registerRunAlias(process.execPath)
  ipcMain.handle('app:claudeInstalled', () => !!process.env.VIBEDESK_CLAUDE_CMD || claudeOnPath())
  ipcMain.handle('setup:check', () => checkTools())
  ipcMain.handle('setup:install', (_e, tool: string) => {
    if (tool !== 'node' && tool !== 'claude') return false
    return installTool(tool, (line) => send('setup:log', tool, line))
  })
  ipcMain.on('setup:openDownload', (_e, tool: string) => shell.openExternal(tool === 'node' ? NODE_DOWNLOAD_URL : CLAUDE_DOCS_URL))
  ipcMain.handle('app:claudeVersion', () => claudeVersion())
  const userData = app.getPath('userData')
  const settings = new SettingsStore(join(userData, 'settings.json'), DEFAULT_SETTINGS(app.getPath('documents')))
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
  ipcMain.handle('stats:history', () => statsHistory.lastDays(7, localDate(Date.now())))
  ipcMain.on('app:openExternal', (_e, url: string) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
  })
  const brain = new BrainService({
    activityDir: join(userData, 'brain'),
    project: (id) => projects.get(id),
    projectOfSession: (sid) => {
      const info = sessions.list().find((s) => s.id === sid)
      return info ? projects.get(info.projectId) : undefined
    },
    enabled: () => settings.get().brainOn,
    emit: (ch, payload) => send(ch, payload)
  })
  registerBrainIpc(brain)
  const hookServer = new HookServer(
    token,
    (e) => {
      send('hook:event', e)
      stats.onHook(e)
      brain.onHook(e)
      if (e.name === 'SessionStart') return brain.sessionStartOutput(e.sessionId)
    },
    (sid, tool, args) => brain.tool(sid, tool, args)
  )
  const port = await hookServer.start()
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
    brain: { mcpPath: resource('brain-mcp.js'), enabled: () => settings.get().brainOn }
  })
  sessions.on('data', (id, d) => send('session:data', id, d))
  sessions.on('exit', (id, code) => {
    stats.flush(id)
    stats.remove(id)
    send('session:exit', id, code)
  })
  registerSessionIpc({ sessions, projects, claudeProjectsDir: join(os.homedir(), '.claude', 'projects') })
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

  setupUpdater((s) => send('update:status', s))
  mainWindow = createWindow()
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
