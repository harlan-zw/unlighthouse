import { Plugin } from 'vite'
import { UserConfig } from '@unlighthouse/core'

export function defineConfig(config: UserConfig) {
  return config
}

export default function UnlighthousePlugin(
    configOrPath?: UserConfig | string,
): Plugin[] {
  const ctx = createContext<VitePluginConfig>(configOrPath, defaults)
  const inlineConfig = (configOrPath && typeof configOrPath !== 'string') ? configOrPath : {}
  const mode = inlineConfig.mode ?? 'global'

  const plugins = [
    (ctx) => {
      return {
        apply: 'serve',

        async configureServer(viteServer) {
          viteServer.httpServer?.address()

          let unlighthouse = useUnlighthouse()
          // has already been booted, possibly nuxt
          if (unlighthouse)
            return

          unlighthouse = await createUnlighthouse({
            ...config,
            root: viteServer.config.root,
            router: {
              prefix: DefaultModuleRouterPrefix,
            },
            scanner: {
              isHtmlSSR: false,
            },
          }, {
            name: 'vite',
          })

          const { server, app } = await createServer()
          if (!viteServer.config.server.proxy)
            viteServer.config.server.proxy = {}

          viteServer.config.server.proxy[unlighthouse.resolvedConfig.router.prefix] = server.url

          const setHost = once((host) => {
            unlighthouse.resolvedConfig.host = normaliseHost(host)
            unlighthouse.setServerContext({ url: server.url, server: server.server, app })
          })

          // wait until the user visits a page so we can capture the host
          // @todo find a less hacky solution
          viteServer.middlewares.use(async(req, res, next) => {
            const host = req.headers.host || ''
            // make sure we don't match the proxy request
            if (!host.startsWith(unlighthouse.resolvedConfig.router.prefix))
              setHost(req.headers.host || '')

            next()
          })

          unlighthouse.hooks.hookOnce('route-definitions-provided', (routeDefinitions) => {
            unlighthouse.provider.routeDefinitions = routeDefinitions
            // create a vue-router instance to figure out the path
            unlighthouse.provider.mockRouter = createMockVueRouter(routeDefinitions)
          })
        },
        handleHotUpdate(hmr) {
          const unlighthouse = useUnlighthouse()
          if (unlighthouse)
            unlighthouse.worker.invalidateFile(hmr.file)
        },
      }
    },
  ]

  return plugins.filter(Boolean) as Plugin[]
}
