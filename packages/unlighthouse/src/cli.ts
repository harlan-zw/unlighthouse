import cac from 'cac'
import type { UserConfig } from 'unlighthouse-utils'
import open from 'open'
import { version } from '../package.json'
import { createUnlighthouse } from './core/unlighthouse'
import { createServer } from './core/server'

const cli = cac('lighthouse')

cli
  .help()
  .version(version)
  .option('--host <host>', 'Host')
  .option('--root <root>', 'Root')
  .option('--config-file <config-file>', 'Config File')
  .option('--debug', 'Debug')

const parsed = cli.parse()

async function run() {
  if (parsed.options.help)
    return

  const options = parsed.options as unknown as UserConfig

  // @ts-ignore
  if (options?.['--'])
    // @ts-ignore
    delete options['--']

  const unlighthouse = await createUnlighthouse(options, { name: 'cli' })
  const { server, app } = await createServer()
  unlighthouse.setServerContext({ url: server.url, server: server.server, app })
  await unlighthouse.start()

  if (unlighthouse.resolvedConfig.server.open)
    await open(unlighthouse.runtimeSettings.clientUrl)
}

run()
