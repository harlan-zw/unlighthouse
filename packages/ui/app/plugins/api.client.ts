import type { StaticSnapshot } from '@unlighthouse/core/api/static-client'
import { createClient } from '@unlighthouse/core/api/client'

export default defineNuxtPlugin(async () => {
  // Static (offline) report (#290): when the build embedded a snapshot, serve the
  // dashboard's read commands from it instead of the HTTP API. Same client shape,
  // so useApi() and every page are unchanged.
  //
  // createStaticClient pulls the full handler graph — which includes node-only
  // modules (git-meta's node:child_process). Import it LAZILY, only inside a real
  // static report, so it never enters the live client bundle (otherwise the dev
  // server chokes on the browser-externalized node: stub).
  if (import.meta.client) {
    const w = window as unknown as {
      __unlighthouse_static?: boolean
      __unlighthouse_payload?: { snapshot?: StaticSnapshot }
    }
    if (w.__unlighthouse_static && w.__unlighthouse_payload?.snapshot) {
      const { createStaticClient } = await import('@unlighthouse/core/api/static-client')
      return { provide: { api: createStaticClient(w.__unlighthouse_payload.snapshot) } }
    }
  }

  const config = useRuntimeConfig()
  const client = createClient({
    baseUrl: config.public.unlighthouseApiUrl as string,
  })
  return { provide: { api: client } }
})
