import { useCallback, useEffect, useRef, useState } from 'react'
import * as Blockly from 'blockly/core'
import { api, errorText } from '../../api'
import { ADDON_SCHEME, LIMITS, type AddonPackage } from '../../../../shared/addonFormat'
import { sniffAsset } from '../../../../shared/addonValidate'
import type { BlocklyProgram } from '../../../../shared/addonBlocks'
import { useAddons } from '../../store/addonStore'
import { alert } from '../../store/dialogStore'
import { registerBlocks, setAssetSource, vibedeskTheme } from '../../addons/blocklySetup'
import { toolbox } from '../../addons/blocklyDefs'
import { AddonRunner, realClock } from '../../addons/interpreter'
import { createActions } from '../../addons/actions'
import { pauseForTest, setTestRunner } from '../../addons/runtime'
import { Icon } from '../../desktop/icons'

interface PromptRow {
  key: number
  name: string
  text: string
}

const STARTER: BlocklyProgram = {
  blocks: {
    languageVersion: 0,
    blocks: [{ type: 'vd_on_session_waiting', x: 40, y: 40, inputs: { DO: { block: { type: 'vd_play_sound', fields: { SOUND: 'chime' } } } } }]
  }
}

/** Dateiname passend zu den Regeln der Import-Prüfung machen. */
function safeAssetName(raw: string, taken: string[]): string {
  const dot = raw.lastIndexOf('.')
  const ext = dot > 0 ? raw.slice(dot).replace(/[^\w.]/g, '').slice(0, 8) : ''
  const base = (dot > 0 ? raw.slice(0, dot) : raw).replace(/[^\w-]/g, '_').replace(/_+/g, '_').slice(0, 60) || 'datei'
  let name = base + ext
  for (let i = 2; taken.includes(name); i++) name = `${base}_${i}${ext}`
  return name
}

function AssetThumb({ bytes }: { bytes: Uint8Array }): React.JSX.Element {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const u = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>]))
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [bytes])
  return <img src={url} alt="" />
}

