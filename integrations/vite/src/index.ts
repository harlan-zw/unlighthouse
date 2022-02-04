import type { UserConfig } from '@unlighthouse/core'
import { createUnlighthouse, useLogger, useUnlighthouse } from '@unlighthouse/core'
import once from 'lodash/once'
import { createServer } from '@unlighthouse/server'
import type { Plugin, ViteDevServer } from 'vite'

export default function VitePlugin(config: UserConfig = {}): Plugin {
  return {
    name: 'unlighthouse:vite',
    apply: 'serve',

    async configureServer(viteServer: ViteDevServer) {
      const unlighthouse = useUnlighthouse() || await createUnlighthouse({
        ...config,
        root: viteServer.config.root,
        router: {
          prefix: '/__unlighthouse',
        },
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
        setTimeout(async() => {
          const unlighthouse = useUnlighthouse()
          const logger = useLogger()
          unlighthouse.setSiteUrl(host)
          await unlighthouse.setServerContext({ url: server.url, server: server.server, app })

          logger.success(`⛵  Start Unlighthouse - http://${host}/__unlighthouse`)
        }, 300)
      })

      // may not be using the httpServer, such as the nuxt integration
      if (viteServer.httpServer) {
        viteServer.httpServer.on('listening', () => {
          let host: string = ''
          const address = viteServer.httpServer?.address()
          if (typeof address === 'string')
            host = address as string
          else if (address?.port)
            host = `localhost:${address.port}`

          if (host) {
            setHost(host)
          }
        })
      }
      else {
        // support manually setting the site or the site-changed hook for nuxt
        if (unlighthouse.resolvedConfig.site) {
          setHost(unlighthouse.resolvedConfig.site)
        }
        else {
          unlighthouse.hooks.hookOnce('site-changed', async() => {
            setHost(unlighthouse.resolvedConfig.site)
          })
        }
      }
    },
    handleHotUpdate(hmr) {
      const { worker } = useUnlighthouse()
      worker.invalidateFile(hmr.file)
    },
  }
}
