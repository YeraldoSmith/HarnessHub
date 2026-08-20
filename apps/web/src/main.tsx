import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@harnesshub/ui/styles.css'
import './styles.css'
import { App } from './App.js'

const root = document.getElementById('root')

if (!root) {
  throw new Error('HarnessHub could not find the root element.')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
