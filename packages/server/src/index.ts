import { useUnlighthouse } from '@unlighthouse/core'
import { createApp, defineEventHandler, toNodeListener } from 'h3'
import { listen } from 'listhen'

/**
 * Create a web server and web app to host the unlighthouse client and API on.
 *
 * Some providers, such as Nuxt, do not need this, so this can be safely tree-shaken.
 */
export async function createServer(): Promise<{ app: any, server: any }> {
  const { resolvedConfig } = useUnlighthouse()

  const app = createApp()

  // Add CORS headers for dev mode
  app.use(defineEventHandler((event) => {
    event.node.res.setHeader('Access-Control-Allow-Origin', '*')
    event.node.res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    event.node.res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (event.node.req.method === 'OPTIONS') {
      event.node.res.statusCode = 204
      event.node.res.end()
    }
  }))
  const server = await listen(toNodeListener(app), {
    // @ts-expect-error untyped
    ...resolvedConfig.server,
    // delay opening the server until the app is ready
    open: false,
  })
  return { app, server }
}
