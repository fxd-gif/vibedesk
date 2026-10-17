import { createRoot } from 'react-dom/client'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/jetbrains-mono/400.css'
import './styles/global.css'
import App from './App'
import { ErrorBoundary } from './desktop/ErrorBoundary'
import { api } from './api'

// Fehler außerhalb von React (Timer, Promises) landen ebenfalls im Protokoll
window.addEventListener('error', (e) => api.app.logError('window', `${e.message}\n${e.error?.stack ?? ''}`))
window.addEventListener('unhandledrejection', (e) => api.app.logError('Promise', String(e.reason?.stack ?? e.reason)))

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary where="App" full>
    <App />
  </ErrorBoundary>
)
