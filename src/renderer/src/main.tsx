// Sprache zuerst – alle anderen Module bauen ihre Texte schon beim Laden
import './i18nInit'
import { createRoot } from 'react-dom/client'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/jetbrains-mono/400.css'
import './styles/global.css'
import App from './App'
import SecondApp from './second/SecondApp'
import { IS_SECOND } from './store/screenStore'
import { ErrorBoundary } from './desktop/ErrorBoundary'
import { api } from './api'

// Fehler außerhalb von React (Timer, Promises) landen ebenfalls im Protokoll
window.addEventListener('error', (e) => api.app.logError('window', `${e.message}\n${e.error?.stack ?? ''}`))
window.addEventListener('unhandledrejection', (e) => api.app.logError('Promise', String(e.reason?.stack ?? e.reason)))

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary where={IS_SECOND ? 'Zweiter Bildschirm' : 'App'} full>
    {/* Zweitfenster (#second): derselbe Renderer, aber nur die herübergeholten Werkzeug-Fenster */}
    {IS_SECOND ? <SecondApp /> : <App />}
  </ErrorBoundary>
)
