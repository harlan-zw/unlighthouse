import type { CliOptions } from './types'
import { setMaxListeners } from 'node:events'
import { platform } from 'node:os'
import { createUnlighthouse, generateClient, useLogger } from '@unlighthouse/core'
import { createServer } from '@unlighthouse/server'
import { x } from 'tinyexec'
import createCli from './createCli'
import { pickOptions, validateHost, validateOptions } from './util'

function openUrl(url: string) {
  const cmd = platform() === 'darwin'
    ? 'open'
    : platform() === 'win32'
      ? 'start'
      : 'xdg-open'
  return x(cmd, [url], { throwOnError: false })
}

const cli = createCli()

const { options } = cli.parse() as unknown as { options: CliOptions }

async function run() {
  const start = new Date()
  if (options.help || options.version)
    return

  setMaxListeners(0)

  const unlighthouse = await createUnlighthouse(
    {
      ...pickOptions(options),
      hooks: {
        'resolved-config': async (config) => {
          await validateHost(config)
        },
      },
    },
    { name: 'cli' },
  )

  validateOptions(unlighthouse.resolvedConfig)

  const { server, app } = await createServer()
  await unlighthouse.setServerContext({ url: server.url, server: server.server, app })
  const { routes } = await unlighthouse.start()
  const logger = useLogger()
  if (!routes.length) {
    logger.error('Failed to queue routes for scanning. Please check the logs with debug enabled.')
    process.exit(1)
  }

  // Gracefully shut down on Ctrl+C so the dev server and Chrome instances are torn down instead of
  // being orphaned. A second signal forces an immediate exit in case teardown hangs. (#378)
  let shuttingDown = false
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      process.exit(1)
    }
    shuttingDown = true
    logger.info(`Received ${signal}, shutting down Unlighthouse (press again to force quit)...`)
    await unlighthouse.worker.cluster.close().catch(() => {})
    await server.close().catch(() => {})
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  unlighthouse.hooks.hook('worker-finished', async () => {
    const end = new Date()
    const seconds = Math.round((end.getTime() - start.getTime()) / 1000)

    // Clear the progress display
    unlighthouse.worker.clearProgressDisplay()
    logger.success(`Unlighthouse has finished scanning ${unlighthouse.resolvedConfig.site}: ${unlighthouse.worker.reports().length} routes in ${seconds}s.`)

    // Regenerate the client payload with completed reports so the dashboard
    // shows data even when opened after the scan finishes.
    // Pass unlighthouse context explicitly — unctx's global context is not
    // available inside async hook callbacks.
    await generateClient({}, unlighthouse)

    await unlighthouse.worker.cluster.close().catch(() => {})
  })

  if (unlighthouse.resolvedConfig.server.open)
    await openUrl(unlighthouse.runtimeSettings.clientUrl)
}

run()
