import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { DiscordStatus, FileChange, HookEvent, ToolId, SessionStats, UpdateStatus, VibedeskApi } from '../shared/types'

function listen<A extends unknown[]>(channel: string, cb: (...args: A) => void): () => void {
  const h = (_e: unknown, ...args: unknown[]): void => cb(...(args as A))
  ipcRenderer.on(channel, h)
  return () => ipcRenderer.removeListener(channel, h)
}

const api: VibedeskApi = {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (p) => ipcRenderer.invoke('settings:set', p)
  },
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    create: (name) => ipcRenderer.invoke('projects:create', name),
    add: (dir) => ipcRenderer.invoke('projects:add', dir),
    remove: (id, trash) => ipcRenderer.invoke('projects:remove', id, trash)
  },
  fs: {
    suggestDirs: (prefix) => ipcRenderer.invoke('fs:suggestDirs', prefix),
    pathForFile: (file) => webUtils.getPathForFile(file)
  },
  app: {
    exitFullscreen: () => ipcRenderer.send('app:exitFullscreen'),
    toggleFullscreen: () => ipcRenderer.send('app:toggleFullscreen'),
    quit: () => ipcRenderer.send('app:quit'),
    claudeInstalled: () => ipcRenderer.invoke('app:claudeInstalled'),
    claudeVersion: () => ipcRenderer.invoke('app:claudeVersion')
  },
  sessions: {
    start: (projectId, resumeId) => ipcRenderer.invoke('sessions:start', projectId, resumeId),
    stop: (id) => ipcRenderer.invoke('sessions:stop', id),
    write: (id, data) => ipcRenderer.send('sessions:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.send('sessions:resize', id, cols, rows),
    list: () => ipcRenderer.invoke('sessions:list')
  },
  on: {
    sessionData: (cb) => listen<[string, string]>('session:data', cb),
    sessionExit: (cb) => listen<[string, number]>('session:exit', cb),
    hookEvent: (cb) => listen<[HookEvent]>('hook:event', cb),
    stats: (cb) => listen<[SessionStats]>('stats:update', cb),
    discordStatus: (cb) => listen<[DiscordStatus]>('discord:status', cb),
    update: (cb) => listen<[UpdateStatus]>('update:status', cb),
    fileChange: (cb) => listen<[FileChange]>('files:change', cb),
    setupLog: (cb) => listen<[ToolId, string]>('setup:log', cb)
  },
  setup: {
    check: () => ipcRenderer.invoke('setup:check'),
    install: (tool) => ipcRenderer.invoke('setup:install', tool),
    openDownload: (tool) => ipcRenderer.send('setup:openDownload', tool)
  },
  update: {
    status: () => ipcRenderer.invoke('update:status'),
    version: () => ipcRenderer.invoke('update:version'),
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.send('update:install')
  },
  discord: {
    configure: (enabled, clientId) => ipcRenderer.send('discord:configure', enabled, clientId),
    setActivity: (a) => ipcRenderer.send('discord:setActivity', a),
    status: () => ipcRenderer.invoke('discord:status'),
    appInfo: (clientId) => ipcRenderer.invoke('discord:appInfo', clientId)
  },
  stats: {
    history: () => ipcRenderer.invoke('stats:history')
  },
  history: {
    list: (projectId) => ipcRenderer.invoke('history:list', projectId)
  },
  notes: {
    get: (projectId) => ipcRenderer.invoke('notes:get', projectId),
    set: (projectId, text) => ipcRenderer.invoke('notes:set', projectId, text)
  },
  openExternal: (url) => ipcRenderer.send('app:openExternal', url),
  files: {
    list: (dir) => ipcRenderer.invoke('files:list', dir),
    read: (p) => ipcRenderer.invoke('files:read', p),
    write: (p, text, expectedMtime, eol, bom) => ipcRenderer.invoke('files:write', p, text, expectedMtime, eol, bom),
    watch: (p) => ipcRenderer.send('files:watch', p),
    unwatch: (p) => ipcRenderer.send('files:unwatch', p),
    reveal: (p) => ipcRenderer.send('files:reveal', p)
  },
  scenes: {
    addCustom: (p) => ipcRenderer.invoke('scenes:addCustom', p)
  },
  skills: {
    list: () => ipcRenderer.invoke('skills:list'),
    importPaths: (paths) => ipcRenderer.invoke('skills:importPaths', paths),
    importGithub: (url) => ipcRenderer.invoke('skills:importGithub', url),
    install: (tokens, target, replace) => ipcRenderer.invoke('skills:install', tokens, target, replace),
    remove: (dir) => ipcRenderer.invoke('skills:remove', dir)
  }
}

contextBridge.exposeInMainWorld('vibedesk', api)
