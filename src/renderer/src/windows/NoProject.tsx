// Einheitlicher Leerzustand für Fenster, die ein Projekt brauchen: mittig, ruhig, mit dem einen nächsten Schritt.
import { Icon } from '../desktop/icons'
import { newProject } from './ProjectsWindow'
import { t } from '../../../shared/i18n'

export function NoProject({ text }: { text?: string }): React.JSX.Element {
  return (
    <div className="no-project" data-testid="no-project">
      <Icon name="folder" size={26} />
      <p>{text ?? t('Lege zuerst ein Projekt an.')}</p>
      <button className="btn small primary" onClick={() => void newProject()}>
        <Icon name="plus" size={13} /> {t('Neues Projekt')}
      </button>
    </div>
  )
}
