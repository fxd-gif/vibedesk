import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { DiscordStatus, FileChange, HookEvent, SessionInfo, ToolId, SessionStats, UpdateStatus, VibedeskApi } from '../shared/types'
import type { BudgetAlert, BudgetUse } from '../shared/budget'
import type { BrainPulse } from '../shared/brain'
import type { PermissionAsk } from '../shared/permissions'
import type { CompanionDevice, CompanionStatus, PromptTarget, TermQuery } from '../shared/companion'
import type { PlanLimits } from '../shared/limits'
import type { DeskCommand } from '../shared/desk'
import type { SessionHandoff } from '../shared/handoff'
import type { LivingScene } from '../shared/living'

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
    claudeVersion: () => ipcRenderer.invoke('app:claudeVersion'),
    notify: (id, title, body) => ipcRenderer.send('app:notify', id, title, body),
    logError: (where, msg) => ipcRenderer.send('app:logError', where, msg),
    reportBug: (summary) => ipcRenderer.send('app:reportBug', summary),
    openLog: () => ipcRenderer.send('app:openLog'),
    info: () => ipcRenderer.invoke('app:info'),
    diagnostics: () => ipcRenderer.invoke('app:diagnostics'),
    keepAwake: (on) => ipcRenderer.send('app:keepAwake', on),
    dictate: () => ipcRenderer.invoke('app:dictate'),
    metrics: () => ipcRenderer.invoke('app:metrics')
  },
  sessions: {
    start: (projectId, resumeId, cwd) => ipcRenderer.invoke('sessions:start', projectId, resumeId, cwd),
    stop: (id) => ipcRenderer.invoke('sessions:stop', id),
    write: (id, data) => ipcRenderer.send('sessions:write', id, data),
    devScript: (id) => ipcRenderer.invoke('sessions:devScript', id),
    resize: (id, cols, rows) => ipcRenderer.send('sessions:resize', id, cols, rows),
    list: () => ipcRenderer.invoke('sessions:list'),
    externals: () => ipcRenderer.invoke('sessions:externals')
  },
  shells: {
    start: (projectId, attachedTo) => ipcRenderer.invoke('shells:start', projectId, attachedTo),
    stop: (id) => ipcRenderer.invoke('shells:stop', id),
    write: (id, data) => ipcRenderer.send('shells:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.send('shells:resize', id, cols, rows),
    list: () => ipcRenderer.invoke('shells:list')
  },
  terminal: {
    readClipboard: () => ipcRenderer.invoke('terminal:readClipboard'),
    writeClipboard: (text) => ipcRenderer.invoke('terminal:writeClipboard', text),
    filePath: (file) => webUtils.getPathForFile(file),
    pickFiles: (defaultPath) => ipcRenderer.invoke('terminal:pickFiles', defaultPath),
    snip: () => ipcRenderer.invoke('terminal:snip')
  },
  on: {
    sessionData: (cb) => listen<[string, string]>('session:data', cb),
    sessionExit: (cb) => listen<[string, number]>('session:exit', cb),
    sessionExternal: (cb) => listen<[SessionInfo]>('session:external', cb),
    sessionExternalEnd: (cb) => listen<[string]>('session:externalEnd', cb),
    shellData: (cb) => listen<[string, string]>('shell:data', cb),
    shellExit: (cb) => listen<[string, number]>('shell:exit', cb),
    hookEvent: (cb) => listen<[HookEvent]>('hook:event', cb),
    stats: (cb) => listen<[SessionStats]>('stats:update', cb),
    discordStatus: (cb) => listen<[DiscordStatus]>('discord:status', cb),
    update: (cb) => listen<[UpdateStatus]>('update:status', cb),
    fileChange: (cb) => listen<[FileChange]>('files:change', cb),
    setupLog: (cb) => listen<[ToolId, string]>('setup:log', cb),
    addonOpen: (cb) => listen<[string]>('addon:open', cb),
    notifyClick: (cb) => listen<[number]>('notify:click', cb),
    brainChanged: (cb) => listen<[string]>('brain:changed', cb),
    brainPulse: (cb) => listen<[BrainPulse]>('brain:pulse', cb),
    gitLoginCode: (cb) => listen<[string, string]>('git:loginCode', cb),
    gitInstallLog: (cb) => listen<['git' | 'gh', string]>('git:installLog', cb),
    mergeTestLog: (cb) => listen<[string]>('merge:testLog', cb),
    permissions: (cb) => listen<[PermissionAsk[]]>('permissions:list', cb),
    companionPrompt: (cb) => listen<[string, PromptTarget, string]>('companion:prompt', cb),
    companionDevices: (cb) => listen<[CompanionDevice[], CompanionDevice | undefined]>('companion:devices', cb),
    companionPower: (cb) => listen<['shutdown' | 'sleep' | 'cancel', number | null]>('companion:power', cb),
    companionStatus: (cb) => listen<[CompanionStatus]>('companion:status', cb),
    companionTerm: (cb) => listen<[string, TermQuery]>('companion:term', cb),
    limits: (cb) => listen<[PlanLimits]>('limits:update', cb),
    deskCommand: (cb) => listen<[DeskCommand]>('desk:command', cb),
    livingChanged: (cb) => listen<[LivingScene[]]>('living:changed', cb),
    livingSnapshot: (cb) => listen<[string]>('living:snapshot', cb),
    trayFocus: (cb) => listen<[string]>('tray:focus', cb),
    deskSessionPrompt: (cb) => listen<[string, string, string, SessionHandoff | null]>('desk:sessionPrompt', cb),
    budgetUsage: (cb) => listen<[BudgetUse[]]>('budget:usage', cb),
    budgetAlert: (cb) => listen<[BudgetAlert]>('budget:alert', cb),
    quickPrompt: (cb) => listen<[string, string | null]>('quick:prompt', cb),
    power: (cb) => listen<[boolean]>('power:battery', cb)
  },
  power: {
    onBattery: () => ipcRenderer.invoke('power:onBattery')
  },
  vibe: {
    week: () => ipcRenderer.invoke('vibe:week'),
    focusDone: () => ipcRenderer.send('vibe:focusDone'),
    capture: (rect) => ipcRenderer.invoke('vibe:capture', rect)
  },
  quick: {
    configure: (enabled) => ipcRenderer.invoke('quick:configure', enabled),
    targets: (list) => ipcRenderer.send('quick:targets', list),
    open: () => ipcRenderer.send('quick:open')
  },
  setup: {
    check: () => ipcRenderer.invoke('setup:check'),
    install: (tool) => ipcRenderer.invoke('setup:install', tool),
    openDownload: (tool) => ipcRenderer.send('setup:openDownload', tool)
  },
  limits: {
    get: () => ipcRenderer.invoke('limits:get')
  },
  update: {
    status: () => ipcRenderer.invoke('update:status'),
    version: () => ipcRenderer.invoke('update:version'),
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.send('update:download'),
    install: () => ipcRenderer.send('update:install')
  },
  discord: {
    configure: (enabled, clientId) => ipcRenderer.send('discord:configure', enabled, clientId),
    setActivity: (a) => ipcRenderer.send('discord:setActivity', a),
    status: () => ipcRenderer.invoke('discord:status'),
    appInfo: (clientId) => ipcRenderer.invoke('discord:appInfo', clientId),
    webhook: (kind, body) => ipcRenderer.invoke('discord:webhook', kind, body)
  },
  spotify: {
    status: () => ipcRenderer.invoke('spotify:status'),
    connect: (clientId) => ipcRenderer.invoke('spotify:connect', clientId),
    cancel: () => ipcRenderer.send('spotify:cancel'),
    disconnect: () => ipcRenderer.invoke('spotify:disconnect'),
    player: () => ipcRenderer.invoke('spotify:player'),
    devices: () => ipcRenderer.invoke('spotify:devices'),
    playlists: () => ipcRenderer.invoke('spotify:playlists'),
    playlistTracks: (id) => ipcRenderer.invoke('spotify:playlistTracks', id),
    liked: () => ipcRenderer.invoke('spotify:liked'),
    queue: () => ipcRenderer.invoke('spotify:queue'),
    search: (q) => ipcRenderer.invoke('spotify:search', q),
    isLiked: (uri) => ipcRenderer.invoke('spotify:isLiked', uri),
    setLiked: (uri, on) => ipcRenderer.invoke('spotify:setLiked', uri, on),
    command: (c) => ipcRenderer.invoke('spotify:command', c),
    openApp: () => ipcRenderer.send('spotify:openApp')
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
  git: {
    tools: () => ipcRenderer.invoke('git:tools'),
    install: (tool) => ipcRenderer.invoke('git:install', tool),
    login: () => ipcRenderer.invoke('git:login'),
    cancelLogin: () => ipcRenderer.send('git:cancelLogin'),
    status: (id) => ipcRenderer.invoke('git:status', id),
    diff: (id, file, staged, untracked) => ipcRenderer.invoke('git:diff', id, file, staged, untracked),
    stage: (id, paths) => ipcRenderer.invoke('git:stage', id, paths),
    stageAll: (id) => ipcRenderer.invoke('git:stageAll', id),
    unstage: (id, paths, unborn) => ipcRenderer.invoke('git:unstage', id, paths, unborn),
    discard: (id, files) => ipcRenderer.invoke('git:discard', id, files),
    commit: (id, message, all) => ipcRenderer.invoke('git:commit', id, message, all),
    log: (id) => ipcRenderer.invoke('git:log', id),
    branches: (id) => ipcRenderer.invoke('git:branches', id),
    switchBranch: (id, name, create) => ipcRenderer.invoke('git:switch', id, name, create),
    show: (id, hash) => ipcRenderer.invoke('git:show', id, hash),
    init: (id) => ipcRenderer.invoke('git:init', id),
    pull: (id) => ipcRenderer.invoke('git:pull', id),
    push: (id, hasUpstream) => ipcRenderer.invoke('git:push', id, hasUpstream),
    fetch: (id) => ipcRenderer.invoke('git:fetch', id),
    publish: (id, name, priv) => ipcRenderer.invoke('git:publish', id, name, priv),
    aiMessage: (id) => ipcRenderer.invoke('git:aiMessage', id),
    prInfo: (id) => ipcRenderer.invoke('git:prInfo', id),
    aiPr: (id) => ipcRenderer.invoke('git:aiPr', id),
    createPr: (id, o) => ipcRenderer.invoke('git:createPr', id, o),
    openWeb: (url) => ipcRenderer.send('git:openWeb', url)
  },
  living: {
    list: () => ipcRenderer.invoke('living:list'),
    delete: (id) => ipcRenderer.invoke('living:delete', id),
    status: (s) => ipcRenderer.send('living:status', s),
    snapshotResult: (req, data, error) => ipcRenderer.send('living:snapshotResult', req, data, error)
  },
  budget: {
    all: () => ipcRenderer.invoke('budget:all'),
    set: (id, b) => ipcRenderer.invoke('budget:set', id, b)
  },
  tray: {
    sessions: (list) => ipcRenderer.send('tray:sessions', list)
  },
  wrapUp: {
    summary: (transcript) => ipcRenderer.invoke('wrapup:summary', transcript),
    changes: (id) => ipcRenderer.invoke('wrapup:changes', id),
    aiMessage: (id) => ipcRenderer.invoke('wrapup:aiMessage', id),
    commit: (id, message) => ipcRenderer.invoke('wrapup:commit', id, message)
  },
  merge: {
    overview: (id) => ipcRenderer.invoke('merge:overview', id),
    fileDiff: (id, wt, file) => ipcRenderer.invoke('merge:fileDiff', id, wt, file),
    create: (id, name) => ipcRenderer.invoke('merge:create', id, name),
    commit: (id, wt, message) => ipcRenderer.invoke('merge:commit', id, wt, message),
    aiMessage: (id, wt) => ipcRenderer.invoke('merge:aiMessage', id, wt),
    apply: (id, wt, files, hunks, confirmed) => ipcRenderer.invoke('merge:apply', id, wt, files, hunks, confirmed),
    merge: (id, branch, confirmed) => ipcRenderer.invoke('merge:merge', id, branch, confirmed),
    abort: (id, confirmed) => ipcRenderer.invoke('merge:abort', id, confirmed),
    finish: (id) => ipcRenderer.invoke('merge:finish', id),
    checkpoint: (id, label) => ipcRenderer.invoke('merge:checkpoint', id, label),
    checkpoints: (id) => ipcRenderer.invoke('merge:checkpoints', id),
    restore: (id, ref, resetBranch, confirmed) => ipcRenderer.invoke('merge:restore', id, ref, resetBranch, confirmed),
    removeWorktree: (id, wt, force, confirmed) => ipcRenderer.invoke('merge:removeWorktree', id, wt, force, confirmed),
    deleteBranch: (id, branch, confirmed) => ipcRenderer.invoke('merge:deleteBranch', id, branch, confirmed),
    review: (id) => ipcRenderer.invoke('merge:review', id),
    runTests: (id, wt, cmd) => ipcRenderer.invoke('merge:runTests', id, wt, cmd),
    stopTests: () => ipcRenderer.send('merge:stopTests')
  },
  brain: {
    view: (projectId) => ipcRenderer.invoke('brain:view', projectId),
    note: (projectId, title) => ipcRenderer.invoke('brain:note', projectId, title),
    file: (projectId, file) => ipcRenderer.invoke('brain:file', projectId, file),
    write: (projectId, note, previousTitle) => ipcRenderer.invoke('brain:write', projectId, note, previousTitle),
    remove: (projectId, title) => ipcRenderer.invoke('brain:remove', projectId, title),
    reveal: (projectId) => ipcRenderer.invoke('brain:reveal', projectId),
    importable: (projectId) => ipcRenderer.invoke('brain:importable', projectId),
    importDocs: (projectId) => ipcRenderer.invoke('brain:import', projectId),
    hotspots: (projectId) => ipcRenderer.invoke('brain:hotspots', projectId)
  },
  openExternal: (url) => ipcRenderer.send('app:openExternal', url),
  preview: {
    saveShot: (dataUrl) => ipcRenderer.invoke('preview:saveShot', dataUrl)
  },
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
  music: {
    pickDir: () => ipcRenderer.invoke('music:pickDir'),
    scan: (dir) => ipcRenderer.invoke('music:scan', dir)
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
  permissions: {
    list: () => ipcRenderer.invoke('permissions:list'),
    answer: (id, decision, feedback) => ipcRenderer.invoke('permissions:answer', id, decision, feedback)
  },
  companion: {
    configure: (enabled, port, internet) => ipcRenderer.invoke('companion:configure', enabled, port, internet),
    status: () => ipcRenderer.invoke('companion:status'),
    startPairing: () => ipcRenderer.invoke('companion:startPairing'),
    cancelPairing: () => ipcRenderer.send('companion:cancelPairing'),
    devices: () => ipcRenderer.invoke('companion:devices'),
    revoke: (id) => ipcRenderer.invoke('companion:revoke', id),
    revokeAll: () => ipcRenderer.invoke('companion:revokeAll'),
    cancelShutdown: () => ipcRenderer.invoke('companion:cancelShutdown'),
    push: (s) => ipcRenderer.send('companion:push', s),
    promptDone: (reqId, ok) => ipcRenderer.send('companion:promptDone', reqId, ok),
    termDone: (reqId, chunk) => ipcRenderer.send('companion:termDone', reqId, chunk)
  },
  clipboard: {
    write: (text) => ipcRenderer.send('clipboard:write', String(text)),
    read: () => ipcRenderer.invoke('clipboard:read')
  }
}

contextBridge.exposeInMainWorld('vibedesk', api)
