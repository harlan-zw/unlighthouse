import { createUnplugin } from 'unplugin'
import type {RouteDefinition, UserConfig} from 'unlighthouse-utils'
import {APP_NAME, MODULE_ROUTER_PREFIX} from './core/constants'
import { useLogger } from './core/logger'
import {createUnlighthouse, useUnlighthouse} from "./core/unlighthouse";
import {createServer} from "./core/server";
import { createRouter, createMemoryHistory } from 'vue-router'

export default createUnplugin<UserConfig>((config, meta) => ({
  name: APP_NAME,


  /*async buildEnd() {
    // nuxt leverages the in-built server and has it's own logic
    if (unlighthouse.provider.name === 'nuxt') {
      return
    }
    const unlighthouse = useUnlighthouse() || await createUnlighthouse(config || {})

    const { server, app } = await createServer()
    unlighthouse.setServerContext({ url: server.url, server: server.server, app })

    // only start once user visits the page
    unlighthouse.hooks.hookOnce('visited-client', () => {
      unlighthouse.start()
    })
  },*/

  vite: {
    apply: 'serve',

    configResolved(config) {
      if (!config.server.proxy) {
        config.server.proxy = {}
      }
      config.server.proxy['/__unlighthouse'] = 'http://localhost:3000'
    },
    configureServer(viteServer) {

      const ensureUnlighthouse = async (host: string) =>{
        const preInited = useUnlighthouse()
        if (preInited) {
          return preInited
        }
        const unlighthouse = await createUnlighthouse({
          host: host,
          cacheReports: false,
          root: viteServer.config.root,
          router: {
            prefix: '/__unlighthouse',
          },
          scanner: {
            isHtmlSSR: false,
          },
          debug: true,
        }, {
          name: 'vite',
        })
        unlighthouse.hooks.hookOnce('route-definitions-provided', (routeDefinitions) => {
          unlighthouse.provider.routeDefinitions = routeDefinitions
          // create a vue-router instance to figure out the path
          const router = createRouter({
            history: createMemoryHistory(),
            routes: routeDefinitions
          })
          unlighthouse.provider.mockRouter = {
            match(path) {
              const { name } = router.resolve(path) as RouteDefinition
              return routeDefinitions.filter(d => d.name === name)[0]
            }
          }
        })

        const { server, app } = await createServer()
        unlighthouse.setServerContext({ url: server.url, server: server.server, app })

        unlighthouse.hooks.hookOnce('visited-client', () => {
          unlighthouse.start()
        })
        return unlighthouse
      }

      viteServer.middlewares.use(async (req, res, next) => {
        await ensureUnlighthouse(`http://${req.headers.host}`)
        next()
        /*
        console.log(req.url)
        if (req.url?.startsWith('/__unlighthouse')) {
          const {api} = await ensureUnlighthouse(`http://${req.headers.host}`)
          return api(req, res, next)
        }
        next()
         */
      })
    },
    handleHotUpdate(hmr) {
      const { worker } = useUnlighthouse()
      worker.invalidateFile(hmr.file)
    },
  },

  rollup: {
    watchChange(resource) {
      const { worker } = useUnlighthouse()
      worker.invalidateFile(resource)
    },
  },

  webpack: (compiler) => {
    const logger = useLogger()
    if (meta.framework === 'webpack' && compiler.options.mode !== 'development') {
      logger.debug(`Not starting ${APP_NAME}, wepback is not in development mode.`)
      return
    }
    compiler.hooks.invalid.tap(APP_NAME, (resource?: string) => {
      if (resource) {
        const { worker } = useUnlighthouse()
        worker.invalidateFile(resource)
      }
    })
  },
}))
