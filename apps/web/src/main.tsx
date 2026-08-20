import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { I18nProvider } from '@harnesshub/i18n'
import '@harnesshub/ui/styles.css'
import './styles.css'
import { App } from './App.js'

const root = document.getElementById('root')

if (!root) {
  throw new Error('HarnessHub could not find the root element.')
}

createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
)
