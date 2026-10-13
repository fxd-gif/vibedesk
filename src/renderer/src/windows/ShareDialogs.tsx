import { useEffect, useState } from 'react'
import { api, errorText } from '../api'
import { Icon } from '../desktop/icons'
import { DISCORD_LIMIT, riskyFiles, SHARE_KIND_LABEL } from '../../../shared/shareCode'
import type { Project, SkillTarget } from '../../../shared/types'
import { SCENES } from '../ambience/sceneParams'
import { alert, confirm } from '../store/dialogStore'
import { useSettings } from '../store/settingsStore'
import { startImport, useShare, type PendingImport } from '../store/shareStore'

const pct = (v: number): string => `${Math.round(v * 100)} %`

export function ShareDialogs(): React.JSX.Element | null {
  const exported = useShare((s) => s.exported)
  const pending = useShare((s) => s.pending)
  const pasteOpen = useShare((s) => s.pasteOpen)
  if (pending) return <ImportPreview p={pending} />
  if (exported) return <ExportBox title={exported.title} code={exported.code} />
  if (pasteOpen) return <PasteBox />
  return null
}

function Backdrop({ onClose, children, wide }: { onClose(): void; children: React.ReactNode; wide?: boolean }): React.JSX.Element {
  return (
    <div className="dlg-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dlg share-dlg${wide ? ' wide' : ''}`} role="dialog" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        {children}
      </div>
    </div>
  )
}

function ExportBox({ title, code }: { title: string; code: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const close = (): void => useShare.setState({ exported: null })
  const copy = (): void => {
    api.clipboard.write(code)
    setCopied(true)
  }
  useEffect(copy, [code])
  return (
    <Backdrop onClose={close}>
      <h3>
        <Icon name="share" size={16} /> {title} teilen
      </h3>
      <p className="dlg-msg">Schick den Code an Freunde – per Discord, Chat oder in der Vibe-Lounge. Wer ihn einfügt (Strg+K → Code einfügen), sieht erst eine Vorschau.</p>
      <textarea className="field mono share-code" readOnly value={code} rows={5} onFocus={(e) => e.currentTarget.select()} data-testid="share-code" />
      <div className="row between">
        <span className={`small ${code.length > DISCORD_LIMIT ? 'warn' : 'dim'}`}>
          {code.length.toLocaleString('de-DE')} Zeichen
          {code.length > DISCORD_LIMIT && ' · zu lang für eine Discord-Nachricht – Discord macht daraus eine Textdatei, das klappt auch'}
        </span>
      </div>
      <div className="dlg-actions">
        <button className="btn ghost" onClick={close}>
          Schließen
        </button>
        <button className="btn primary" onClick={copy} autoFocus>
          {copied ? 'Kopiert ✓' : 'Kopieren'}
        </button>
      </div>
    </Backdrop>
  )
}

function PasteBox(): React.JSX.Element {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const close = (): void => useShare.setState({ pasteOpen: false })
  const go = async (t = text): Promise<void> => {
    if (!t.trim()) return
    setBusy(true)
    await startImport(t)
    setBusy(false)
  }
  return (
    <Backdrop onClose={close}>
      <h3>Share-Code einfügen</h3>
      <p className="dlg-msg">Code (beginnt mit „vibe1:“) einfügen oder eine Textdatei mit dem Code hierher ziehen.</p>
      <textarea
        className="field mono share-code"
        autoFocus
        rows={5}
        placeholder="vibe1:…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={async (e) => {
          e.preventDefault()
          const f = e.dataTransfer.files[0]
          if (f && f.size < 2_000_000) {
            const t = await f.text()
            setText(t)
            go(t)
          }
        }}
        data-testid="share-paste"
      />
      <div className="dlg-actions">
        <button className="btn ghost" onClick={async () => setText(await api.clipboard.read())}>
          Aus Zwischenablage
        </button>
        <span style={{ flex: 1 }} />
        <button className="btn ghost" onClick={close}>
          Abbrechen
        </button>
        <button className="btn primary" disabled={!text.trim() || busy} onClick={() => go()} data-testid="share-open">
          Ansehen
        </button>
      </div>
    </Backdrop>
  )
}

