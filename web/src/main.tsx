import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/geist-mono'
import '@fontsource-variable/inter'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { loadAuth } from './lib/auth'
import './index.css'

void loadAuth() // há login com Google no servidor? quem está logado?

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
