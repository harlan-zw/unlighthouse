import type { CliOptions } from './types'
import { setMaxListeners } from 'node:events'
import open from 'better-opn'
import { createConsola } from 'consola'
import { createApp, toNodeListener } from 'h3'
import { listen } from 'listhen'
import { createUnlighthouse, evaluateAndStoreAssertions, history } from '..'
import { getCurrentScanId } from '../data/history/tracking'
import createCli from './createCli'
import { pickOptions, validateHost, validateOptions } from './util'

async function createServer(resolvedConfig: { server: any }) {
  const app = createApp()
  return {
    app,
    server: await listen(toNodeListener(app), {
      ...resolvedConfig.server,
      open: false,
    }),
  }
}

const cli = createCli()

const { options } = cli.parse() as unknown as { options: CliOptions }

async function runHistoryMode() {
  setMaxListeners(0)

  const logger = createConsola().withTag('unlighthouse')
  if (options.debug)
    logger.level = 4

  const unlighthouse = await createUnlighthouse(
    {
      ...pickOptions(options),
      site: options.site || 'http://localhost',
    },
    { name: 'cli' },
    { generateClient: true, showBanner: true, label: 'cli' },
  )

  logger.info('Starting Unlighthouse in history-only mode...')

  const { server, app } = await createServer(unlighthouse.resolvedConfig)
  await unlighthouse.setServerContext({ url: server.url, server: server.server, app })

  logger.success(`Unlighthouse UI available at: ${unlighthouse.runtimeSettings.clientUrl}`)

  if (unlighthouse.resolvedConfig.server.open)
    await open(unlighthouse.runtimeSettings.clientUrl)
}

async function run() {
  const start = new Date()
  if (options.help || options.version)
    return

  if (options.history) {
    await runHistoryMode()
    return
  }

  setMaxListeners(0)

  const logger = createConsola().withTag('unlighthouse')
  if (options.debug)
    logger.level = 4

  const unlighthouse = await createUnlighthouse(
    {
      ...pickOptions(options),
      hooks: {
        'resolved-config': async (config) => {
          await validateHost(config, logger)
        },
      },
    },
    { name: 'cli' },
    { generateClient: true, showBanner: true, label: 'cli' },
  )

  validateOptions(unlighthouse.resolvedConfig)

  const { server, app } = await createServer(unlighthouse.resolvedConfig)
  await unlighthouse.setServerContext({ url: server.url, server: server.server, app })
  const { routes = [] } = await unlighthouse.start()
  if (!routes.length) {
    logger.error('Failed to queue routes for scanning. Please check the logs with debug enabled.')
    process.exit(1)
  }

  unlighthouse.hooks.hook('worker-finished', async () => {
    const end = new Date()
    const seconds = Math.round((end.getTime() - start.getTime()) / 1000)

    unlighthouse.worker.clearProgressDisplay()
    logger.success(`Unlighthouse has finished scanning ${unlighthouse.resolvedConfig.site}: ${unlighthouse.worker.reports().length} routes in ${seconds}s.`)
    await unlighthouse.worker.cluster.close().catch(() => {})

    const assertionConfigs = unlighthouse.resolvedConfig.ci?.assertions
    if (options.assert && assertionConfigs?.length) {
      const scanId = getCurrentScanId()
      if (scanId) {
        const db = history.getHistoryDb(unlighthouse.resolvedConfig.outputPath)
        const results = evaluateAndStoreAssertions(db, scanId, assertionConfigs)
        const failures = results.filter(r => !r.passed)

        if (failures.length > 0) {
          logger.error(`${failures.length} assertion(s) failed:`)
          for (const f of failures) {
            const label = f.assertion.category || f.assertion.metric || f.assertion.type
            logger.error(`  ${f.assertion.type} ${label}: expected ${f.assertion.value}, got ${f.actual}`)
            if (f.failingRoutes?.length) {
              for (const r of f.failingRoutes.slice(0, 5)) {
                logger.error(`    - ${r.path} (${r.value})`)
              }
              if (f.failingRoutes.length > 5)
                logger.error(`    ... and ${f.failingRoutes.length - 5} more`)
            }
          }
          process.exit(1)
        }
        else {
          logger.success(`All ${results.length} assertion(s) passed.`)
        }
      }
    }
  })

  if (unlighthouse.resolvedConfig.server.open)
    await open(unlighthouse.runtimeSettings.clientUrl)
}

run()
