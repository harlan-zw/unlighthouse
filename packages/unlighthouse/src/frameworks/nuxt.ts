import { join } from 'path'
import { defineNuxtModule, addServerMiddleware, extendViteConfig, addWebpackPlugin, addVitePlugin } from '@nuxt/kit-edge'
import { addStartCliBadgeLink, waitForRoutes, waitForServer } from 'nuxt-kit-extras'
import type { RouteDefinition, UserConfig } from 'unlighthouse-utils'
import { version } from '../../package.json'
import { createUnlighthouse, useUnlighthouse } from '../core/unlighthouse'
import { APP_NAME, MODULE_ROUTER_PREFIX } from '../core/constants'
import unplugin from '../index'

export default defineNuxtModule<UserConfig>(nuxt => ({
  name: APP_NAME,
  version,
  configKey: APP_NAME,
  async setup(data) {
    // only run in dev
    if (!nuxt.options.dev)
      return

    const config = data as UserConfig

    const routeDefinitions = waitForRoutes() as Promise<RouteDefinition[]>
    const unlighthouse = useUnlighthouse() || await createUnlighthouse({
      ...config,
      root: nuxt.options.rootDir,
      router: {
        prefix: MODULE_ROUTER_PREFIX,
      },
      debug: true,
    }, {
      name: 'nuxt',
      routeDefinitions: () => routeDefinitions,
    })

    // when we vite mode, the HTML is not server side rendered so we need to tell the scanner this
    // so that it will execute the javascript to fetch internal links
    extendViteConfig(() => {
      unlighthouse.resolvedConfig.scanner.isHtmlSSR = false
    })

    // watch config file
    if (unlighthouse.runtimeSettings.configFile)
      nuxt.options.watch.push(unlighthouse.runtimeSettings.configFile)

    addStartCliBadgeLink(unlighthouse.resolvedConfig.router.prefix, '⛵  Unlighthouse')

    addServerMiddleware({
      path: config.router?.prefix,
      handler(req: any, sr: any, next: any) {
        const { api } = useUnlighthouse()
        return api(req, sr, next)
      },
    })

    waitForServer()
      .then((ctx) => {
        const engine = useUnlighthouse()
        if (!ctx.listeners[0])
          return

        // for nuxt we can fully leverage the dev middleware server
        engine.setServerContext({
          url: ctx.listeners[0].url,
          server: ctx.listeners[0].server,
          app: ctx.app,
        })
      })

    nuxt.options.ignore.push(join(unlighthouse.resolvedConfig.outputPath, '**'))

    addWebpackPlugin(unplugin.webpack())
    addVitePlugin(unplugin.vite())
  },
}))
