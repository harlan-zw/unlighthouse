import { defineNuxtModule, addVitePlugin, addWebpackPlugin, addServerMiddleware } from '@nuxt/kit-edge'
import { addStartCliBadgeLink, waitForRoutes, waitForServer } from 'nuxt-kit-extras'
import type { RouteDefinition, UserConfig } from 'unlighthouse-utils'
import { version } from '../package.json'
import { join } from 'path'
import unplugin from './index'
import { createUnlighthouse, useUnlighthouse } from './core/unlighthouse'
import { APP_NAME, MODULE_ROUTER_PREFIX } from './core/constants'

export default defineNuxtModule<UserConfig>(nuxt => ({
  name: APP_NAME,
  version,
  configKey: APP_NAME,
  async setup(data) {
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
      routeDefinitions: () => routeDefinitions,
    })

    addStartCliBadgeLink(unlighthouse.resolvedConfig.router.prefix, '⛵  Unlighthouse')

    // only start once user visits the page
    unlighthouse.hooks.hookOnce('visited-client', () => {
      unlighthouse.start()
    })

    addServerMiddleware({
      path: config.router?.prefix,
      handler(req: any, sr: any, next: any) {
        const { api } = useUnlighthouse()
        return api(req, sr, next)
      },
    })

    waitForServer()
      .then((server) => {
        const engine = useUnlighthouse()
        if (!server.listeners[0])
          return

        engine.setServerContext(server.listeners[0])
      })

    nuxt.options.ignore.push(join(unlighthouse.resolvedConfig.outputPath, '**'))

    addWebpackPlugin(unplugin.webpack(unlighthouse))
    addVitePlugin(() => {
      const engine = useUnlighthouse()
      engine.resolvedConfig.scanner.isHtmlSSR = false
      return unplugin.vite(unlighthouse)
    })
  },
}))
