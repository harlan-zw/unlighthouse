import type http from 'http'
import type https from 'https'
import type { ResolvedUnpluginOptions, UnpluginOptions } from 'unplugin'
import { createUnplugin } from 'unplugin'
import { once } from 'lodash-es'
import type { Compiler as WebpackCompiler } from 'webpack'
import type { UserConfig } from '@unlighthouse/core'
import { createUnlighthouse, useLogger, useUnlighthouse } from '@unlighthouse/core'
import { createServer } from '@unlighthouse/server'

const PLUGIN_NAME = 'unlighthouse:webpack'

const setupWebpack = once(async(config: any, compiler: WebpackCompiler) => {
  const logger = useLogger()
  logger.debug('Setting up unlighthouse webpack plugin.')

  if (compiler.options.mode !== 'development') {
    logger.debug('Not starting unlighthouse, webpack is not in development mode.')
    return
  }

  const linkUnlighthouse = once(() => {
    const unlighthouse = useUnlighthouse()
    logger.success(`⛵  Start Unlighthouse - ${unlighthouse.runtimeSettings.clientUrl}`)
  })

  compiler.hooks.done.tap('unlighthouse', linkUnlighthouse)

  // always register the HMR
  compiler.hooks.invalid.tap(PLUGIN_NAME, (resource) => {
    if (!resource)
      return

    const { worker } = useUnlighthouse()
    worker.invalidateFile(resource)
  })

  const ensureUnlighthouse = async() => {
    const unlighthouse = useUnlighthouse()
    // has already been booted, possibly nuxt
    if (unlighthouse)
      return unlighthouse

    return await createUnlighthouse({
      ...config,
      root: compiler.options.context,
    }, {
      name: 'webpack',
    })
  }

  const unlighthouse = await ensureUnlighthouse()

  const setupServer = async() => {
    const ensureServer = async(): Promise<http.Server | https.Server | any> => {
      // server may already be set
      if (unlighthouse.runtimeSettings.server)
        return unlighthouse.runtimeSettings.server

      // otherwise, create it
      const { server, app } = await createServer()
      await unlighthouse.setServerContext({ url: server.url, server: server.server, app })
      return server
    }

    await ensureServer()
  }

  if (unlighthouse.resolvedConfig.site) {
    await setupServer()
  }
  else {
    unlighthouse.hooks.hookOnce('site-changed', async() => {
      await setupServer()
    })
  }
})

export default function WebpackPlugin(
  configOrPath?: UserConfig | string,
) {
  return createUnplugin(() => {
    return <UnpluginOptions>{
      name: 'unlighthouse:webpack',
      webpack(compiler) {
        setupWebpack(configOrPath, compiler)
      },
    } as Required<ResolvedUnpluginOptions>
  }).webpack()
}
