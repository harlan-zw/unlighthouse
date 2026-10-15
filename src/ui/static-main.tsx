import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { enableHashRouting } from './router.tsx'
import { createStaticClient, type Snapshot } from './static.ts'
import { applyTheme, readTheme } from './theme.ts'

declare global {
  interface Window {
    UNLIGHTHOUSE_SNAPSHOT?: Snapshot
  }
}

applyTheme(readTheme())
enableHashRouting()

const root = document.getElementById('root')
const snapshot = window.UNLIGHTHOUSE_SNAPSHOT
if (root && snapshot) {
  if (!location.hash.startsWith('#/'))
    location.replace(`#/scans/${encodeURIComponent(snapshot.scanId)}`)
  createRoot(root).render(
    <StrictMode>
      <App client={createStaticClient(snapshot)} />
    </StrictMode>,
  )
}
else if (root) {
  root.textContent = 'The report data (data.js) did not load. Keep index.html, data.js and the assets folder together.'
}
