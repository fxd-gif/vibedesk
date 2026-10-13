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
    setupLog: (cb) => listen<[ToolId, string]>('setup:log', cb),
    addonOpen: (cb) => listen<[string]>('addon:open', cb)
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
    appInfo: (clientId) => ipcRenderer.invoke('discord:appInfo', clientId),
    webhook: (kind, body) => ipcRenderer.invoke('discord:webhook', kind, body)
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
    reveal: (p) => ipcRenderer.send('files:reveal', p),
    create: (parent, name, kind) => ipcRenderer.invoke('files:create', parent, name, kind),
    rename: (p, name) => ipcRenderer.invoke('files:rename', p, name),
    trash: (p) => ipcRenderer.invoke('files:trash', p)
  },
  addons: {
    list: () => ipcRenderer.invoke('addons:list'),
    inspect: (src) => ipcRenderer.invoke('addons:inspect', src),
    install: (src) => ipcRenderer.invoke('addons:install', src),
    remove: (id) => ipcRenderer.invoke('addons:remove', id),
    setEnabled: (id, on) => ipcRenderer.invoke('addons:setEnabled', id, on),
    saveDraft: (p) => ipcRenderer.invoke('addons:saveDraft', p),
    exportTo: (id) => ipcRenderer.invoke('addons:exportTo', id),
    pickFile: () => ipcRenderer.invoke('addons:pickFile'),
    takePending: () => ipcRenderer.invoke('addons:takePending'),
    getState: (id) => ipcRenderer.invoke('addons:getState', id),
    setState: (id, data) => ipcRenderer.invoke('addons:setState', id, data)
  },
  scenes: {
    addCustom: (p) => ipcRenderer.invoke('scenes:addCustom', p)
  },
  skills: {
    list: () => ipcRenderer.invoke('skills:list'),
    importPaths: (paths) => ipcRenderer.invoke('skills:importPaths', paths),
    importGithub: (url) => ipcRenderer.invoke('skills:importGithub', url),
    install: (tokens, target, replace) => ipcRenderer.invoke('skills:install', tokens, target, replace),
    remove: (dir) => ipcRenderer.invoke('skills:remove', dir),
    exportCode: (dir, from) => ipcRenderer.invoke('skills:exportCode', dir, from),
    importCode: (code) => ipcRenderer.invoke('skills:importCode', code)
  },
  streamer: {
    configure: (enabled, port) => ipcRenderer.invoke('streamer:configure', enabled, port),
    push: (state) => ipcRenderer.send('streamer:push', state),
    user: () => ipcRenderer.invoke('streamer:user')
  },
  clipboard: {
    write: (text) => ipcRenderer.send('clipboard:write', String(text)),
    read: () => ipcRenderer.invoke('clipboard:read')
  }
}

contextBridge.exposeInMainWorld('vibedesk', api)
