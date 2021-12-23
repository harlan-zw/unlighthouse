import { UserConfig } from '@unlighthouse/types'
import { createUnplugin, ResolvedUnpluginOptions, UnpluginOptions } from 'unplugin'
import { once } from 'lodash-es'
import { Compiler as WebpackCompiler } from 'webpack'
import type WebpackDevServer from 'webpack-dev-server'
import defu from 'defu'
import { createUnlighthouse, useLogger, useUnlighthouse } from '@unlighthouse/core'
import { createServer } from '@unlighthouse/server'
import { normaliseHost } from '@unlighthouse/core/src/util'

const PLUGIN_NAME = 'unlighthouse:webpack'

export default function WebpackPlugin(
  configOrPath?: UserConfig | string,
) {
  return createUnplugin(() => {
    const setupWebpack = once(async(config: any, compiler: WebpackCompiler) => {
      const logger = useLogger()
      if (compiler.options.mode !== 'development') {
        logger.debug('Not starting unlighthouse, webpack is not in development mode.')
        return
      }

      // always register the HMR
      compiler.hooks.invalid.tap(PLUGIN_NAME, (resource) => {
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
          prefix: '/__unlighthouse',
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

    return <UnpluginOptions>{
      name: 'unlighthouse:webpack',
      webpack(compiler) {
        setupWebpack(configOrPath, compiler)
      },
    } as Required<ResolvedUnpluginOptions>
  }).webpack()
}
