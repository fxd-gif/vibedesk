import { useEffect, useState } from 'react'
import { LIMITS } from '../../../../../shared/addonFormat'
import { sniffAsset } from '../../../../../shared/addonValidate'
import { alert } from '../../../store/dialogStore'
import { FlowIcon } from './FlowIcon'

export interface PromptRow {
  key: number
  name: string
  text: string
}

export interface Meta {
  name: string
  author: string
  description: string
  version: number
  prompts: PromptRow[]
  assets: Record<string, Uint8Array>
}

/** Dateiname passend zu den Regeln der Import-Prüfung machen. */
function safeAssetName(raw: string, taken: string[]): string {
  const dot = raw.lastIndexOf('.')
  const ext = dot > 0 ? raw.slice(dot).replace(/[^\w.]/g, '').slice(0, 8) : ''
  const base = (dot > 0 ? raw.slice(0, dot) : raw).replace(/[^\w-]/g, '_').replace(/_+/g, '_').slice(0, 60) || 'datei'
  let name = base + ext
  for (let i = 2; taken.some((t) => t.toLowerCase() === name.toLowerCase()); i++) name = `${base}_${i}${ext}`
  return name
}

function Thumb({ bytes }: { bytes: Uint8Array }): React.JSX.Element {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const u = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>]))
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [bytes])
  return <img src={url} alt="" />
}

/** Rechtes Panel ohne Auswahl: Name, Autor, Beschreibung und Inhalte (Bilder, Töne, Prompt-Vorlagen). */
export function AddonMeta({ meta, onChange }: { meta: Meta; onChange(patch: Partial<Meta>): void }): React.JSX.Element {
  const kinds = Object.fromEntries(Object.entries(meta.assets).map(([n, b]) => [n, sniffAsset(b)?.kind]))
  const images = Object.keys(meta.assets).filter((n) => kinds[n] === 'image')
  const sounds = Object.keys(meta.assets).filter((n) => kinds[n] === 'sound')

  const addFiles = async (files: FileList | null): Promise<void> => {
    if (!files) return
    const next = { ...meta.assets }
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
    onChange({ assets: next })
  }
  const remove = (n: string): void => {
    const { [n]: _gone, ...rest } = meta.assets
    onChange({ assets: rest })
  }
  const setPrompt = (key: number, patch: Partial<PromptRow>): void => onChange({ prompts: meta.prompts.map((p) => (p.key === key ? { ...p, ...patch } : p)) })

  const assetList = (names: string[], icon: 'image' | 'music'): React.ReactNode =>
    names.length > 0 && (
      <ul className="fassets">
        {names.map((n) => (
          <li key={n}>
            {icon === 'image' ? <Thumb bytes={meta.assets[n]} /> : <span className="fassets-ico"><FlowIcon name="music" size={14} /></span>}
            <span title={n}>{n}</span>
            <button className="ficon-btn" onClick={() => remove(n)} title="Entfernen">
              <FlowIcon name="trash" size={14} />
            </button>
          </li>
        ))}
      </ul>
    )

  return (
    <div className="finsp">
      <div className="finsp-head cat-addon">
        <div className="fnode-icon big">
          <FlowIcon name="puzzle" size={22} />
        </div>
        <div>
          <div className="finsp-title">Addon</div>
          <div className="finsp-desc">Wähle einen Baustein, um ihn einzustellen.</div>
        </div>
      </div>
      <div className="finsp-section">
        <h4>Infos</h4>
        <label className="ffield">
          <span className="ffield-label">Autor</span>
          <input className="finput" value={meta.author} maxLength={60} placeholder="Dein Name" onChange={(e) => onChange({ author: e.target.value })} />
        </label>
        <label className="ffield">
          <span className="ffield-label">Beschreibung</span>
          <textarea className="finput" rows={3} maxLength={500} value={meta.description} placeholder="Was macht dein Addon?" onChange={(e) => onChange({ description: e.target.value })} />
        </label>
        <span className="ffield-hint">Version {meta.version} · wird beim Exportieren hochgezählt</span>
      </div>
      <div className="finsp-section">
        <h4>Inhalte</h4>
        <span className="ffield-label">Bilder für „Szene wechseln“</span>
        {assetList(images, 'image')}
        <span className="ffield-label">Töne für „Ton abspielen“</span>
        {assetList(sounds, 'music')}
        <label className="fbtn ghost">
          <FlowIcon name="plus" size={14} /> Bild oder Ton hinzufügen
          <input type="file" multiple hidden accept=".png,.jpg,.jpeg,.webp,.gif,.mp3,.ogg,.wav" onChange={(e) => (void addFiles(e.target.files), (e.target.value = ''))} />
        </label>
      </div>
      <div className="finsp-section">
        <h4>Prompt-Vorlagen</h4>
        {meta.prompts.map((p) => (
          <div className="fprompt" key={p.key}>
            <div className="fprompt-row">
              <input className="finput" placeholder="Name" value={p.name} maxLength={60} onChange={(e) => setPrompt(p.key, { name: e.target.value })} />
              <button className="ficon-btn" onClick={() => onChange({ prompts: meta.prompts.filter((x) => x.key !== p.key) })} title="Entfernen">
                <FlowIcon name="trash" size={14} />
              </button>
            </div>
            <textarea className="finput" rows={3} maxLength={5000} placeholder="Text der Vorlage" value={p.text} onChange={(e) => setPrompt(p.key, { text: e.target.value })} />
          </div>
        ))}
        <button className="fbtn ghost" onClick={() => onChange({ prompts: [...meta.prompts, { key: Date.now(), name: '', text: '' }] })}>
          <FlowIcon name="plus" size={14} /> Vorlage hinzufügen
        </button>
      </div>
    </div>
  )
}
