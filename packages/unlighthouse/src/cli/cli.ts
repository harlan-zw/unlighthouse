import type { ResolvedUserConfig } from '@unlighthouse/contracts'
import type { Command } from '@unlighthouse/contracts/commands'
import type { CliOptions } from './types'
import { execFileSync } from 'node:child_process'
import { setMaxListeners } from 'node:events'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { createHandlers } from '@unlighthouse/core/api/handlers'
import { createLogger } from '@unlighthouse/core/logger'
import open from 'better-opn'
import { runMain } from 'citty'
import { createApp, toNodeListener } from 'h3'
import { listen } from 'listhen'
import { joinURL } from 'ufo'
import { version } from '../../package.json'
import { createUnlighthouseHost } from '../index.ts'
import { emitError, exitCodeForError, isAgentMode, stampSchema, writeNdjson } from './agent-mode'
import { runAssertions } from './assertions'
import { buildCli } from './createCli'
import { buildCliContext } from './ctx'
import { parseDevices, pickOptions, validateHost, validateOptions } from './util'

export interface CliEntryOptions {
  /** Raw CLI arguments, without the node and script entries. */
  argv?: string[]
  /** Environment captured at the executable boundary. */
  env?: NodeJS.ProcessEnv
}

function createCliRuntime(options: CliEntryOptions = {}) {
  const argv = options.argv ?? process.argv.slice(2)
  const env = options.env ?? process.env
  const debugEnv = env.DEBUG
  const rootLogger = createLogger({ level: debugEnv === '1' || debugEnv === 'true' || debugEnv === '*' ? 4 : 3 })
  return {
    argv,
    env,
    rootLogger,
    log: rootLogger.withTag('cli'),
  }
}

type CliRuntime = ReturnType<typeof createCliRuntime>

async function createServer(resolvedConfig: Pick<ResolvedUserConfig, 'server'>, runtime: CliRuntime) {
  const { log } = runtime
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
// Reap any Lighthouse-spawned Chrome processes. The audit worker launches
// Chrome inside a worker_thread, so when the host is killed (SIGTERM/SIGINT, or
// a tsx dev restart) those threads don't get to run their own cleanup and the
// Chromes are re-parented to init and leak — each one still holding its
// debugging port. Lighthouse's Chrome always runs with a `--user-data-dir`
// under a temp `lighthouse.<rand>` dir, which is a precise, safe signature to
// target (it never matches the user's real browser). Best-effort + synchronous
// so it completes before the process exits.
function killLighthouseChromes(runtime: CliRuntime): void {
  const { log } = runtime
  if (process.platform === 'win32')
    return
  try {
    // pkill -f matches against the full command line; the user-data-dir flag is
    // unique to Lighthouse's headless Chrome.
    execFileSync('pkill', ['-9', '-f', 'user-data-dir=.*lighthouse\\.'], { stdio: 'ignore' })
  }
  catch (err) {
    // pkill exits 1 when nothing matched — that's the common, fine case.
    const status = (err as { status?: unknown }).status
    if (status !== 1)
      logOperationalWarn('cli.chrome_reap_failed', err, { status }, log)
  }
}

// matches the convention used by nuxt / next / vite dev servers.
function setupGracefulShutdown(
  server: { server: { close: (cb?: (err?: Error) => void) => void } },
  unlighthouse: Awaited<ReturnType<typeof createUnlighthouseHost>>,
  runtime: CliRuntime,
): void {
  // Cap derived from UNLIGHTHOUSE_SHUTDOWN_TIMEOUT (seconds). Default
  // 10s — long enough to let an audit currently in lighthouse() finish
  // emitting, short enough that platform timeouts (k8s grace=30s,
  // systemd TimeoutStopSec=90s) don't escalate to SIGKILL.
  const { env, log } = runtime
  const timeoutMs = Math.max(1, Number.parseInt(env.UNLIGHTHOUSE_SHUTDOWN_TIMEOUT ?? '10', 10)) * 1000

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
          if (err)
            logOperationalWarn('cli.shutdown_server_close_failed', err, { phase: 'callback' }, log)
          resolve()
        })
      }
      catch (err) {
        logOperationalWarn('cli.shutdown_server_close_failed', err, { phase: 'throw' }, log)
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
      logOperationalWarn('cli.shutdown_scan_cancel_failed', err, {}, log)
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
      logOperationalWarn('cli.shutdown_db_close_failed', err, {}, log)
    }

    // Reap leaked Lighthouse Chromes before we go — the worker threads that
    // spawned them won't get a chance to once we exit.
    killLighthouseChromes(runtime)

    process.stderr.write(`[unlighthouse] drained cleanly.\n`)
    process.exit(0)
  }

  process.on('SIGTERM', () => {
    void drain('SIGTERM')
  })
  process.on('SIGINT', () => {
    void drain('SIGINT')
  })
  // Last-ditch synchronous reap for any exit path that bypasses drain()
  // (uncaught fatal, explicit process.exit elsewhere). Safe to run twice.
  process.on('exit', () => {
    killLighthouseChromes(runtime)
  })
}

