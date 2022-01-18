import { join } from 'path'
import {defineNuxtModule, addServerMiddleware, extendViteConfig} from '@nuxt/kit'
import {addStartCliBadgeLink, getRoutes, waitForServer} from '@harlanzw/nuxt-kit-extras'
import type { RouteDefinition, UserConfig } from '@unlighthouse/core'
import { createUnlighthouse, useUnlighthouse } from '@unlighthouse/core'

export interface ModuleOptions extends UserConfig {

}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'nuxt-unlighthouse',
    configKey: 'unlighthouse',
  },
  async setup(data, nuxt) {
    // only run in dev
    if (!nuxt.options.dev)
      return

    const config = data as UserConfig

    const unlighthouse = useUnlighthouse() || await createUnlighthouse({
      router: {
        prefix: '/__unlighthouse',
      },
      ...config,
      root: nuxt.options.rootDir,
    }, {
      name: 'nuxt',
      routeDefinitions: () => getRoutes() as Promise<RouteDefinition[]>
    })

    // when we vite mode, the HTML is not server side rendered so we need to tell the scanner this
    // so that it will execute the javascript to fetch internal links
    extendViteConfig(() => {
      unlighthouse.resolvedConfig.scanner.skipJavascript = false
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
  },
})
