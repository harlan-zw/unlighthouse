import cac from 'cac'
import { UserConfig } from '@shared'
import { version } from '../../../package.json'
import { createUnlighthouse } from '../../core/engine'

const cli = cac('lighthouse')

cli
    .help()
    .version(version)
    .option('--host <host>', 'Host')
    .option('--root <root>', 'Root')
    .option('--emulation <emulation>', 'Emulation')
    .option('--debug', 'Debug')

const parsed = cli.parse()

async function run() {
  if (parsed.options.help)
    return

  const options = parsed.options as unknown as UserConfig

  const engine = await createUnlighthouse(options)
  await engine.startWithServer()
}

run()
