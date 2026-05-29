import type { CliOptions } from './types'
import { setMaxListeners } from 'node:events'
import { logger, createTaggedLogger } from '@unlighthouse/core/logger'
import open from 'better-opn'
import { createApp, toNodeListener } from 'h3'
import { listen } from 'listhen'
import { joinURL } from 'ufo'
import { createUnlighthouseHost } from '../index.ts'
import { runAssertions } from './assertions'
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

// Wire SIGTERM / SIGINT for clean shutdowns. Production hosts (k8s,
// systemd, fly.io, Railway) send SIGTERM to ask the process to exit;
// Ctrl+C in a dev shell sends SIGINT. Both deserve the same drain:
//   1. Stop accepting new HTTP connections so the load balancer steers
//      traffic elsewhere.
//   2. Cancel an in-flight scan if there is one — otherwise the worker
//      pool keeps Chrome processes alive past the shutdown window and
//      the orchestrator gets killed mid-write.
//   3. Best-effort close on the DB (drizzle drivers expose .close on
//      the underlying client; libsql + better-sqlite3 both do).
//   4. Force-exit after a budget so a wedged scan can't pin the process
//      open indefinitely.
//
// Twice-pressed Ctrl+C bypasses the drain and exits immediately —
// matches the convention used by nuxt / next / vite dev servers.
function setupGracefulShutdown(
  server: { server: { close: (cb?: (err?: Error) => void) => void } },
  unlighthouse: Awaited<ReturnType<typeof createUnlighthouseHost>>,
): void {
  // Cap derived from UNLIGHTHOUSE_SHUTDOWN_TIMEOUT (seconds). Default
  // 10s — long enough to let an audit currently in lighthouse() finish
  // emitting, short enough that platform timeouts (k8s grace=30s,
  // systemd TimeoutStopSec=90s) don't escalate to SIGKILL.
  const timeoutMs = Math.max(1, Number.parseInt(process.env.UNLIGHTHOUSE_SHUTDOWN_TIMEOUT ?? '10', 10)) * 1000

  let shuttingDown = false
  const drain = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      // Bypass the logger — twice-pressed Ctrl+C means the user wants
      // out NOW, not after another buffered log flush.
      process.stderr.write(`[unlighthouse] ${signal} received again — forcing exit.\n`)
      process.exit(1)
    }
    shuttingDown = true
    // process.stderr.write goes straight to the FD without consola/pino
    // buffering — under tsx the child can be reaped before consola
    // gets to flush a buffered line.
    process.stderr.write(`[unlighthouse] ${signal} received — draining within ${timeoutMs / 1000}s...\n`)

    const forceTimer = setTimeout(() => {
      process.stderr.write(`[unlighthouse] drain budget exhausted — exit(1).\n`)
      process.exit(1)
    }, timeoutMs)
    forceTimer.unref()

    // Stop accepting new connections first so callers fail fast.
    await new Promise<void>((resolve) => {
      try {
        server.server.close((err) => {
          if (err) log.warn(`[shutdown] server.close error: ${err.message}`)
          resolve()
        })
      }
      catch (err) {
        log.warn(`[shutdown] server.close threw: ${(err as Error).message}`)
        resolve()
      }
    })

    // Cancel the active scan. The proxy `unlighthouse.core` triggers
    // initPortsAsync lazily — if no scan ever started, .session()
    // returns null and there's nothing to do.
    try {
      const session = unlighthouse.core?.session?.()
      if (session?.scanId) {
        log.info(`[shutdown] cancelling active scan ${session.scanId}`)
        await session.cancel?.('shutdown')
      }
    }
    catch (err) {
      log.debug?.(`[shutdown] cancel skipped: ${(err as Error).message}`)
    }

    // Best-effort DB close. drizzle adapters expose .close on the
    // wrapped client (libsql Client and better-sqlite3 Database both
    // have it). Catch errors — already-closed is fine.
    try {
      const storage = unlighthouse.handlerCtx?.storage as { db?: { close?: () => void | Promise<void> } } | undefined
      if (storage?.db?.close)
        await storage.db.close()
    }
    catch (err) {
      log.debug?.(`[shutdown] db.close skipped: ${(err as Error).message}`)
    }

    process.stderr.write(`[unlighthouse] drained cleanly.\n`)
    process.exit(0)
  }

  process.on('SIGTERM', () => { void drain('SIGTERM') })
  process.on('SIGINT', () => { void drain('SIGINT') })
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
  setupGracefulShutdown(server as any, unlighthouse)

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
  setupGracefulShutdown(server as any, unlighthouse)

  const deviceOverride = parseDevices(options)
  log.debug(`Device override: ${JSON.stringify(deviceOverride)}`)

  const { scanId } = await unlighthouse.start(
    deviceOverride && deviceOverride.length > 0 ? { device: deviceOverride } : undefined,
  )
  log.info(`Scan started — scanId: ${scanId}`)

  const siteUrl = unlighthouse.resolvedConfig.site
  let scanLandingUrl = unlighthouse.runtimeSettings.clientUrl
  if (siteUrl) {
    const storage = unlighthouse.handlerCtx.storage
    const parsedUrl = new URL(siteUrl)
    const siteId = encodeURIComponent(parsedUrl.origin)
    await storage.sites.create({
      id: siteId,
      name: parsedUrl.port ? `${parsedUrl.hostname}:${parsedUrl.port}` : parsedUrl.hostname,
      // Store the bare origin (the domain-level site), not the full scanned
      // URL — keeps the model consistent with orchestrate's origin-keyed site.
      url: parsedUrl.origin,
      group: null,
      createdAt: new Date().toISOString(),
    }).catch(() => null)
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
        const { passed } = await runAssertions(db, scanId, assertionConfigs, log)
        if (!passed)
          process.exit(1)
      }
    }
  })

  if (unlighthouse.resolvedConfig.server.open)
    await open(scanLandingUrl)
}

run()
