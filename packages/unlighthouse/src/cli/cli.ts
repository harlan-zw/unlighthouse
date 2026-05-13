import type { CliOptions } from './types'
import { setMaxListeners } from 'node:events'
import open from 'better-opn'
import { createConsola } from 'consola'
import { createApp, toNodeListener } from 'h3'
import { listen } from 'listhen'
import { joinURL } from 'ufo'
import { createUnlighthouseHost, evaluateAndStoreAssertions, history } from '..'
import { getCurrentScanId } from '../data/history/tracking'
import { createSitesStore, deriveSiteId } from '../data/sites'
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

async function runDashboardMode() {
  setMaxListeners(0)

  const logger = createConsola().withTag('unlighthouse')
  if (options.debug)
    logger.level = 4

  const unlighthouse = await createUnlighthouseHost({
    userConfig: {
      ...pickOptions(options),
      site: options.site || 'http://localhost',
    },
    behavior: { generateClient: true, showBanner: true, label: 'cli' },
  })

  logger.info('Starting Unlighthouse dashboard...')

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

  // No site provided → dashboard-only mode (manage sites, view history).
  if (!options.site && !options.urls) {
    await runDashboardMode()
    return
  }

  if (options.history) {
    await runDashboardMode()
    return
  }

  setMaxListeners(0)

  const logger = createConsola().withTag('unlighthouse')
  if (options.debug)
    logger.level = 4

  const unlighthouse = await createUnlighthouseHost({
    userConfig: {
      ...pickOptions(options),
      hooks: {
        'resolved-config': async (config) => {
          await validateHost(config, logger)
        },
      },
    },
    behavior: { generateClient: true, showBanner: true, label: 'cli' },
  })

  validateOptions(unlighthouse.resolvedConfig)

  const { server, app } = await createServer(unlighthouse.resolvedConfig)
  await unlighthouse.setServerContext({ url: server.url, server: server.server, app })
  const { scanId } = await unlighthouse.start()

  // Register this scan's site in the persistent registry so it shows up on the dashboard.
  const siteUrl = unlighthouse.resolvedConfig.site
  let scanLandingUrl = unlighthouse.runtimeSettings.clientUrl
  if (siteUrl) {
    const sitesStore = createSitesStore({ outputPath: unlighthouse.resolvedConfig.outputPath })
    const site = await sitesStore.create({
      url: siteUrl,
      device: unlighthouse.resolvedConfig.scanner?.device,
    }).catch(() => null)
    const siteId = site?.id ?? deriveSiteId(siteUrl)
    scanLandingUrl = joinURL(unlighthouse.runtimeSettings.clientUrl, `/sites/${siteId}/scan/${scanId}`)
  }

  unlighthouse.hooks.hook('scan:complete', async (payload) => {
    const end = new Date()
    const seconds = Math.round((end.getTime() - start.getTime()) / 1000)

    logger.success(`Unlighthouse has finished scanning ${unlighthouse.resolvedConfig.site}: ${payload.summary.completed} routes in ${seconds}s.`)

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
    await open(scanLandingUrl)
}

run()
