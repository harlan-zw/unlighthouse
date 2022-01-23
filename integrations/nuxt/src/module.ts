import { join } from 'path'
import {defineNuxtModule, addServerMiddleware, extendViteConfig, useNuxt } from '@nuxt/kit'
import type { UserConfig } from '@unlighthouse/core'
import { createUnlighthouse, useUnlighthouse, useLogger } from '@unlighthouse/core'
import {waitForRoutes, waitForDevServer} from "@harlanzw/nuxt-kit-extras";

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

    const routePromise = waitForRoutes()

    const unlighthouse = useUnlighthouse() || await createUnlighthouse({
      router: {
        prefix: '/__unlighthouse',
      },
      ...config,
      root: nuxt.options.rootDir,
    }, {
      name: 'nuxt',
      // @ts-ignore
      routeDefinitions: async () => await routePromise
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

    waitForDevServer().then(async ({ listenerServer, listener }) => {
      const engine = useUnlighthouse()
      const nuxtApp = useNuxt()
      // for nuxt we can fully leverage the dev middleware server
      await engine.setServerContext({
        url: listener.url,
        server: listenerServer,
        app: nuxtApp.server.app,
      })
      const logger = useLogger()
      logger.success('⛵  Unlighthouse ready: ' + engine.runtimeSettings.clientUrl)
    })

    nuxt.options.ignore.push(join(unlighthouse.resolvedConfig.outputPath, '**'))
  },
})
