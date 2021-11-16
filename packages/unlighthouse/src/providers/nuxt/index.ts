import { join, resolve } from 'path'
import { defineNuxtModule, addServerMiddleware, addVitePlugin, addWebpackPlugin } from '@nuxt/kit'
import NuxtModuleUtils from 'nuxt-kit-extras'
import { Options } from '@shared'
import { version } from '../../../package.json'
import unplugin from './index'
import { defaultOptions, NAME, createEngine } from '~/core'

export const NUXT_CONFIG_KEY = 'lighthouse'

export default defineNuxtModule<Options>(nuxt => ({
  name: NAME,
  version,
  configKey: NUXT_CONFIG_KEY,
  defaults: defaultOptions,
  async setup(data) {
    const options = data as Options

    const { rootDir, server } = nuxt

    if (!options.host)
      options.host = `http${server.https ? 's' : ''}://${server.host}:${server.port}`

    const { addMiddleware, addStartCliBadgeLink, getRoutes } = NuxtModuleUtils.call(nuxt)
    //
    addMiddleware({
      name: 'lighthouse-route-logger',
      src: resolve(join(__dirname, 'providers', 'nuxt', 'template', 'middleware', 'logRoute.js')),
      dst: 'lighthouse/logRoute.js',
      options,
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

    addStartCliBadgeLink(options.clientPrefix, 'Routes')

    const { api } = await createEngine({
      routeDefinitions: async() => await getRoutes(),
    }, options)

    addServerMiddleware({
      handler: api,
    })

    addWebpackPlugin(unplugin.webpack(options))
    addVitePlugin(unplugin.vite(options))
  },
}))