export function MakerView({ editId }: { editId: string | null }): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const ws = useRef<Blockly.WorkspaceSvg | null>(null)
  const [id] = useState(() => editId ?? crypto.randomUUID())
  const [name, setName] = useState('')
  const [author, setAuthor] = useState('')
  const [description, setDescription] = useState('')
  const [version, setVersion] = useState(1)
  const [prompts, setPrompts] = useState<PromptRow[]>([])
  const [assets, setAssets] = useState<Record<string, Uint8Array>>({})
  const [side, setSide] = useState<'content' | 'info'>('content')
  const [testing, setTesting] = useState(false)
  const [status, setStatus] = useState('')
  const [dirty, setDirty] = useState(0)

  // Werte für Dropdowns und Speichern immer aktuell halten, ohne Blockly neu aufzubauen
  const latest = useRef({ name, author, description, version, prompts, assets })
  latest.current = { name, author, description, version, prompts, assets }

  useEffect(() => {
    setAssetSource({
      images: () => Object.keys(latest.current.assets).filter((n) => sniffAsset(latest.current.assets[n])?.kind === 'image'),
      sounds: () => Object.keys(latest.current.assets).filter((n) => sniffAsset(latest.current.assets[n])?.kind === 'sound'),
      prompts: () => latest.current.prompts.map((p) => p.name.trim()).filter(Boolean)
    })
  }, [])

  // Blockly-Arbeitsfläche aufbauen und ggf. ein bestehendes Addon laden
  useEffect(() => {
    if (!host.current) return
    registerBlocks()
    const w = Blockly.inject(host.current, {
      toolbox: toolbox() as Blockly.utils.toolbox.ToolboxDefinition,
      renderer: 'zelos',
      theme: vibedeskTheme(),
      trashcan: false,
      zoom: { controls: true, wheel: true, startScale: 0.75, maxScale: 2, minScale: 0.3 },
      move: { scrollbars: true, drag: true, wheel: false },
      sounds: false
    })
    ws.current = w
    let cancelled = false
    const existing = editId ? useAddons.getState().list.find((a) => a.manifest.id === editId) : undefined
    const load = async (): Promise<void> => {
      if (existing) {
        const m = existing.manifest
        setName(m.name)
        setAuthor(m.author)
        setDescription(m.description)
        setVersion(m.version)
        setPrompts(Object.entries(m.prompts ?? {}).map(([n, t], i) => ({ key: i, name: n, text: t })))
        const loaded: Record<string, Uint8Array> = {}
        for (const n of existing.assetNames) {
          const res = await fetch(`${ADDON_SCHEME}://${m.id}/${encodeURIComponent(n)}`)
          loaded[n] = new Uint8Array(await res.arrayBuffer())
        }
        if (cancelled) return
        latest.current.assets = loaded
        setAssets(loaded)
      }
      Blockly.serialization.workspaces.load((existing?.program ?? STARTER) as object, w)
      w.addChangeListener((e) => {
        if (!e.isUiEvent) setDirty((d) => d + 1)
      })
    }
    void load()
    const ro = new ResizeObserver(() => Blockly.svgResize(w))
    ro.observe(host.current)
    return () => {
      cancelled = true
      ro.disconnect()
      setTestRunner(null)
      w.dispose()
      ws.current = null
    }
  }, [editId])

  const build = useCallback(async (bumpVersion = false): Promise<AddonPackage | null> => {
    const w = ws.current
    const l = latest.current
    if (!w || !l.name.trim()) return null
    const promptMap: Record<string, string> = {}
    for (const p of l.prompts) if (p.name.trim()) promptMap[p.name.trim().slice(0, 60)] = p.text
    const v = bumpVersion ? l.version + 1 : l.version
    if (bumpVersion) setVersion(v)
    return {
      manifest: {
        id,
        name: l.name.trim().slice(0, 60),
        author: l.author.trim().slice(0, 60),
        description: l.description.slice(0, 500),
        version: v,
        formatVersion: 1,
        createdWith: await api.update.version(),
        capabilities: [],
        prompts: promptMap
      },
      program: Blockly.serialization.workspaces.save(w) as BlocklyProgram,
      assets: l.assets
    }
  }, [id])

  const save = useCallback(
    async (opts: { bumpVersion?: boolean; quiet?: boolean } = {}): Promise<boolean> => {
      const p = await build(opts.bumpVersion)
      if (!p) {
        if (!opts.quiet) await alert('Bitte gib deinem Addon zuerst einen Namen.')
        return false
      }
      try {
        await api.addons.saveDraft(p)
        await useAddons.getState().reload()
        setStatus(`Gespeichert ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`)
        return true
      } catch (err) {
        if (!opts.quiet) await alert('Speichern fehlgeschlagen', errorText(err))
        else setStatus('Nicht gespeichert: ' + errorText(err))
        return false
      }
    },
    [build]
  )

  // Automatisch speichern, 3 s nach der letzten Änderung – nur mit Namen
  useEffect(() => {
    if (!dirty || !name.trim() || testing) return
    const t = setTimeout(() => void save({ quiet: true }), 3000)
    return () => clearTimeout(t)
  }, [dirty, name, author, description, prompts, assets, testing, save])

  const toggleTest = async (): Promise<void> => {
    if (testing) {
      setTestRunner(null)
      setTesting(false)
      return
    }
    if (!latest.current.name.trim()) return void (await alert('Bitte gib deinem Addon zuerst einen Namen.'))
    pauseForTest(id)
    if (!(await save())) return void setTestRunner(null)
    const p = await build()
    if (!p) return void setTestRunner(null)
    setTestRunner(
      new AddonRunner({ program: p.program, prompts: p.manifest.prompts, actions: createActions(id), clock: realClock, onError: (m) => setStatus('Fehler im Test: ' + m) }),
      id
    )
    setTesting(true)
  }

  const exportFile = async (): Promise<void> => {
    if (!(await save({ bumpVersion: true }))) return
    try {
      const path = await api.addons.exportTo(id)
      if (path) setStatus('Exportiert nach ' + path)
    } catch (err) {
      await alert('Export fehlgeschlagen', errorText(err))
    }
  }

  const addFiles = async (files: FileList | null): Promise<void> => {
    if (!files) return
    const next = { ...latest.current.assets }
    for (const f of Array.from(files)) {
      if (Object.keys(next).length >= LIMITS.assets) {
        await alert(`Höchstens ${LIMITS.assets} Dateien pro Addon.`)
        break
      }
      if (f.size > LIMITS.asset) {
        await alert(`${f.name} ist zu groß (max. 10 MB).`)
        continue
      }
      const bytes = new Uint8Array(await f.arrayBuffer())
      if (!sniffAsset(bytes)) {
        await alert(`${f.name} wird nicht unterstützt.`, 'Erlaubt sind Bilder (PNG, JPG, WebP, GIF) und Töne (MP3, OGG, WAV).')
        continue
      }
      next[safeAssetName(f.name, Object.keys(next))] = bytes
    }
    setAssets(next)
    setDirty((d) => d + 1)
  }

  const removeAsset = (n: string): void => {
    const { [n]: _gone, ...rest } = assets
    setAssets(rest)
    setDirty((d) => d + 1)
  }

  const updatePrompt = (key: number, patch: Partial<PromptRow>): void => {
    setPrompts((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)))
    setDirty((d) => d + 1)
  }

  const imageNames = Object.keys(assets).filter((n) => sniffAsset(assets[n])?.kind === 'image')
  const soundNames = Object.keys(assets).filter((n) => sniffAsset(assets[n])?.kind === 'sound')

  return (
    <div className="maker">
      <div className="maker-head row">
        <input className="field maker-name" placeholder="Name deines Addons" value={name} maxLength={60} onChange={(e) => (setName(e.target.value), setDirty((d) => d + 1))} data-testid="maker-name" />
        <span className="dim small maker-status">{status}</span>
        <button className={`btn small${testing ? ' danger' : ''}`} onClick={() => void toggleTest()} data-testid="maker-test">
          <Icon name={testing ? 'exit' : 'play'} size={13} /> {testing ? 'Stoppen' : 'Testen'}
        </button>
        <button className="btn small" onClick={() => void save()} data-testid="maker-save">
          <Icon name="check" size={13} /> Speichern
        </button>
        <button className="btn small primary" onClick={() => void exportFile()} data-testid="maker-export">
          <Icon name="external" size={13} /> Exportieren…
        </button>
      </div>
      <div className="maker-main">
        <div className="maker-ws" ref={host} />
        <aside className="maker-side">
          <div className="row tabs">
            <button className={`tab${side === 'content' ? ' on' : ''}`} onClick={() => setSide('content')}>
              Inhalte
            </button>
            <button className={`tab${side === 'info' ? ' on' : ''}`} onClick={() => setSide('info')}>
              Infos
            </button>
          </div>
          {side === 'content' ? (
            <div className="maker-side-body">
              <h4>Bilder</h4>
              {imageNames.length === 0 && <p className="dim small">Eigene Szenenbilder für „wechsle zur Szene“.</p>}
              <ul className="maker-assets">
                {imageNames.map((n) => (
                  <li key={n}>
                    <AssetThumb bytes={assets[n]} />
                    <span title={n}>{n}</span>
                    <button className="btn ghost small" onClick={() => removeAsset(n)} title="Entfernen">
                      <Icon name="trash" size={12} />
                    </button>
                  </li>
                ))}
              </ul>
              <h4>Töne</h4>
              {soundNames.length === 0 && <p className="dim small">Eigene Sounds für „spiele Ton“.</p>}
              <ul className="maker-assets">
                {soundNames.map((n) => (
                  <li key={n}>
                    <Icon name="music" size={14} />
                    <span title={n}>{n}</span>
                    <button className="btn ghost small" onClick={() => removeAsset(n)} title="Entfernen">
                      <Icon name="trash" size={12} />
                    </button>
                  </li>
                ))}
              </ul>
              <label className="btn small">
                <Icon name="plus" size={13} /> Bild oder Ton hinzufügen
                <input type="file" multiple hidden accept=".png,.jpg,.jpeg,.webp,.gif,.mp3,.ogg,.wav" onChange={(e) => (void addFiles(e.target.files), (e.target.value = ''))} />
              </label>
              <h4>Prompt-Vorlagen</h4>
              <p className="dim small">Für „kopiere … in die Zwischenablage“.</p>
              {prompts.map((p) => (
                <div className="maker-prompt" key={p.key}>
                  <div className="row">
                    <input className="field" placeholder="Name" value={p.name} maxLength={60} onChange={(e) => updatePrompt(p.key, { name: e.target.value })} />
                    <button className="btn ghost small" onClick={() => (setPrompts((ps) => ps.filter((x) => x.key !== p.key)), setDirty((d) => d + 1))} title="Entfernen">
                      <Icon name="trash" size={12} />
                    </button>
                  </div>
                  <textarea className="field" rows={3} maxLength={5000} placeholder="Text der Vorlage" value={p.text} onChange={(e) => updatePrompt(p.key, { text: e.target.value })} />
                </div>
              ))}
              <button className="btn small" onClick={() => setPrompts((ps) => [...ps, { key: Date.now(), name: '', text: '' }])}>
                <Icon name="plus" size={13} /> Vorlage hinzufügen
              </button>
            </div>
          ) : (
            <div className="maker-side-body">
              <label className="dim small">Autor</label>
              <input className="field" value={author} maxLength={60} onChange={(e) => (setAuthor(e.target.value), setDirty((d) => d + 1))} placeholder="Dein Name" />
              <label className="dim small">Beschreibung</label>
              <textarea className="field" rows={6} maxLength={500} value={description} onChange={(e) => (setDescription(e.target.value), setDirty((d) => d + 1))} placeholder="Was macht dein Addon?" />
              <p className="dim small">Version {version} · wird beim Exportieren hochgezählt.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
