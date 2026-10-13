import { api, errorText } from '../../api'
import { CAPABILITY_LABELS } from '../../../../shared/addonBlocks'
import { useAddons } from '../../store/addonStore'
import { alert, confirm } from '../../store/dialogStore'
import { Icon } from '../../desktop/icons'
import { useAddonUi } from './AddonWindow'
import { pickAndInstall } from './InstallDialog'

export function ManagerView(): React.JSX.Element {
  const { list, errors, setEnabled, remove } = useAddons()
  const edit = useAddonUi((s) => s.edit)

  const exportOne = async (id: string): Promise<void> => {
    try {
      await api.addons.exportTo(id)
    } catch (err) {
      await alert('Export fehlgeschlagen', errorText(err))
    }
  }

  const removeOne = async (id: string, name: string): Promise<void> => {
    const ok = await confirm({ title: `„${name}“ löschen?`, message: 'Das Addon wird von diesem PC entfernt. Exportierte Dateien bleiben erhalten.', confirmLabel: 'Löschen', danger: true })
    if (ok) await remove(id)
  }

  return (
    <div className="addon-manager">
      <div className="row addon-head">
        <span className="dim small">{list.length ? `${list.length} Addon${list.length === 1 ? '' : 's'}` : ''}</span>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn small" onClick={() => void pickAndInstall()} data-testid="addon-import">
            <Icon name="plus" size={13} /> Importieren…
          </button>
          <button className="btn small primary" onClick={() => edit(null)} data-testid="addon-new">
            <Icon name="puzzle" size={13} /> Neues Addon
          </button>
        </div>
      </div>
      {list.length === 0 ? (
        <div className="addon-empty">
          <Icon name="puzzle" size={32} />
          <p className="dim">Noch keine Addons. Bau dein erstes im Maker oder importiere eine .vibeaddon-Datei.</p>
          <button className="btn primary" onClick={() => edit(null)}>
            Erstes Addon bauen
          </button>
        </div>
      ) : (
        <ul className="addon-list">
          {list.map((a) => {
            const m = a.manifest
            return (
              <li key={m.id} className={`addon-card${a.enabled ? '' : ' off'}`} data-testid="addon-card">
                <div className="addon-card-main">
                  <div className="addon-card-title">
                    {m.name}{' '}
                    <span className="dim small">
                      v{m.version}
                      {m.author ? ` · ${m.author}` : ''}
                    </span>
                  </div>
                  {m.description && <div className="dim small">{m.description}</div>}
                  {m.capabilities.length > 0 && (
                    <div className="addon-chips">
                      {m.capabilities.map((c) => (
                        <span key={c} className="addon-chip">
                          {CAPABILITY_LABELS[c]}
                        </span>
                      ))}
                    </div>
                  )}
                  {errors[m.id] && <div className="addon-warn">Fehler: {errors[m.id]}</div>}
                </div>
                <div className="addon-card-actions">
                  <label className="addon-switch" title={a.enabled ? 'Ausschalten' : 'Einschalten'} data-testid="addon-toggle">
                    <input type="checkbox" checked={a.enabled} onChange={(e) => void setEnabled(m.id, e.target.checked)} />
                    <span />
                  </label>
                  <button className="btn ghost small" onClick={() => edit(m.id)} title="Bearbeiten">
                    <Icon name="pen" size={13} />
                  </button>
                  <button className="btn ghost small" onClick={() => void exportOne(m.id)} title="Exportieren">
                    <Icon name="external" size={13} />
                  </button>
                  <button className="btn ghost small" onClick={() => void removeOne(m.id, m.name)} title="Löschen" data-testid="addon-delete">
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
