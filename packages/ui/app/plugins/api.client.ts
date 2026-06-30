import { createClient } from '@unlighthouse/core/api/client'
import { createStaticClient } from '@unlighthouse/core/api/static-client'

export default defineNuxtPlugin(() => {
  // Static (offline) report (#290): when the build embedded a snapshot, serve the
  // dashboard's read commands from it instead of the HTTP API. Same client shape,
  // so useApi() and every page are unchanged.
  const w = window as unknown as {
    __unlighthouse_static?: boolean
    __unlighthouse_payload?: { snapshot?: Parameters<typeof createStaticClient>[0] }
  }
  if (w.__unlighthouse_static && w.__unlighthouse_payload?.snapshot) {
    return { provide: { api: createStaticClient(w.__unlighthouse_payload.snapshot) } }
  }

  const config = useRuntimeConfig()
  const client = createClient({
    baseUrl: config.public.unlighthouseApiUrl as string,
  })
  return { provide: { api: client } }
})
