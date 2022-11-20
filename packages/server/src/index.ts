import type { App } from 'h3'
import { createApp, toNodeListener } from 'h3'
import type { ListenOptions, Listener } from 'listhen'
import { listen } from 'listhen'
import { useUnlighthouse } from '@unlighthouse/core'

/**
 * Create a web server and web app to host the unlighthouse client and API on.
 *
 * Some providers, such as Nuxt, do not need this, so this can be safely tree-shaken.
 */
export async function createServer(): Promise<{ app: App; server: Listener }> {
  const { resolvedConfig } = useUnlighthouse()

  const app = createApp()
  const server = await listen(toNodeListener(app), {
    ...resolvedConfig.server,
    // delay opening the server until the app is ready
    open: false,
  })
  return { app, server }
}

declare module '@unlighthouse/core' {
  interface ResolvedUserConfig {
    /**
         * Change the behaviour of the server. The server is not always created, only when the integration can't provide one.
         *
         * For example Nuxt does not use a server but the CLI does.
         */
    server: Partial<ListenOptions>
  }
}
