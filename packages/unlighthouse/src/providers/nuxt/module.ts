import { join, resolve } from 'path'
import { defineNuxtModule, addServerMiddleware, addVitePlugin, addWebpackPlugin } from '@nuxt/kit'
import NuxtModuleUtils from 'nuxt-kit-extras'
import {ResolvedUserConfig, UserConfig} from '@shared'
import { version } from '../../../package.json'
import unplugin from '../../index'
import { createUnlighthouse } from '../../core/engine'
import { defaultConfig, APP_NAME } from '../../core/config'

export const NUXT_CONFIG_KEY = 'lighthouse'

export default defineNuxtModule<UserConfig>(nuxt => ({
  name: APP_NAME,
  version,
  configKey: NUXT_CONFIG_KEY,
  defaults: defaultConfig,
  async setup(data) {
    const config = data as ResolvedUserConfig

    const { server } = nuxt

    if (!config.host)
      config.host = `http${server.https ? 's' : ''}://${server.host}:${server.port}`

    const { addMiddleware, addStartCliBadgeLink, getRoutes } = NuxtModuleUtils.call(nuxt)
    //
    addMiddleware({
      name: 'lighthouse-route-logger',
      src: resolve(join(__dirname, 'providers', 'nuxt', 'template', 'middleware', 'logRoute.js')),
      dst: 'lighthouse/logRoute.js',
      options: config,
    })

    nuxt.options.build.transpile.push('ohmyfetch')

    // @todo implement watcher
    // nuxt.hook('watch:restart', (event: WatchEvent, path: string) => {
    //   console.log('watch', event, path)
    // })
    //
    // nuxt.hook('bundler:change', (changedFileName) => {
    //   console.log('file change', changedFileName)
    // })

    // nuxt.hook('build:done', () => {
    //   console.log('ready hook')
    // })

    nuxt.options.ignore.push('.lighthouse')

    addStartCliBadgeLink(config.api.prefix, 'Routes')

    const engine = await createUnlighthouse({
      routeDefinitions: async() => await getRoutes(),
    }, config)

    addServerMiddleware({
      handler: engine.api,
    })

    await engine.start(nuxt.server.host)

    addWebpackPlugin(unplugin.webpack(config))
    addVitePlugin(unplugin.vite(config))
  },
}))
