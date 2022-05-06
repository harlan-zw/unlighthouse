import type { UserConfig } from '@unlighthouse/core'
import type { Plugin, ViteDevServer } from 'vite'
import { once } from './util'

export default function VitePlugin(config: UserConfig = {}): Plugin {
  let bail = false
  return {
    name: 'unlighthouse:vite',
    apply: 'serve',

    configResolved(config) {
      // only run in development and serve
      if (config.command !== 'serve' || config.isProduction)
        bail = true
    },

    async configureServer(viteServer: ViteDevServer) {
      if (bail)
        return

      const { createUnlighthouse, useLogger, useUnlighthouse } = await import('@unlighthouse/core')
      const { createServer } = await import('@unlighthouse/server')

      const unlighthouse = useUnlighthouse() || await createUnlighthouse({
        ...config,
        root: viteServer.config.root,
        routerPrefix: '/__unlighthouse',
        scanner: {
          skipJavascript: false,
        },
      }, {
        name: 'vite',
      })

      const { server, app } = await createServer()
      if (!viteServer.config.server.proxy)
        viteServer.config.server.proxy = {}

      viteServer.config.server.proxy['/__unlighthouse'] = server.url

      unlighthouse.hooks.hookOnce('route-definitions-provided', (routeDefinitions) => {
        unlighthouse.provider.routeDefinitions = routeDefinitions
      })

      const setHost = once((host) => {
        // give vite a chance to display start messages
        setTimeout(async () => {
          const unlighthouse = useUnlighthouse()
          const logger = useLogger()
          unlighthouse.setSiteUrl(host)
          await unlighthouse.setServerContext({ url: server.url, server: server.server, app })

          logger.success(`⛵  Start Unlighthouse - ${server.url}`)
        }, 300)
      })

      // may not be using the httpServer, such as the nuxt integration
      if (viteServer.httpServer) {
        viteServer.httpServer.on('listening', () => {
          let host = ''
          const address = viteServer.httpServer?.address()
          if (typeof address === 'string')
            host = address as string
          else if (address?.port)
            host = `http://localhost:${address.port}`

          if (host)
            setHost(host)
        })
      }
      else {
        // support manually setting the site or the site-changed hook for nuxt
        if (unlighthouse.resolvedConfig.site) {
          setHost(unlighthouse.resolvedConfig.site)
        }
        else {
          unlighthouse.hooks.hookOnce('site-changed', async () => {
            setHost(unlighthouse.resolvedConfig.site)
          })
        }
      }
    },
    async handleHotUpdate(hmr) {
      const { useUnlighthouse } = await import('@unlighthouse/core')
      const { worker } = useUnlighthouse()
      worker.invalidateFile(hmr.file)
    },
  }
}
