import { api, errorText } from '../../api'
import { CAPABILITY_LABELS } from '../../../../shared/addonBlocks'
import { useAddons } from '../../store/addonStore'
import { alert, confirm } from '../../store/dialogStore'
import { Icon } from '../../desktop/icons'
import { useAddonUi } from './AddonWindow'
import { pickAndInstall } from './InstallDialog'
import { t, tn } from '../../../../shared/i18n'

export function ManagerView(): React.JSX.Element {
  const { list, errors, setEnabled, remove } = useAddons()
  const edit = useAddonUi((s) => s.edit)
  const newAddon = useAddonUi((s) => s.newAddon)

  const exportOne = async (id: string): Promise<void> => {
    try {
      await api.addons.exportTo(id)
    } catch (err) {
      await alert(t('Export fehlgeschlagen'), errorText(err))
    }
  }

  const removeOne = async (id: string, name: string): Promise<void> => {
    const ok = await confirm({ title: t('„{name}“ löschen?', { name }), message: t('Das Addon wird von diesem PC entfernt. Exportierte Dateien bleiben erhalten.'), confirmLabel: t('Löschen'), danger: true })
    if (ok) await remove(id)
  }

  return (
    <div className="addon-manager">
      <div className="row addon-head">
        <span className="dim small">{list.length ? tn(list.length, '{n} Addon', '{n} Addons') : ''}</span>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn small" onClick={() => void pickAndInstall()} data-testid="addon-import">
            <Icon name="plus" size={13} /> {t('Importieren…')}
          </button>
          <button className="btn small primary" onClick={newAddon} data-testid="addon-new">
            <Icon name="puzzle" size={13} /> {t('Neues Addon')}
          </button>
        </div>
      </div>
      {list.length === 0 ? (
        <div className="addon-empty">
          <Icon name="puzzle" size={32} />
          <p className="dim">{t('Noch keine Addons. Bau dein erstes im Maker oder importiere eine .vibeaddon-Datei.')}</p>
          <button className="btn primary" onClick={newAddon}>
            {t('Erstes Addon bauen')}
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
                  {errors[m.id] && <div className="addon-warn">{t('Fehler: {error}', { error: errors[m.id] })}</div>}
                </div>
                <div className="addon-card-actions">
                  <label className="addon-switch" title={a.enabled ? t('Ausschalten') : t('Einschalten')} data-testid="addon-toggle">
                    <input type="checkbox" checked={a.enabled} onChange={(e) => void setEnabled(m.id, e.target.checked)} />
                    <span />
                  </label>
                  <button className="btn ghost small" onClick={() => edit(m.id)} title={t('Bearbeiten')}>
                    <Icon name="pen" size={13} />
                  </button>
                  <button className="btn ghost small" onClick={() => void exportOne(m.id)} title={t('Exportieren')}>
                    <Icon name="external" size={13} />
                  </button>
                  <button className="btn ghost small" onClick={() => void removeOne(m.id, m.name)} title={t('Löschen')} data-testid="addon-delete">
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