async function runDashboardMode(options: CliOptions, runtime: CliRuntime) {
  const { env, log, rootLogger } = runtime
  setMaxListeners(0)

  log.debug('Dashboard-only mode (no --site)')
  log.debug(`Options: ${JSON.stringify({ debug: options.debug, history: options.history, configFile: options.configFile })}`)

  const unlighthouse = await createUnlighthouseHost({
    userConfig: {
      ...pickOptions(options),
      site: options.site || 'http://localhost',
    },
    behavior: { generateClient: true, showBanner: true, label: 'cli' },
    logger: rootLogger,
    env,
  })

  log.info('Starting Unlighthouse dashboard...')

  const { server, app } = await createServer(unlighthouse.resolvedConfig, runtime)
  log.debug('Setting server context...')
  await unlighthouse.setServerContext({ url: server.url, server: server.server, app })
  setupGracefulShutdown(server, unlighthouse, runtime)

  log.success(`Unlighthouse UI available at: ${unlighthouse.runtimeSettings.clientUrl}`)
  log.debug(`API: ${server.url} | Output: ${unlighthouse.resolvedConfig.outputPath}`)

  if (unlighthouse.resolvedConfig.server.open)
    await open(unlighthouse.runtimeSettings.clientUrl)
}

// Root command runtime: the v0 ergonomic entry. No --site/--urls → dashboard;
// --history → dashboard; otherwise scan + serve. citty owns --help / --version.
async function runRoot(options: CliOptions, runtime: CliRuntime) {
  const { env, log, rootLogger } = runtime
  const start = new Date()

  if (!options.site && !options.urls) {
    await runDashboardMode(options, runtime)
    return
  }

  if (options.history) {
    await runDashboardMode(options, runtime)
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
          await validateHost(config, rootLogger)
        },
      },
    },
    behavior: { generateClient: true, showBanner: true, label: 'cli' },
    logger: rootLogger,
    env,
  })

  log.debug(`Config resolved — site: ${unlighthouse.resolvedConfig.site}`)
  validateOptions(unlighthouse.resolvedConfig)

  const { server, app } = await createServer(unlighthouse.resolvedConfig, runtime)
  log.debug('Setting server context...')
  await unlighthouse.setServerContext({ url: server.url, server: server.server, app })
  setupGracefulShutdown(server, unlighthouse, runtime)

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
    }).catch((err) => {
      log.debug?.('Site row create skipped before opening scan landing page', err)
      return null
    })
    // The UI's `[siteId]` route param is a hostname slug (see
    // packages/ui/app/utils/site.ts `siteSlug`), not the encoded-origin id
    // used as the storage primary key above: use the hostname here so the
    // opened URL actually resolves. Landing route is plural `/scans/{id}`;
    // that page redirects by scan status.
    scanLandingUrl = joinURL(unlighthouse.runtimeSettings.clientUrl, `/sites/${parsedUrl.hostname}/scans/${scanId}`)
  }

  unlighthouse.hooks.hook('scan:complete', async (payload) => {
    const end = new Date()
    const seconds = Math.round((end.getTime() - start.getTime()) / 1000)

    log.success(`Scan finished: ${payload.summary.completed} routes in ${seconds}s — ${unlighthouse.resolvedConfig.site}`)

    const assertionConfigs = unlighthouse.resolvedConfig.ci?.assertions
    if (options.assert && assertionConfigs?.length) {
      const db = unlighthouse.handlerCtx.storage.db
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

// Subcommands point storage at the same --site/--root the scan ran under.
function argFromArgv(argv: string[], name: string): string | undefined {
  const flag = `--${name}`
  const idx = argv.indexOf(flag)
  const next = idx !== -1 ? argv[idx + 1] : undefined
  if (next && !next.startsWith('-'))
    return next
  const eq = argv.find(a => a.startsWith(`${flag}=`))
  return eq ? eq.slice(flag.length + 1) : undefined
}

/** Build the CLI command without parsing arguments or touching process lifecycle. */
export function createCliCommand(options: CliEntryOptions = {}) {
  const runtime = createCliRuntime(options)
  const { argv, env } = runtime
  const agent = isAgentMode(argv)

  async function emit(cmd: Command, result: unknown): Promise<void> {
    if (agent) {
      writeNdjson(stampSchema(cmd.name, result))
      return
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  }

  function onError(cmd: Command, err: unknown): never {
    emitError(err, agent, env)
    process.exit(exitCodeForError(err, cmd))
  }

  // Projected subcommands are one-shot; the ctx holds a DB handle that keeps
  // the loop alive, so flush stdout and exit once the command has emitted.
  async function onComplete(): Promise<void> {
    await new Promise<void>(resolve => process.stdout.write('', () => resolve()))
    process.exit(0)
  }

  return buildCli({
    version,
    argv,
    runRoot: options => runRoot(options, runtime),
    projection: {
      handlers: createHandlers(),
      createCtx: () => buildCliContext({
        site: argFromArgv(argv, 'site'),
        root: argFromArgv(argv, 'root'),
        debug: argv.includes('--debug') || argv.includes('-d'),
        env,
      }),
      emit,
      onError,
      onComplete,
    },
  })
}

/** Run the executable CLI entrypoint. Importing this module does not run it. */
export async function runCli(options: CliEntryOptions = {}): Promise<void> {
  const argv = options.argv ?? process.argv.slice(2)
  await runMain(createCliCommand({ ...options, argv }), { rawArgs: argv })
}
