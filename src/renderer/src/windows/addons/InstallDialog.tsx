import { CAPABILITY_LABELS } from '../../../../shared/addonBlocks'
import { create } from 'zustand'
import { api, errorText } from '../../api'
import type { AddonPreview } from '../../../../shared/types'
import { useAddons } from '../../store/addonStore'
import { alert } from '../../store/dialogStore'
import { openPanel } from '../palette/CommandPalette'
import { useAddonUi } from './AddonWindow'
import { t } from '../../../../shared/i18n'

type Source = string | Uint8Array

const useInstall = create<{ preview: AddonPreview | null; source: Source | null; busy: boolean }>(() => ({ preview: null, source: null, busy: false }))

/** Prüft eine .vibeaddon-Datei (Pfad oder Bytes) und zeigt, was das Addon tut – installiert wird erst nach Bestätigung. */
export async function openInstallDialog(source: Source): Promise<void> {
  try {
    const preview = await api.addons.inspect(source)
    useInstall.setState({ preview, source, busy: false })
  } catch (err) {
    await alert(t('Addon kann nicht installiert werden'), errorText(err))
  }
}

/** Importieren-Knopf: Datei wählen, dann derselbe Dialog wie beim Doppelklick. */
export async function pickAndInstall(): Promise<void> {
  const p = await api.addons.pickFile()
  if (p) await openInstallDialog(p)
}

export function InstallDialog(): React.JSX.Element | null {
  const { preview, source, busy } = useInstall()
  if (!preview || source === null) return null
  const m = preview.manifest
  const old = preview.existing
  const close = (): void => useInstall.setState({ preview: null, source: null, busy: false })
  const install = async (): Promise<void> => {
    useInstall.setState({ busy: true })
    try {
      await api.addons.install(source)
      await useAddons.getState().reload()
      close()
      useAddonUi.getState().showManager()
      openPanel('addons')
    } catch (err) {
      close()
      await alert(t('Addon kann nicht installiert werden'), errorText(err))
    }
  }

  return (
    <div className="dlg-backdrop" onPointerDown={(e) => e.target === e.currentTarget && !busy && close()}>
      <div className="dlg install-dlg" role="dialog" data-testid="install-dialog" onKeyDown={(e) => e.key === 'Escape' && !busy && close()}>
        <h3>{old ? t('Addon aktualisieren?') : t('Addon installieren?')}</h3>
        <div>
          <strong>{m.name}</strong>
          {m.author && <span className="dim"> · {t('von {author}', { author: m.author })}</span>}
        </div>
        {m.description && <p className="dlg-msg">{m.description}</p>}
        {old && (
          <p className="dlg-msg">
            {t('Installiert: v{old} von {oldAuthor} → v{new} von {newAuthor}', { old: old.version, oldAuthor: old.author || t('unbekannt'), new: m.version, newAuthor: m.author || t('unbekannt') })}
          </p>
        )}
        <div>
          <div className="dim small">{t('Dieses Addon …')}</div>
          {preview.capabilityLabels.length ? (
            <ul className="install-caps">
              {preview.capabilityLabels.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : (
            <p className="dlg-msg">{t('… tut nichts Sichtbares.')}</p>
          )}
        </div>
        {preview.images.length > 0 && (
          <div className="install-images">
            {preview.images.map((i) => (
              <img key={i.name} src={i.dataUrl} alt={i.name} title={i.name} />
            ))}
          </div>
        )}
        {preview.capabilityLabels.includes(CAPABILITY_LABELS.claude) ? (
          <p className="install-warn" data-testid="install-claude-warn">
            <b>{t('Achtung: Dieses Addon steuert Claude.')}</b>{' '}
            {t('Es kann Sessions öffnen und Prompts schicken – Claude kann daraufhin Dateien ändern und Befehle ausführen. Installiere es nur, wenn du dem Absender vertraust, und schau dir die Prompts im Maker an.')}
          </p>
        ) : (
          <p className="dim small">{t('Addons können keine Dateien lesen, keine Befehle ausführen und nicht ins Internet.')}</p>
        )}
        <div className="dlg-actions">
          <button className="btn ghost" onClick={close} disabled={busy}>
            {t('Abbrechen')}
          </button>
          <button className="btn primary" autoFocus onClick={() => void install()} disabled={busy} data-testid="install-confirm">
            {old ? t('Aktualisieren') : t('Installieren')}
          </button>
        </div>
      </div>
    </div>
  )
}

let wired = false
/** Doppelklick bei laufender App und Drag & Drop einer .vibeaddon aufs Fenster. */
export function wireAddonImport(): void {
  if (wired) return
  wired = true
  api.on.addonOpen((p) => void openInstallDialog(p))
  const addonFile = (e: DragEvent): File | undefined => Array.from(e.dataTransfer?.files ?? []).find((f) => f.name.toLowerCase().endsWith('.vibeaddon'))
  window.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
  })
  window.addEventListener(
    'drop',
    (e) => {
      const f = addonFile(e)
      if (!f) return
      e.preventDefault()
      e.stopPropagation()
      void openInstallDialog(api.fs.pathForFile(f))
    },
    true
  )
}
