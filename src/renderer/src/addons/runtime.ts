// Hält für jedes aktive Addon einen Runner und leitet App-Ereignisse an alle weiter.
import { useAddons } from '../store/addonStore'
import { useFocus } from '../store/focusStore'
import { useSettings } from '../store/settingsStore'
import { useWorkflow } from '../store/workflowStore'
import { createActions } from './actions'
import { focusTransition, hookTransitions, planRebuild, sceneFallback, statusTransitions } from './events'
import { onAddonEvent } from './appEvents'
import { AddonRunner, realClock, type AddonEvent } from './interpreter'
import { createStorage, type ManagedStorage } from './storage'
import { dismissAsks } from './AskToast'
import { api } from '../api'
import { t } from '../../../shared/i18n'
import { useSessions } from '../store/sessionStore'

const runners = new Map<string, AddonRunner>()
/** Fingerabdruck je laufendem Addon – unveränderte Addons laufen beim Neuladen einfach weiter */
const signatures = new Map<string, string>()
let testRunner: AddonRunner | null = null
let testId: string | null = null
const lastInterval = new Map<string, number>()

const storageIO = { load: (id: string) => api.addons.getState(id), save: (id: string, data: Parameters<typeof api.addons.setState>[1]) => api.addons.setState(id, data) }
/** letzter Speicher je Addon – ein neuer lädt erst, wenn der alte fertig geschrieben hat */
const storages = new Map<string, ManagedStorage>()

/** Speicher für ein Addon (Laufzeit oder Test im Maker). */
export function addonStorage(id: string): ManagedStorage {
  const prev = storages.get(id)
  const s = createStorage(id, storageIO, prev ? prev.flush() : Promise.resolve(), (m) => useAddons.getState().setError(id, t('Speichern: {error}', { error: m })))
  storages.set(id, s)
  return s
}

const addonName = (id: string): string => useAddons.getState().list.find((a) => a.manifest.id === id)?.manifest.name ?? 'Addon'

/** Runner anhalten; bei gelöschtem Addon den Speicher verwerfen statt zu schreiben. */
function stopRunner(id: string, r: AddonRunner | undefined, removed: boolean): void {
  if (removed) storages.get(id)?.discard()
  r?.stop()
  dismissAsks(id)
}

const all = (): AddonRunner[] => (testRunner ? [...runners.values(), testRunner] : [...runners.values()])
const emit = (e: AddonEvent): void => all().forEach((r) => r.emit(e))

function rebuild(): void {
  const { list, setError } = useAddons.getState()
  const wanted = list.filter((a) => a.enabled).map((a) => ({ a, id: a.manifest.id, sig: JSON.stringify([a.program, a.manifest.prompts]) }))
  const plan = planRebuild(signatures, wanted, testId)
  const present = new Set(list.map((a) => a.manifest.id))
  for (const id of plan.stop) {
    stopRunner(id, runners.get(id), !present.has(id))
    runners.delete(id)
    signatures.delete(id)
    for (const k of [...lastInterval.keys()]) if (k.startsWith(id + ':')) lastInterval.delete(k)
  }
  for (const { a, id, sig } of wanted.filter((w) => plan.start.includes(w.id))) {
    const r = new AddonRunner({ program: a.program, prompts: a.manifest.prompts ?? {}, actions: createActions(id, a.manifest.name), clock: realClock, storage: addonStorage(id), onError: (m) => setError(id, m) })
    runners.set(id, r)
    signatures.set(id, sig)
    // neu hinzugekommen oder geändert: „VibeDesk startet“ für dieses Addon auslösen
    r.emit({ type: 'start' })
  }
  const scene = useSettings.getState().s?.scene
  const fallback = scene ? sceneFallback(scene, list) : null
  if (fallback) useSettings.getState().set({ scene: fallback })
}

/** Vor dem Speichern im Maker: installiertes Addon anhalten, damit es während des Tests nicht doppelt läuft. */
export function pauseForTest(id: string): void {
  testId = id
  rebuild()
}

