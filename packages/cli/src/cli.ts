import cac from 'cac'
import type { UserConfig } from '@unlighthouse/core'
import open from 'open'
import { createUnlighthouse, normaliseHost, useLogger } from '@unlighthouse/core'
import { createServer } from '@unlighthouse/server'
import { pick } from 'lodash-es'
import { version } from '../package.json'
import { validateOptions } from './util'
import type { CliOptions } from './types'

const cli = cac('unlighthouse')

cli
  .help()
  .version(version)
  .option('--host <host>', 'Host')
  .option('--root <root>', 'Root')
  .option('--config-file <config-file>', 'Config File')
  .option('--debug', 'Debug')

const { options } = cli.parse() as unknown as { options: CliOptions }

async function run() {
  if (options.help)
    return

  const resolvedOptions: UserConfig = pick(options, ['host', 'root', 'configFile', 'debug'])

  resolvedOptions.host = normaliseHost(resolvedOptions.host!)
  validateOptions(resolvedOptions)

  const unlighthouse = await createUnlighthouse(options, { name: 'cli' })
  const { server, app } = await createServer()
  await unlighthouse.setServerContext({ url: server.url, server: server.server, app })
  await unlighthouse.start()

  unlighthouse.hooks.hook('worker-finished', () => {
    const logger = useLogger()
    logger.info('Unlighthouse has finished scanning your site.')
  })

  if (unlighthouse.resolvedConfig.server.open)
    await open(unlighthouse.runtimeSettings.clientUrl)
}

run()
