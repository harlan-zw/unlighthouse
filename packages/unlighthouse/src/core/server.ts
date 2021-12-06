import { createApp } from 'h3'
import { listen } from 'listhen'
import { useUnlighthouse } from './unlighthouse'

/**
 * Create a web server and web app to host the unlighthouse client and API on.
 *
 * Some providers, such as Nuxt, do not need this, so this can be safely tree-shaken.
 */
export const createServer = async() => {
  const { resolvedConfig } = useUnlighthouse()

  const app = createApp()
  const server = await listen(app, {
    ...resolvedConfig.server,
    // delay opening the server until the app is ready
    open: false,
  })
  return { app, server }
}
