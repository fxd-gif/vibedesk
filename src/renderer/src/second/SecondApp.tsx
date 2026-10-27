// Zweiter Bildschirm (Beta): ruhiges Fenster ohne Szene, Regen und Dock – nur die Werkzeug-Fenster, die herübergeholt wurden.
import { useEffect, useState } from 'react'
import { api } from '../api'
import { isPreviewItem } from '../../../shared/secondScreen'
import { t } from '../../../shared/i18n'
import { GlassWindow } from '../desktop/GlassWindow'
import { DialogHost } from '../desktop/Dialog'
import { Icon } from '../desktop/icons'
import { ToastStack } from '../desktop/NotifyCenter'
import { PANELS } from '../windows/panels'
import { PreviewWindow } from '../windows/PreviewWindow'
import { ShareDialogs } from '../windows/ShareDialogs'
import { Curtain } from '../windows/StreamerWindow'
import { useScreen } from '../store/screenStore'
import { useUi } from '../store/uiStore'
import { wireSecond } from './wireSecond'
import '../desktop/desktop.css'
import './second.css'

export default function SecondApp(): React.JSX.Element {
  const [ready, setReady] = useState(false)
  const items = useScreen((s) => s.items)
  const open = useUi((s) => s.open)

  useEffect(() => {
    void wireSecond().then(() => setReady(true))
  }, [])

  const panels = PANELS.filter((p) => open.includes(p.id) && items.some((x) => x.id === p.id))
  const previews = items.filter((x) => isPreviewItem(x.id) && open.includes(x.id))

  return (
    <div className="app second-app" data-layout="desktop">
      {ready &&
        panels.map((def) => (
          <GlassWindow key={def.id} id={def.id} title={def.title}>
            {def.render()}
          </GlassWindow>
        ))}
      {ready && previews.map((x) => <PreviewWindow key={x.id} id={x.id.slice('preview:'.length)} />)}
      {ready && !items.length && (
        <div className="second-empty">
          <Icon name="screen" size={28} />
          <b>{t('Zweiter Bildschirm')}</b>
          <span>{t('Hol Inspector, Git, Gehirn, Prompts, Skills oder eine Vorschau mit dem Bildschirm-Knopf im Fensterkopf hierher.')}</span>
        </div>
      )}
      <div className="second-bar">
        <Icon name="screen" size={14} />
        <span>{t('Zweiter Bildschirm · Beta')}</span>
        <button className="btn small ghost" onClick={() => api.screen.close()} title={t('Alle Fenster zurück auf den Hauptbildschirm')} data-testid="second-close">
          {t('Alles zurückholen')}
        </button>
      </div>
      <ToastStack />
      <ShareDialogs />
      <DialogHost />
      <Curtain />
    </div>
  )
}
