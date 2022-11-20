import { join } from 'path'
import {
  addVitePlugin,
  addWebpackPlugin,
  defineNuxtModule,
  extendViteConfig,
} from '@nuxt/kit'
import type { UserConfig } from '@unlighthouse/core'
import { createUnlighthouse, useUnlighthouse } from '@unlighthouse/core'
import { waitForDevServer, waitForRoutes } from '@harlanzw/nuxt-kit-extras'
import WebpackPlugin from '@unlighthouse/webpack'
import VitePlugin from '@unlighthouse/vite'

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
      ...config,
      root: nuxt.options.rootDir,
    }, {
      name: 'nuxt',
      // @ts-expect-error nuxt has multiple definitions for the routes
      routeDefinitions: () => routePromise,
    })

    // when we vite mode, the HTML is not server side rendered so we need to tell the scanner this
    // so that it will execute the javascript to fetch internal links
    extendViteConfig(() => {
      unlighthouse.resolvedConfig.scanner.skipJavascript = false
    })

    const pluginOptions = {
      dev: true,
      server: true,
    }
    addVitePlugin(VitePlugin(config), pluginOptions)
    addWebpackPlugin(WebpackPlugin(config), pluginOptions)

    // watch config file
    // if (unlighthouse.runtimeSettings.configFile)
    //   nuxt.options.watch.push(unlighthouse.runtimeSettings.configFile)

    waitForDevServer()
      .then(async ({ listener }) => {
        const { setSiteUrl } = useUnlighthouse()

        setSiteUrl(listener.url)
      })

    nuxt.options.ignore.push(join(unlighthouse.resolvedConfig.outputPath))
  },
})
