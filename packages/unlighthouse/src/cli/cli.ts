import type { CliOptions } from './types'
import { setMaxListeners } from 'node:events'
import { evaluateAndStoreAssertions } from '@unlighthouse/core/comparison'
import { logger, createTaggedLogger } from '@unlighthouse/core/logger'
import open from 'better-opn'
import { createApp, toNodeListener } from 'h3'
import { listen } from 'listhen'
import { joinURL } from 'ufo'
import { createSitesStore, deriveSiteId } from '../data/sites'
import { createUnlighthouseHost } from '../index.ts'
import createCli from './createCli'
import { parseDevices, pickOptions, validateHost, validateOptions } from './util'

const log = createTaggedLogger('cli')

async function createServer(resolvedConfig: { server: any }) {
  log.debug('Creating h3 app + listener...')
  const app = createApp()
  const server = await listen(toNodeListener(app), {
    ...resolvedConfig.server,
    open: false,
  })
  log.debug(`Listening on ${server.url}`)
  return { app, server }
}

const cli = createCli()

const { options } = cli.parse() as unknown as { options: CliOptions }

async function runDashboardMode() {
  setMaxListeners(0)

  log.debug('Dashboard-only mode (no --site)')
  log.debug(`Options: ${JSON.stringify({ debug: options.debug, history: options.history, configFile: options.configFile })}`)

  const unlighthouse = await createUnlighthouseHost({
    userConfig: {
      ...pickOptions(options),
      site: options.site || 'http://localhost',
    },
    behavior: { generateClient: true, showBanner: true, label: 'cli' },
  })

  log.info('Starting Unlighthouse dashboard...')

  const { server, app } = await createServer(unlighthouse.resolvedConfig)
  log.debug('Setting server context...')
  await unlighthouse.setServerContext({ url: server.url, server: server.server, app })

  log.success(`Unlighthouse UI available at: ${unlighthouse.runtimeSettings.clientUrl}`)
  log.debug(`API: ${server.url} | Output: ${unlighthouse.resolvedConfig.outputPath}`)

  if (unlighthouse.resolvedConfig.server.open)
    await open(unlighthouse.runtimeSettings.clientUrl)
}

async function run() {
  const start = new Date()
  if (options.help || options.version)
    return

  if (!options.site && !options.urls) {
    await runDashboardMode()
    return
  }

  if (options.history) {
    await runDashboardMode()
    return
  }

  setMaxListeners(0)

  log.debug(`Scan mode — site: ${options.site}`)
  log.debug(`Options: ${JSON.stringify({ site: options.site, urls: options.urls, device: options.device, samples: options.samples })}`)

  const unlighthouse = await createUnlighthouseHost({
    userConfig: {
      ...pickOptions(options),
      hooks: {
        'resolved-config': async (config) => {
          await validateHost(config, logger as any)
        },
      },
    },
    behavior: { generateClient: true, showBanner: true, label: 'cli' },
  })

  log.debug(`Config resolved — site: ${unlighthouse.resolvedConfig.site}`)
  validateOptions(unlighthouse.resolvedConfig)

  const { server, app } = await createServer(unlighthouse.resolvedConfig)
  log.debug('Setting server context...')
  await unlighthouse.setServerContext({ url: server.url, server: server.server, app })

  const deviceOverride = parseDevices(options)
  log.debug(`Device override: ${JSON.stringify(deviceOverride)}`)

  const { scanId } = await unlighthouse.start(
    deviceOverride && deviceOverride.length > 0 ? { device: deviceOverride } : undefined,
  )
  log.info(`Scan started — scanId: ${scanId}`)

  const siteUrl = unlighthouse.resolvedConfig.site
  let scanLandingUrl = unlighthouse.runtimeSettings.clientUrl
  if (siteUrl) {
    const sitesStore = createSitesStore({ outputPath: unlighthouse.resolvedConfig.outputPath })
    const site = await sitesStore.create({
      url: siteUrl,
      device: unlighthouse.resolvedConfig.scanner?.device || undefined,
    }).catch(() => null)
    const siteId = site?.id ?? deriveSiteId(siteUrl)
    scanLandingUrl = joinURL(unlighthouse.runtimeSettings.clientUrl, `/sites/${siteId}/scan/${scanId}`)
  }

  unlighthouse.hooks.hook('scan:complete', async (payload) => {
    const end = new Date()
    const seconds = Math.round((end.getTime() - start.getTime()) / 1000)

    log.success(`Scan finished: ${payload.summary.completed} routes in ${seconds}s — ${unlighthouse.resolvedConfig.site}`)

    const assertionConfigs = unlighthouse.resolvedConfig.ci?.assertions
    if (options.assert && assertionConfigs?.length) {
      const db = (unlighthouse.handlerCtx.storage as { db?: any }).db
      if (db) {
        const results = await evaluateAndStoreAssertions(db, scanId, assertionConfigs)
        const failures = results.filter(r => !r.passed)

        if (failures.length > 0) {
          log.error(`${failures.length} assertion(s) failed:`)
          for (const f of failures) {
            const label = f.assertion.category || f.assertion.metric || f.assertion.type
            log.error(`  ${f.assertion.type} ${label}: expected ${f.assertion.value}, got ${f.actual}`)
            if (f.failingRoutes?.length) {
              for (const r of f.failingRoutes.slice(0, 5)) {
                log.error(`    - ${r.path} (${r.value})`)
              }
              if (f.failingRoutes.length > 5)
                log.error(`    ... and ${f.failingRoutes.length - 5} more`)
            }
          }
          process.exit(1)
        }
        else {
          log.success(`All ${results.length} assertion(s) passed.`)
        }
      }
    }
  })

  if (unlighthouse.resolvedConfig.server.open)
    await open(scanLandingUrl)
}

run()
