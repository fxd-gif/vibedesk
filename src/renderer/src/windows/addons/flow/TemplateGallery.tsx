import { TEMPLATES } from '../../../addons/templates'
import { FlowIcon } from './FlowIcon'
import './flow.css'

/** Startauswahl für ein neues Addon: leer oder eine der komplexen Vorlagen. */
export function TemplateGallery({ onPick, onBack }: { onPick(templateId: string | null): void; onBack(): void }): React.JSX.Element {
  return (
    <div className="fmaker fgallery">
      <header className="fbar">
        <button className="fbar-back" onClick={onBack} title="Zurück zu Meine Addons">
          <FlowIcon name="chevron" size={16} />
        </button>
        <span className="fbar-logo">
          <FlowIcon name="puzzle" size={17} />
        </span>
        <span className="fbar-crumb" onClick={onBack}>
          Addons
        </span>
        <span className="fbar-sep">/</span>
        <span className="fbar-title">Neues Addon</span>
      </header>
      <div className="fgallery-body">
        <div className="fgallery-intro">
          <h2>Womit willst du starten?</h2>
          <p>Jede Vorlage ist ein fertiges, lauffähiges Addon – öffne sie im Maker und bau sie nach deinem Geschmack um.</p>
        </div>
        <div className="fgallery-grid">
          <button className="ftmpl empty" onClick={() => onPick(null)} data-testid="tmpl-empty">
            <span className="ftmpl-icon">
              <FlowIcon name="plus" size={22} />
            </span>
            <span className="ftmpl-name">Leeres Addon</span>
            <span className="ftmpl-desc">Mit einem einfachen Startablauf: Session fertig → Gong.</span>
          </button>
          {TEMPLATES.map((t) => (
            <button key={t.id} className={`ftmpl cat-${t.accent}`} onClick={() => onPick(t.id)} data-testid={`tmpl-${t.id}`}>
              <span className="ftmpl-icon fnode-icon">
                <FlowIcon name={t.icon} size={22} />
              </span>
              <span className="ftmpl-name">{t.name}</span>
              <span className="ftmpl-desc">{t.description}</span>
              <span className="ftmpl-tags">
                {t.highlights.map((h) => (
                  <i key={h}>{h}</i>
                ))}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