/** Der Maker testet seinen Entwurf mit eigenem Runner; null beendet den Test und startet das installierte Addon wieder. */
export function setTestRunner(r: AddonRunner | null, id: string | null = null): void {
  testRunner?.stop()
  if (testId) dismissAsks(testId)
  testRunner = r
  for (const k of [...lastInterval.keys()]) if (k.startsWith('test:')) lastInterval.delete(k)
  if (r) {
    if (id && testId !== id) pauseForTest(id)
    r.emit({ type: 'start' })
  } else if (testId) {
    testId = null
    rebuild()
  }
}

const KEY_RE = /^(?:Key([A-Z])|Digit(\d))$/

let started = false
export function startAddonRuntime(): void {
  if (started) return
  started = true

  useAddons.subscribe((s, prev) => {
    if (s.list !== prev.list) rebuild()
  })
  useWorkflow.subscribe((s, prev) => {
    const projectOf = (sid: string): string | undefined => useSessions.getState().sessions.find((x) => x.id === sid)?.name
    if (s.sessions !== prev.sessions) statusTransitions(prev.sessions, s.sessions, projectOf).forEach(emit)
  })
  useFocus.subscribe((s, prev) => {
    const e = focusTransition(prev.state.phase, s.state.phase)
    if (e) emit(e)
  })
  // Claude benutzt Werkzeuge, ändert Dateien, committet
  api.on.hookEvent((e) => {
    if (e.name !== 'PostToolUse' || !all().length) return
    const s = useSessions.getState().sessions.find((x) => x.id === e.sessionId)
    hookTransitions(e, s ? { project: s.name, cwd: s.cwd } : undefined).forEach(emit)
  })
  onAddonEvent(emit)

  // Strg+Alt+Taste – nur abfangen, wenn ein Addon genau diese Taste nutzt (sonst bleibt AltGr unberührt)
  window.addEventListener(
    'keydown',
    (e) => {
      if (!e.ctrlKey || !e.altKey || e.shiftKey || e.metaKey) return
      const m = KEY_RE.exec(e.code)
      const key = m?.[1] ?? m?.[2]
      if (!key || !all().some((r) => r.hotkeys().includes(key))) return
      e.preventDefault()
      e.stopPropagation()
      emit({ type: 'hotkey', key })
    },
    true
  )

  let lastMinute = ''
  setInterval(() => {
    const now = new Date()
    const stamp = `${now.getHours()}:${now.getMinutes()}`
    if (stamp !== lastMinute) {
      lastMinute = stamp
      emit({ type: 'time', hour: now.getHours(), minute: now.getMinutes() })
    }
    const t = Date.now()
    const entries: [string, AddonRunner][] = [...runners.entries()]
    if (testRunner) entries.push(['test', testRunner])
    for (const [id, r] of entries) {
      for (const m of r.intervals()) {
        const k = `${id}:${m}`
        const last = lastInterval.get(k)
        if (last === undefined) lastInterval.set(k, t)
        else if (t - last >= m * 60_000) {
          lastInterval.set(k, t)
          r.emit({ type: 'interval', minutes: m })
        }
      }
    }
  }, 1000)

  // Beim Schließen ausstehende „Dauerhaft merken“-Werte noch schreiben
  window.addEventListener('beforeunload', () => {
    for (const s of storages.values()) void s.flush()
  })

  void useAddons.getState().reload()
}

/** Makro-Befehle aller laufenden Addons (für die Befehls-Palette) */
export function addonCommands(): { name: string; addon: string }[] {
  const out: { name: string; addon: string }[] = []
  for (const [id, r] of runners) for (const name of r.commands()) out.push({ name, addon: addonName(id) })
  if (testRunner) for (const name of testRunner.commands()) out.push({ name, addon: t('Test im Maker') })
  return out.filter((c, i) => out.findIndex((x) => x.name === c.name) === i)
}

export function runCommand(name: string): void {
  emit({ type: 'command', name })
}

export { addonName }
