import { createApp, toNodeListener } from 'h3'
import { listen } from 'listhen'
import { useUnlighthouse } from '@unlighthouse/core'

/**
 * Create a web server and web app to host the unlighthouse client and API on.
 *
 * Some providers, such as Nuxt, do not need this, so this can be safely tree-shaken.
 */
export async function createServer() {
  const { resolvedConfig } = useUnlighthouse()

  const app = createApp()
  const server = await listen(toNodeListener(app), {
    // @ts-expect-error untyped
    ...resolvedConfig.server,
    // delay opening the server until the app is ready
    open: false,
  })
  return { app, server }
}
