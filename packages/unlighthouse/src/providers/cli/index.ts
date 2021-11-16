import { resolve } from 'path'
import cac from 'cac'
import { CliOptions } from '@shared'
import { version } from '../../../package.json'
import { startServer } from '../../server'

const cli = cac('lighthouse')

cli
  .help()
  .version(version)
  .option('--host <host>', 'Host')
  .option('--app-path <app-path>', 'Path')
  .option('--port <port>', 'Port', { default: 8115 })
  .option('--open', 'Open in browser', { default: true })
  .option('--json [filepath]', 'Output analysis result file in JSON')
  .option('--html [dir]', 'Output analysis result in static web app')

const parsed = cli.parse()

async function run() {
  const root = resolve(cli.args[0] || process.cwd())
  if (parsed.options.help)
    return

  const options = parsed.options as unknown as CliOptions

  await startServer({
    ...options,
    root,
  })
}

run()
