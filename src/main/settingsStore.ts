import path from 'path'
import type { Settings } from '../shared/types'
import { DEFAULT_PRESENCE } from '../shared/presence'
import { DEFAULT_WEBHOOK } from '../shared/webhook'
import { readJson, writeJsonAtomic } from './jsonFile'

export const DEFAULT_STREAM_URL = 'https://stream.laut.fm/lofi'

export const DEFAULT_SETTINGS = (docsDir: string): Settings => ({
  projectsDir: path.join(docsDir, 'Projekte'),
  streamUrl: DEFAULT_STREAM_URL,
  musicOn: true,
  musicVolume: 0.5,
  rainSoundOn: true,
  rainSoundVolume: 0.35,
  rainIntensity: 0.6,
  blur: 0.6,
  scene: 'city',
  customScenes: [],
  visiblePanels: [],
  windowRects: {},
  maxSessions: 3,
  chimeOn: true,
  chimeVolume: 0.5,
  prompts: [
    { id: 'tests', title: 'Tests schreiben', text: 'Schreib aussagekräftige Tests für die zuletzt geänderten Dateien und lass sie laufen. Repariere, was rot ist.' },
    { id: 'review', title: 'Code-Review', text: 'Mach ein kritisches Code-Review der aktuellen Änderungen (git diff): Bugs, Randfälle, Sicherheit, Lesbarkeit. Nenne konkrete Stellen.' },
    { id: 'explain', title: 'Erkläre den Code', text: 'Erkläre mir knapp, wie dieses Projekt aufgebaut ist: wichtigste Dateien, Datenfluss, Einstiegspunkte.' },
    { id: 'commit', title: 'Commit vorbereiten', text: 'Prüfe die Änderungen, lass die Tests laufen und erstelle einen sauberen Commit mit aussagekräftiger Nachricht.' },
    { id: 'plan', title: 'Plan zuerst', text: 'Bevor du etwas änderst: Erstelle einen kurzen Plan mit den Schritten und Dateien, die du anfassen willst, und warte auf mein OK.' }
  ],
  focus: { work: 25, short: 5, long: 15, rounds: 4 },
  discord: DEFAULT_PRESENCE,
  discordHook: DEFAULT_WEBHOOK,
  onboarded: false,
  editorTabs: {},
  lastSeenVersion: '',
  lounge: { name: '', emoji: '🦊', showProject: false, lastRoom: '' },
  streamer: {
    enabled: false,
    hidePaths: true,
    maskEmails: true,
    hideNotes: true,
    protectFiles: true,
    overlayCost: false,
    overlayBash: false,
    overlayPort: 17345,
    overlayToken: '',
    twitchChannel: '',
    chatCommand: '!vibe',
    chatModsOnly: false
  },
  notify: { toasts: true, windows: true, focusQuiet: true, kinds: { waiting: true, done: true, error: true } },
  dockAll: false,
  brainOn: true
})

export class SettingsStore {
  private value: Settings

  constructor(
    private file: string,
    defaults: Settings
  ) {
    const stored = readJson<Partial<Settings>>(file, {})
    this.value = { ...defaults, ...(stored && typeof stored === 'object' ? stored : {}) }
    // verschachtelte Objekte um neue Felder ergänzen
    this.value.discord = { ...defaults.discord, ...(this.value.discord ?? {}) }
    this.value.discordHook = { ...defaults.discordHook, ...(this.value.discordHook ?? {}) }
    this.value.focus = { ...defaults.focus, ...(this.value.focus ?? {}) }
    this.value.lounge = { ...defaults.lounge, ...(this.value.lounge ?? {}) }
    this.value.streamer = { ...defaults.streamer, ...(this.value.streamer ?? {}) }
    this.value.notify = { ...defaults.notify, ...(this.value.notify ?? {}) }
    this.value.notify.kinds = { ...defaults.notify.kinds, ...(this.value.notify.kinds ?? {}) }
  }

  get(): Settings {
    return this.value
  }

  set(patch: Partial<Settings>): Settings {
    this.value = { ...this.value, ...patch }
    writeJsonAtomic(this.file, this.value)
    return this.value
  }
}
