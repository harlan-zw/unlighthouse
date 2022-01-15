import open from 'open'
import { createUnlighthouse, useLogger } from '@unlighthouse/core'
import { createServer } from '@unlighthouse/server'
import { pickOptions, validateOptions } from './util'
import type { CliOptions } from './types'
import createCli from './createCli'

const cli = createCli()

const { options } = cli.parse() as unknown as { options: CliOptions }

async function run() {
  const start = new Date()
  if (options.help || options.version)
    return

  const unlighthouse = await createUnlighthouse(
    pickOptions(options),
    { name: 'cli' },
  )

  validateOptions(unlighthouse.resolvedConfig)

  const { server, app } = await createServer()
  await unlighthouse.setServerContext({ url: server.url, server: server.server, app })
  await unlighthouse.start()

  unlighthouse.hooks.hook('worker-finished', () => {
    const end = new Date()
    const seconds = Math.round((end.getTime() - start.getTime()) / 1000)
    const logger = useLogger()

    logger.success(`Unlighthouse has finished scanning \`${unlighthouse.resolvedConfig.site}\`: ${unlighthouse.worker.reports().length} routes in \`${seconds}s\`.`)
  })

  if (unlighthouse.resolvedConfig.server.open)
    await open(unlighthouse.runtimeSettings.clientUrl)
}

run()
