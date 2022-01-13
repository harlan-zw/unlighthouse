import type { UserConfig } from '@unlighthouse/core'
import open from 'open'
import { createUnlighthouse, useLogger } from '@unlighthouse/core'
import { createServer } from '@unlighthouse/server'
import { pick } from 'lodash-es'
import { validateOptions } from './util'
import type { CliOptions } from './types'
import createCli from './createCli'

const cli = createCli()

const { options } = cli.parse() as unknown as { options: CliOptions }

async function run() {
  const start = new Date()
  if (options.help || options.version)
    return

  // allow site alias
  if (options.site)
    options.host = options.site

  const resolvedOptions: UserConfig = pick(options, ['host', 'root', 'configFile', 'debug'])

  const unlighthouse = await createUnlighthouse(resolvedOptions, { name: 'cli' })

  validateOptions(unlighthouse.resolvedConfig)

  const { server, app } = await createServer()
  await unlighthouse.setServerContext({ url: server.url, server: server.server, app })
  await unlighthouse.start()

  unlighthouse.hooks.hook('worker-finished', () => {
    const end = new Date()
    const logger = useLogger()

    const seconds = Math.round((end.getTime() - start.getTime()) / 1000)
    logger.info(`Unlighthouse has finished scanning \`${unlighthouse.resolvedConfig.host}\`: ${unlighthouse.worker.reports().length} routes in \`${seconds}s\`.`)
  })

  if (unlighthouse.resolvedConfig.server.open)
    await open(unlighthouse.runtimeSettings.clientUrl)
}

run()
