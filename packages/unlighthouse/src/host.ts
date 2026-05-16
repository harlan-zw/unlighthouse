/**
 * host.ts — Step E (v1 architecture pass)
 *
 * createUnlighthouseHost: thin factory that wires v1 ports + createUnlighthouseCore.
 * Replaces the 465-line createUnlighthouse in unlighthouse.ts (deleted in Step H).
 */
import type { HookMap, Logger, ResolvedUserConfig, RuntimeSettings, UserConfig } from '@unlighthouse/contracts'
import type { UnlighthouseCore } from '@unlighthouse/contracts/ports'
import type { WS } from '@unlighthouse/core/api'
import type { HandlerCtx } from '@unlighthouse/core/api/handlers/types'
import type { Hookable } from 'hookable'
import type { IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'
import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { createUnlighthouseCore, reapStaleScans } from '@unlighthouse/core'
import { createWS } from '@unlighthouse/core/api'
import { crawleeCrawler } from '@unlighthouse/core/crawlers'
import { fuseSeeds, manualSeeds, sitemapSeeds } from '@unlighthouse/core/seeds'
import { createStorage } from '@unlighthouse/core/storage'
import { applyMigrations, drizzleStorage, INIT_SQL_STATEMENTS } from '@unlighthouse/core/storage/drizzle'
import { unstorageBlobs } from '@unlighthouse/core/storage/unstorage-blobs'
import Database from 'better-sqlite3'
import { loadConfig } from 'c12'
import { createConsola } from 'consola'
import { defu } from 'defu'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import fs from 'fs-extra'
import { createCommonJS, resolvePath } from 'mlly'
import { joinURL } from 'ufo'
import fsDriver from 'unstorage/drivers/fs'
import { version } from '../package.json'
import { resolveAuditor } from './auditor'
import { ClientPkg } from './constants'
import { historySubscriber } from './data/history/tracking'
import { createSitesStore } from './data/sites'
import { resolveUserConfig } from './resolveConfig'
import { mountServer } from './server'
import { createServerHooks } from './server-hooks'
import { computeConfigCacheKey, normaliseHost } from './util'

/**
 * Behavior knobs supplied by the entry preset (cli, ci, integration).
 * Replaces the implicit `provider.name === 'cli'|'ci'` branches.
 */
export interface UnlighthouseBehavior {
  /** WebSocket broadcaster. Pass null to disable (e.g. CI). */
  ws?: WS | null
  /** When true, generateClient() is run after server context is set (CLI). */
  generateClient?: boolean
  /** When true, scanning waits for the user to visit the client before starting (integrations). */
  autoStartOnVisit?: boolean
  /** When true, the fancy CLI start banner is printed (CLI). */
  showBanner?: boolean
  /** Label shown in logs / banner (e.g. 'cli', 'ci', 'nuxt'). */
  label?: string
}

export interface UnlighthouseHost {
  core: UnlighthouseCore
  ws: WS | null
  runtimeSettings: RuntimeSettings
  config: ResolvedUserConfig
  resolvedConfig: ResolvedUserConfig
  hooks: Hookable<HookMap>
  generateClient: () => Promise<void>
  setServerContext: (arg: { url: string, server: any, app: any }) => Promise<void>
  handlerCtx: HandlerCtx
  /** Begin the scan via core.run(). Returns the started session's scanId. */
  start: () => Promise<{ scanId: string }>
}

export interface CreateUnlighthouseHostOptions {
  userConfig: UserConfig
  behavior?: UnlighthouseBehavior
}

export async function createUnlighthouseHost(opts: CreateUnlighthouseHostOptions): Promise<UnlighthouseHost> {
  const { behavior = {} } = opts
  let { userConfig } = opts

  const logger = createConsola().withTag('unlighthouse') as Logger
  if (userConfig.debug)
    (logger as any).level = 4

  const { __dirname, require } = createCommonJS(import.meta.url)

  if (userConfig.root && !isAbsolute(userConfig.root))
    userConfig.root = join(process.cwd(), userConfig.root)
  else if (!userConfig.root)
    userConfig.root = process.cwd()

  if (userConfig.configFile && !isAbsolute(userConfig.configFile))
    userConfig.configFile = join(process.cwd(), userConfig.configFile)

  const { configFile, config: fileConfig } = await loadConfig<UserConfig>({
    name: 'unlighthouse',
    cwd: userConfig.root,
    configFile: userConfig.configFile || 'unlighthouse.config',
    dotenv: true,
  })
  userConfig = defu(userConfig, fileConfig)

  // ── RuntimeSettings ──────────────────────────────────────────────────────

  const rs: { moduleWorkingDir: string, lighthouseProcessPath: string } & Partial<RuntimeSettings> = {
    configFile: configFile || undefined,
    moduleWorkingDir: __dirname,
    configCacheKey: '',
    lighthouseProcessPath: '',
    currentScanId: null,
  }

  rs.lighthouseProcessPath = await resolvePath(
    join(rs.moduleWorkingDir, 'lighthouse.mjs'),
  ).catch(() => '')
  if (!(await fs.pathExists(rs.lighthouseProcessPath))) {
    rs.lighthouseProcessPath = await resolvePath(
      join(rs.moduleWorkingDir, '..', 'lighthouse.mjs'),
    ).catch(() => '')
  }
  if (!(await fs.pathExists(rs.lighthouseProcessPath))) {
    rs.lighthouseProcessPath = await resolvePath(
      join(rs.moduleWorkingDir, 'lighthouse.ts'),
    )
  }

  rs.configCacheKey = computeConfigCacheKey(userConfig, version)

  const resolvedConfig = await resolveUserConfig(userConfig, logger)

  if (resolvedConfig.site) {
    const site = normaliseHost(resolvedConfig.site)
    rs.siteUrl = site
    const outputPath = join(
      resolvedConfig.outputPath,
      site.hostname.replace(':', '꞉'),
      rs.configCacheKey || '',
    )
    rs.outputPath = outputPath
    rs.generatedClientPath = outputPath
  }

  // createWS() factory wraps `new WS()`. jiti's interopDefault Proxy strips
  // [[Construct]] from re-exported classes in stub mode (unjs/jiti#437), so
  // callers go through the factory; a plain function call doesn't trip the
  // missing-construct slot.
  const ws = behavior.ws !== undefined ? behavior.ws : createWS()

  // ── Ports (lazy: Storage + Core built after outputPath is known) ──────────
  // These are (re-)built inside setServerContext once the server URL is known.
  // For CI / non-server flows they're built in start() via ensurePorts().
  interface Ports { core: UnlighthouseCore, storage: ReturnType<typeof createStorage>, auditor: ReturnType<typeof resolveAuditor>, handlerCtx: HandlerCtx }
  let portsRef: Ports | null = null

  const ensurePorts = (): Ports => {
    if (portsRef)
      return portsRef

    const outputPath = (rs as RuntimeSettings).outputPath || resolvedConfig.outputPath
    fs.ensureDirSync(outputPath)

    if (!resolvedConfig.cache && existsSync(outputPath)) {
      try {
        fs.rmSync(outputPath, { recursive: true })
      }
      catch {}
      fs.ensureDirSync(outputPath)
    }

    const sqliteDb = new Database(join(outputPath, 'db.sqlite'))
    // Apply bundled migrations once on open. drizzle-orm/migrator wants a
    // _migrations metadata table; for the simple v1.0 schema we just exec
    // the bundled SQL (`CREATE TABLE IF NOT EXISTS` makes this idempotent).
    // Apply each statement independently. `CREATE TABLE IF NOT EXISTS` /
    // `CREATE INDEX IF NOT EXISTS` are inherently idempotent; bare `ALTER
    // TABLE ADD COLUMN` is not — sqlite errors with "duplicate column name"
    // on second run. Skip-on-error covers the additive-migration case.
    for (const stmt of INIT_SQL_STATEMENTS) {
      try { sqliteDb.exec(stmt) }
      catch (err) {
        const msg = (err as Error).message
        if (!/duplicate column name/i.test(msg))
          logger.warn?.(`Migration stmt skipped: ${msg}`)
      }
    }
    // Runtime upgrades for databases that pre-date a schema bump.
    // INIT_SQL above is `CREATE TABLE IF NOT EXISTS`-style — no-op against
    // existing tables — so anything that adds a column or rewrites a PK
    // needs an explicit path. applyMigrations runs each pending migration
    // once and is a no-op on already-current databases.
    applyMigrations(sqliteDb, {
      onApply: id => logger.info?.(`[storage] applied migration: ${id}`),
    })
    const drizzleDb = drizzle(sqliteDb)
    const drizzleAdapter = drizzleStorage({
      driver: drizzleDb,
      logger: (logger as any).withTag('storage/drizzle'),
    })
    const storage = createStorage({
      rows: { ...drizzleAdapter, db: drizzleAdapter.db },
      blobs: unstorageBlobs({
        driver: fsDriver({ base: join(outputPath, 'blobs') }),
      }),
    })

    // Sweep zombies left by a prior process before we wire core — see
    // reapStaleScans for D-019c rationale. Fire-and-forget so boot doesn't
    // block on storage IO; a stale row that survives one extra boot is
    // tolerable, blocking the CLI on a slow disk is not.
    reapStaleScans(storage, logger).catch(() => {})

    const coreConfig = resolvedConfig as unknown as Parameters<typeof createUnlighthouseCore>[0]['config']
    const auditor = resolveAuditor({ config: coreConfig, logger })

    const site = resolvedConfig.site || ''
    const rawUrls = resolvedConfig.urls
    const urlList: string[] = [
      ...(site ? [site] : []),
      ...(Array.isArray(rawUrls) ? rawUrls : []),
    ]
    const sources = [
      manualSeeds({
        urls: urlList,
        logger: (logger as { withTag: (t: string) => Logger }).withTag('seeds/manual'),
      }),
    ]
    // Sitemap discovery is on by default; disable via `scanner.sitemap = false` or
    // when `--urls` overrides the crawl with an explicit list.
    const sitemapEnabled = resolvedConfig.scanner?.sitemap !== false && !(Array.isArray(rawUrls) && rawUrls.length > 0)
    if (sitemapEnabled && site) {
      try {
        sources.push(sitemapSeeds({
          resolvedConfig: resolvedConfig as never,
          siteUrl: new URL(site),
          sitemaps: Array.isArray(resolvedConfig.scanner?.sitemap)
            ? resolvedConfig.scanner.sitemap
            : true,
          logger: (logger as { withTag: (t: string) => Logger }).withTag('seeds/sitemap'),
        }))
      }
      catch (err) {
        (logger as Logger).warn?.('failed to wire sitemap seeds', err)
      }
    }
    const seeds = fuseSeeds(sources)

    const crawler = crawleeCrawler({ logger: (logger as any).withTag('crawler/crawlee') as never })

    const core = createUnlighthouseCore({
      config: coreConfig,
      auditor,
      seeds,
      crawler,
      storage,
      logger,
    })

    // Wire WS broadcasting to v1 HookMap events
    if (ws) {
      const hookable = core.hooks as Hookable<HookMap>
      hookable.hook('scan:progress', (payload) => {
        ws.broadcast({
          event: 'scan:progress',
          data: {
            discovered: payload.discovered,
            scanned: payload.scanned,
            total: payload.total,
            failed: payload.failed,
          },
        })
      })
      hookable.hook('scan:route-complete', (payload) => {
        ws.broadcast({
          event: 'scan:route-complete',
          data: {
            url: payload.url,
            metrics: payload.metrics,
          },
        })
      })
      hookable.hook('scan:complete', (payload) => {
        ws.broadcast({
          event: 'scan:complete',
          data: {
            scanId: payload.scanId,
            summary: payload.summary,
          },
        })
      })
      hookable.hook('scan:cancelled', (payload) => {
        ws.broadcast({
          event: 'scan:cancelled',
          data: { reason: payload.reason },
        })
      })
      hookable.hook('scan:error', (payload) => {
        ws.broadcast({
          event: 'scan:error',
          data: { error: payload.error },
        })
      })
    }

    historySubscriber({
      resolvedConfig,
      storage,
      hooks: core.hooks as Hookable<HookMap>,
      logger,
    })

    const handlerCtx: HandlerCtx = {
      core,
      auditor,
      storage,
      config: coreConfig,
      version,
      sites: createSitesStore({ outputPath: resolvedConfig.outputPath }),
    }

    portsRef = { core, storage, auditor, handlerCtx }
    return portsRef
  }

  // ── setServerContext ──────────────────────────────────────────────────────

  const setServerContext = async ({ url, server, app }: { url: string, server: any, app: any }) => {
    const $server = new URL(url)

    let resolvedClientPath = ''
    try {
      resolvedClientPath = await resolvePath(ClientPkg, { url: import.meta.url })
      if (!existsSync(resolvedClientPath))
        resolvedClientPath = ''
    }
    catch {}

    const clientUrl = joinURL($server.toString(), resolvedConfig.routerPrefix)
    const apiPath = joinURL(resolvedConfig.routerPrefix, resolvedConfig.apiPrefix)

    ;(rs as RuntimeSettings).serverUrl = url
    Object.assign(rs, {
      apiPath,
      server,
      resolvedClientPath,
      clientUrl,
      apiUrl: joinURL($server.toString(), apiPath),
      websocketUrl: `ws://${joinURL($server.host, apiPath, '/ws')}`,
    })

    if (!(rs as RuntimeSettings).outputPath) {
      const site = normaliseHost(resolvedConfig.site || 'http://localhost')
      const outputPath = join(
        resolvedConfig.outputPath,
        site.hostname.replace(':', '꞉'),
        rs.configCacheKey || '',
      )
      ;(rs as RuntimeSettings).outputPath = outputPath
      ;(rs as RuntimeSettings).generatedClientPath = outputPath
    }

    fs.ensureDirSync((rs as RuntimeSettings).outputPath)

    const { handlerCtx } = ensurePorts()

    // Indirection so callers (tests, integrations) can override `host.start`
    // after construction and still have autoStartOnVisit honour the override.
    const serverHooks = createServerHooks({
      autoStartOnVisit: behavior.autoStartOnVisit,
      start: () => result.start(),
      logger,
    })

    const mountDeps = {
      resolvedConfig,
      runtimeSettings: rs as RuntimeSettings,
      hooks: serverHooks,
      ws,
      logger,
    }
    await mountServer(mountDeps, app, { handlerCtx })

    if (ws) {
      server.on('upgrade', (request: IncomingMessage, socket: Socket) => {
        ws.handleUpgrade(request, socket)
      })
    }

    if (behavior.generateClient && resolvedClientPath && existsSync(resolvedClientPath))
      await generateClientStub()
  }

  // ── start ────────────────────────────────────────────────────────────────

  const start = async () => {
    const { core } = ensurePorts()
    logger.debug?.(`Starting v1 scan [Site: ${resolvedConfig.site}]`)
    const session = core.run()
    return { scanId: session.scanId }
  }

  const generateClientStub = async () => {
    const { storage } = ensurePorts()
    const { generateClient } = await import('./build')
    await generateClient({ static: false }, {
      resolvedConfig,
      runtimeSettings: rs as RuntimeSettings,
      storage,
      logger,
    })
  }

  // `result` is referenced lazily by `setServerContext` (via `() => result.start()`)
  // so callers can override `host.start` after construction. Safe at runtime because
  // setServerContext is invoked from the outside, after this function returns.
  const result: UnlighthouseHost = {
    core: new Proxy({} as UnlighthouseCore, {
      get(_, prop) {
        const { core } = ensurePorts()
        return (core as any)[prop]
      },
    }),
    ws,
    runtimeSettings: rs as RuntimeSettings,
    config: resolvedConfig,
    resolvedConfig,
    hooks: new Proxy({} as Hookable<HookMap>, {
      get(_, prop) {
        const { core } = ensurePorts()
        return (core.hooks as any)[prop]
      },
    }),
    generateClient: generateClientStub,
    setServerContext,
    handlerCtx: new Proxy({} as UnlighthouseHost['handlerCtx'], {
      get(_, prop) {
        const { handlerCtx } = ensurePorts()
        return (handlerCtx as any)[prop]
      },
    }),
    start,
  }
  return result
}
