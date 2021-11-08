import { join, resolve } from 'path'
import {addServerMiddleware, addVitePlugin, addWebpackPlugin, requireModulePkg} from '@nuxt/kit'
import { $fetch } from 'ohmyfetch'
import NuxtModuleUtils from 'nuxt-kit-extras'
import { Options } from './types'
import {defaultOptions, formatBytes, NAME, NUXT_CONFIG_KEY, PLUGIN_PATH_PREFIX} from './core'
import unplugin from './index'
import {
  defineNuxtModule,
} from '@nuxt/kit'
import { version } from '../package.json'
import { createEngine } from './node/engine'

export default defineNuxtModule<Options>(nuxt => ({
  name: NAME,
  version,
  configKey: NUXT_CONFIG_KEY,
  defaults: defaultOptions,
  async setup(data) {

    const options = data as Options

    const { rootDir, server } = nuxt

    if (!options.host) {
      options.host = `http${server.https ? 's' : ''}://${server.host}:${server.port}`
    }

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

    addStartCliBadgeLink(PLUGIN_PATH_PREFIX, 'Routes')

    const { api } = createEngine({
      routes: getRoutes,
      async stats() {
        const routes = await getRoutes()
        let appBytes = '0B'
        try {
          const { headers } = await $fetch.raw('http://localhost:3000/_nuxt/app.js')
          appBytes = formatBytes(Number.parseInt(headers.get('content-length') || '0'))
        }
        catch (e) {
          // do nothing
        }

        let vendorBytes = '0B'
        try {
          const { headers } = await $fetch.raw('http://localhost:3000/_nuxt/vendors/app.js')
          vendorBytes = formatBytes(Number.parseInt(headers.get('content-length') || '0'))
        }
        catch (e) {
          // do nothing
        }

        let commonsBytes = '0B'
        try {
          const { headers } = await $fetch.raw('http://localhost:3000/_nuxt/commons/app.js')
          commonsBytes = formatBytes(Number.parseInt(headers.get('content-length') || '0'))
        }
        catch (e) {
          // do nothing
        }
        const runtimeModuleCount = nuxt.options.modules.length
        const buildModuleCount = nuxt.options.buildModules.length

        return {
          runtimeModuleCount,
          buildModuleCount,
          framework: [
            {
              id: 'nuxt',
              name: 'Nuxt.js',
              version: requireModulePkg('nuxt').version,
            },
            {
              id: 'vue',
              name: 'Vue.js',
              version: requireModulePkg('vue').version,
            },
            {
              id: 'windicss',
              icon: 'simple-icons-windicss',
              name: 'WindiCSS',
              version: requireModulePkg('windicss').version,
            },
          ],
          staticRoutes: routes.filter(route => !route.path.includes(':')).length,
          dynamicRoutes: routes.filter(route => route.path.includes(':')).length,
          // runningTasks: runningTasks(),
          modules: {
            app: {
              size: appBytes,
            },
            vendor: {
              size: vendorBytes,
            },
            commons: {
              size: commonsBytes,
            },
          },
        }
      },
    }, options)

    addServerMiddleware({
      handler: api,
    })

    addWebpackPlugin(unplugin.webpack(options))
    addVitePlugin(unplugin.vite(options))
  },
})
