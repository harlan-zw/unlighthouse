import { createClient } from '@unlighthouse/contracts/client'
import { createStaticClient } from '@unlighthouse/core/api/static-client'

export default defineNuxtPlugin(() => {
  // Static (offline) report (#290): when the build embedded a snapshot, serve the
  // dashboard's read commands from it instead of the HTTP API. Same client shape,
  // so useApi() and every page are unchanged.
  if (window.__unlighthouse_static && window.__unlighthouse_payload?.snapshot) {
    return { provide: { api: createStaticClient(window.__unlighthouse_payload.snapshot) } }
  }

  const client = createClient({
    baseUrl: getRuntimeApiUrl(),
  })
  return { provide: { api: client } }
})