function ImportPreview({ p }: { p: PendingImport }): React.JSX.Element {
  const close = (): void => useShare.setState({ pending: null })
  const s = useSettings((x) => x.s)
  const set = useSettings((x) => x.set)
  const [projects, setProjects] = useState<Project[]>([])
  const [target, setTarget] = useState('global')
  const [showMd, setShowMd] = useState(false)
  const [busy, setBusy] = useState(false)
  const e = p.env

  useEffect(() => {
    if (e.kind === 'skill') api.projects.list().then((l) => setProjects(l.filter((x) => !x.missing)))
  }, [e.kind])

  const apply = async (): Promise<void> => {
    if (!s) return
    setBusy(true)
    try {
      if (e.kind === 'prompts') {
        const have = new Set(s.prompts.map((x) => x.text.trim()))
        const add = e.prompts.filter((x) => !have.has(x.text.trim())).map((x) => ({ id: crypto.randomUUID(), title: x.title || x.text.trim().slice(0, 30), text: x.text }))
        set({ prompts: [...s.prompts, ...add] })
        close()
        await alert(add.length ? `${add.length === 1 ? 'Prompt' : add.length + ' Prompts'} übernommen` : 'Schon vorhanden', add.length ? 'Du findest sie unter „Prompts & Notizen“.' : 'Diese Prompts hast du bereits.')
      } else if (e.kind === 'ambience') {
        set({ ...e.ambience, streamUrl: e.ambience.streamUrl || s.streamUrl })
        close()
      } else if (p.skill?.length) {
        const tgt: SkillTarget = target === 'global' ? { kind: 'global' } : { kind: 'project', projectId: target }
        const tokens = [p.skill[0].token]
        try {
          await api.skills.install(tokens, tgt, false)
        } catch (err) {
          if (!errorText(err).includes('SKILL_EXISTS')) throw err
          if (!(await confirm({ title: 'Skill existiert bereits', message: 'Ersetzen? Der alte Ordner wandert in den Papierkorb.', confirmLabel: 'Ersetzen', danger: true }))) return
          await api.skills.install(tokens, tgt, true)
        }
        close()
        await alert('Skill installiert', 'Er gilt für neu gestartete Sessions.')
      }
    } catch (err) {
      await alert('Übernehmen fehlgeschlagen', errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const risky = e.kind === 'skill' ? riskyFiles(e.files) : []
  const md = e.kind === 'skill' ? (e.files.find((f) => f.path === 'SKILL.md')?.text ?? '') : ''
  const scene = e.kind === 'ambience' ? SCENES.find((x) => x.id === e.ambience.scene)?.label : ''

  return (
    <Backdrop onClose={close} wide>
      <h3>
        {SHARE_KIND_LABEL[e.kind]} aus Share-Code {e.from && <span className="dim small">· Absender laut Code: {e.from}</span>}
      </h3>
      <div className="share-preview" data-testid="share-preview">
        {e.kind === 'prompts' && (
          <ul className="prompt-list">
            {e.prompts.map((x, i) => (
              <li key={i} className="prompt">
                <b>{x.title || 'Ohne Titel'}</b>
                <div className="prompt-text">{x.text}</div>
              </li>
            ))}
          </ul>
        )}
        {e.kind === 'ambience' && (
          <ul className="share-facts">
            <li>Ausblick: <b>{scene}</b></li>
            <li>Regen: {pct(e.ambience.rainIntensity)} · Beschlag {pct(e.ambience.blur)} · Geräusch {e.ambience.rainSoundOn ? pct(e.ambience.rainSoundVolume) : 'aus'}</li>
            <li>Lofi-Radio: {e.ambience.musicOn ? pct(e.ambience.musicVolume) : 'aus'}</li>
            {e.ambience.streamUrl && <li className="mono small">Stream: {e.ambience.streamUrl}</li>}
          </ul>
        )}
        {e.kind === 'skill' && (
          <>
            <div>
              <b>{p.skill?.[0]?.name ?? e.name}</b> <span className="dim">– {p.skill?.[0]?.description ?? e.description}</span>
            </div>
            {risky.length > 0 && (
              <div className="warnbox">
                <b>Enthält Skripte:</b> {risky.join(', ')}
                <br />
                Claude kann sie ausführen, wenn der Skill benutzt wird. Installiere ihn nur, wenn du dem Absender vertraust – und schau vorher rein.
              </div>
            )}
            <div className="dim small">{e.files.length} Dateien: {e.files.map((f) => f.path).join(', ')}</div>
            <button className="linkish small" onClick={() => setShowMd(!showMd)}>
              {showMd ? 'SKILL.md ausblenden' : 'SKILL.md ansehen'}
            </button>
            {showMd && <pre className="share-md mono">{md}</pre>}
            <div className="row">
              <span className="dim">Installieren nach</span>
              <div className="row chips">
                {[{ id: 'global', name: 'Global' }, ...projects].map((x) => (
                  <button key={x.id} className={`chip${target === x.id ? ' on' : ''}`} onClick={() => setTarget(x.id)}>
                    {x.name}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
      <div className="dlg-actions">
        <button className="btn ghost" onClick={close}>
          Abbrechen
        </button>
        <button className="btn primary" disabled={busy || (e.kind === 'skill' && !p.skill?.length)} onClick={apply} data-testid="share-apply">
          {e.kind === 'skill' ? 'Installieren' : e.kind === 'ambience' ? 'Atmosphäre übernehmen' : 'Übernehmen'}
        </button>
      </div>
    </Backdrop>
  )
}
