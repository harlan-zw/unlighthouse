import { createUnplugin } from 'unplugin'
import type { UserConfig } from 'unlighthouse-utils'
import once from 'lodash/once'
import type { Compiler as WebpackCompiler } from 'webpack'
import type WebpackDevServer from 'webpack-dev-server'
import defu from 'defu'
import { APP_NAME, MODULE_ROUTER_PREFIX } from './core/constants'
import { useLogger } from './core/logger'
import { createUnlighthouse, useUnlighthouse } from './core/unlighthouse'
import { createServer } from './core/server'
import { normaliseHost } from './core/util'
import { createMockVueRouter } from './router'

const setupWebpack = once(async(config: any, compiler: WebpackCompiler) => {
  const logger = useLogger()
  if (compiler.options.mode !== 'development') {
    logger.debug(`Not starting ${APP_NAME}, webpack is not in development mode.`)
    return
  }

  // always register the HMR
  compiler.hooks.invalid.tap(APP_NAME, (resource) => {
    if (resource) {
      const { worker } = useUnlighthouse()
      worker.invalidateFile(resource)
    }
  })

  let unlighthouse = useUnlighthouse()
  // has already been booted, possibly nuxt
  if (unlighthouse)
    return

  unlighthouse = await createUnlighthouse({
    ...config,
    root: compiler.options.context,
    router: {
      prefix: MODULE_ROUTER_PREFIX,
    },
  }, {
    name: 'webpack',
  })

  const { server, app } = await createServer()
  unlighthouse.setServerContext({ url: server.url, server: server.server, app })

  const devServer: WebpackDevServer.Configuration = {
    proxy: {
      [unlighthouse.resolvedConfig.router.prefix]: server.url,
    },
    onListening(devServer: WebpackDevServer) {
      unlighthouse.resolvedConfig.host = normaliseHost(devServer.server.address()?.toString() || '')
      unlighthouse.setServerContext({ url: server.url, server: server.server, app })
    },
  }

  compiler.options.devServer = defu(compiler.options.devServer || {}, devServer)
})

export default createUnplugin<UserConfig>(config => ({
  name: APP_NAME,

  vite: {
    apply: 'serve',

    async configureServer(viteServer) {
      let unlighthouse = useUnlighthouse()
      // has already been booted, possibly nuxt
      if (unlighthouse)
        return

      unlighthouse = await createUnlighthouse({
        ...config,
        root: viteServer.config.root,
        router: {
          prefix: MODULE_ROUTER_PREFIX,
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
  },

  rollup: {
    watchChange(resource) {
      const unlighthouse = useUnlighthouse()
      if (unlighthouse)
        unlighthouse.worker.invalidateFile(resource)
    },
  },

  webpack: async(compiler: WebpackCompiler) => {
    setupWebpack(config, compiler)
  },
}))
