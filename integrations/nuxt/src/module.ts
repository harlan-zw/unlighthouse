import { join } from 'path'
import {defineNuxtModule, addServerMiddleware, extendViteConfig, useNuxt } from '@nuxt/kit'
import type { RouteDefinition, UserConfig } from '@unlighthouse/core'
import { createUnlighthouse, useUnlighthouse, useLogger } from '@unlighthouse/core'

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

    const routes = new Promise<RouteDefinition[]>(resolve => {
      nuxt.hooks.hook('pages:extend', pages => {
        resolve(pages as RouteDefinition[])
      })
    })

    const unlighthouse = useUnlighthouse() || await createUnlighthouse({
      router: {
        prefix: '/__unlighthouse',
      },
      ...config,
      root: nuxt.options.rootDir,
    }, {
      name: 'nuxt',
      routeDefinitions: () => routes
    })

    // when we vite mode, the HTML is not server side rendered so we need to tell the scanner this
    // so that it will execute the javascript to fetch internal links
    extendViteConfig(() => {
      unlighthouse.resolvedConfig.scanner.skipJavascript = false
    })

    // watch config file
    if (unlighthouse.runtimeSettings.configFile)
      nuxt.options.watch.push(unlighthouse.runtimeSettings.configFile)


    addServerMiddleware({
      path: config.router?.prefix,
      handler(req: any, sr: any, next: any) {
        const { api } = useUnlighthouse()
        return api(req, sr, next)
      },
    })

    nuxt.hooks.hook('listen', async (server, listener) => {
      const engine = useUnlighthouse()
      const nuxtApp = useNuxt()
      // for nuxt we can fully leverage the dev middleware server
      await engine.setServerContext({
        url: listener.url,
        server: server,
        app: nuxtApp.server.app,
      })
      const logger = useLogger()
      logger.success('⛵  Unlighthouse ready:' + engine.runtimeSettings.clientUrl)
    })

    nuxt.options.ignore.push(join(unlighthouse.resolvedConfig.outputPath, '**'))
  },
})
