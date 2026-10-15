import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createHttpClient, type Client } from './api.ts'
import { App } from './App.tsx'
import { applyTheme, readTheme } from './theme.ts'

applyTheme(readTheme())

async function boot(): Promise<void> {
  const root = document.getElementById('root')
  if (!root)
    return
  let client: Client
  if (new URLSearchParams(location.search).has('mock')) {
    const { createMockClient } = await import('./mock.ts')
    client = createMockClient()
  }
  else {
    client = createHttpClient()
  }
  createRoot(root).render(
    <StrictMode>
      <App client={client} />
    </StrictMode>,
  )
}

void boot()
