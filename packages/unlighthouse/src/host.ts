/**
 * host.ts — Step E (v1 architecture pass)
 *
 * createUnlighthouseHost: thin factory that wires v1 ports + createUnlighthouseCore.
 * Replaces the 465-line createUnlighthouse in unlighthouse.ts (deleted in Step H).
 */
import type { HookMap, Logger, ResolvedUserConfig, RuntimeSettings, UserConfig } from '@unlighthouse/contracts'
import type { UnlighthouseCore, UnlighthouseCoreRunOverrides } from '@unlighthouse/contracts/ports'
import type { WS } from '@unlighthouse/core/api'
import type { HandlerCtx } from '@unlighthouse/core/api/handlers/types'
import type { Hookable } from 'hookable'
import type { IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'
import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import type { createStorage } from '@unlighthouse/core/storage'
import { createUnlighthouseCore, reapStaleScans } from '@unlighthouse/core'
import { createWS } from '@unlighthouse/core/api'
import { crawleeCrawler } from '@unlighthouse/core/crawlers'
import { fuseSeeds, manualSeeds, sitemapSeeds } from '@unlighthouse/core/seeds'
import { createTaggedLogger } from '@unlighthouse/core/logger'
import { loadConfig } from 'c12'
import { defu } from 'defu'
import fs from 'fs-extra'
import { createCommonJS, resolvePath } from 'mlly'
import { joinURL } from 'ufo'
import { version } from '../package.json'
import { resolveAuditor } from './auditor'
import { initStorage } from './cli/storage-init'
import { ClientPkg } from './constants'
import { historySubscriber } from './data/history/tracking'
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
  generateClient: (opts?: { static?: boolean }) => Promise<void>
  setServerContext: (arg: { url: string, server: any, app: any }) => Promise<void>
  handlerCtx: HandlerCtx
  /**
   * Begin the scan via core.run(). Returns the started session's scanId.
   * Optional `overrides` are forwarded as `UnlighthouseCoreRunOverrides`
   * (e.g. multi-device matrix from `--device mobile,desktop`).
   */
  start: (overrides?: UnlighthouseCoreRunOverrides) => Promise<{ scanId: string }>
}

export interface CreateUnlighthouseHostOptions {
  userConfig: UserConfig
  behavior?: UnlighthouseBehavior
}

function resolveSeeds(resolvedConfig: ResolvedUserConfig, logger: Logger) {
  const site = resolvedConfig.site || ''
  const rawUrls = resolvedConfig.urls
  const isDashboardPlaceholder = site === 'http://localhost'
  const urlList: string[] = isDashboardPlaceholder
    ? []
    : [
        ...(site ? [site] : []),
        ...(Array.isArray(rawUrls) ? rawUrls : []),
      ]
  const sources = [
    manualSeeds({
      urls: urlList,
      logger: (logger as { withTag: (t: string) => Logger }).withTag('seeds/manual'),
    }),
  ]
  const sitemapEnabled = resolvedConfig.scanner?.sitemap !== false
    && !(Array.isArray(rawUrls) && rawUrls.length > 0)
    && !isDashboardPlaceholder
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
  return fuseSeeds(sources)
}

function wireWsBroadcast(core: UnlighthouseCore, ws: WS | null, logger: Logger) {
  if (!ws) {
    logger.debug?.('[host] WS disabled — no broadcast hooks wired')
    return
  }
  logger.debug?.('[host] Wiring WS broadcast hooks')
  const hookable = core.hooks as Hookable<HookMap>
  hookable.hook('scan:created', (payload) => {
    logger.debug?.(`[ws] scan:created — scanId: ${payload.scanId}, site: ${payload.site}`)
    ws.broadcast({
      event: 'scan:created',
      data: {
        scanId: payload.scanId,
        site: payload.site,
        startedAt: payload.startedAt,
      },
    })
  })
  hookable.hook('scan:started', (payload) => {
    ws.broadcast({ event: 'scan:started', data: { scanId: payload.scanId } })
  })
  hookable.hook('scan:discovering', (payload) => {
    ws.broadcast({ event: 'scan:discovering', data: { scanId: payload.scanId } })
  })
  hookable.hook('scan:scanning', (payload) => {
    ws.broadcast({
      event: 'scan:scanning',
      data: { scanId: payload.scanId, discovered: payload.discovered },
    })
  })
  hookable.hook('scan:progress', (payload) => {
    logger.debug?.(`[ws] scan:progress — discovered: ${payload.discovered}, scanned: ${payload.scanned}/${payload.total}, failed: ${payload.failed}`)
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
    logger.debug?.(`[ws] scan:route-complete — ${payload.url} (perf: ${payload.metrics?.scorePerformance ?? '?'})`)
    ws.broadcast({
      event: 'scan:route-complete',
      data: {
        url: payload.url,
        metrics: payload.metrics,
      },
    })
  })
  hookable.hook('scan:complete', (payload) => {
    logger.info?.(`[ws] scan:complete — scanId: ${payload.scanId}, routes: ${payload.summary?.completed}`)
    ws.broadcast({
      event: 'scan:complete',
      data: {
        scanId: payload.scanId,
        summary: payload.summary,
      },
    })
  })
  hookable.hook('scan:cancelled', (payload) => {
    logger.warn?.(`[ws] scan:cancelled — reason: ${payload.reason}`)
    ws.broadcast({
      event: 'scan:cancelled',
      data: { reason: payload.reason },
    })
  })
  hookable.hook('scan:route-failed', (payload) => {
    ws.broadcast({
      event: 'scan:route-failed',
      data: { url: payload.url, error: payload.error },
    })
  })
  hookable.hook('scan:error', (payload) => {
    logger.error?.(`[ws] scan:error — ${payload.error}`)
    ws.broadcast({
      event: 'scan:error',
      data: { error: payload.error },
    })
  })
}

export async function createUnlighthouseHost(opts: CreateUnlighthouseHostOptions): Promise<UnlighthouseHost> {
  const { behavior = {} } = opts
  let { userConfig } = opts

  const logger = createTaggedLogger('host') as unknown as Logger

  const { __dirname } = createCommonJS(import.meta.url)

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
  // Init is async (libsql adapter needs await for the dynamic import +
  // schema apply), but downstream proxy getters and the cached read path
  // need to stay sync. Resolved by splitting `initPortsAsync()` (await'd
  // by every entry point before it touches a port) from `ensurePorts()`
  // (sync; reads the cached ref or throws). Every entry point —
  // setServerContext, start, generateClientStub — already awaits before
  // any proxy access, so the proxies are guaranteed to find a hydrated
  // cache when they fire.
  interface Ports { core: UnlighthouseCore, storage: ReturnType<typeof createStorage>, auditor: ReturnType<typeof resolveAuditor>, handlerCtx: HandlerCtx }
  let portsRef: Ports | null = null
  let portsInitPromise: Promise<Ports> | null = null

  const initPortsAsync = async (): Promise<Ports> => {
    if (portsRef)
      return portsRef
    // Coalesce concurrent inits — two parallel start()s would otherwise
    // create two stores / two cores against the same DB and race the
    // migration apply.
    if (portsInitPromise)
      return portsInitPromise

    portsInitPromise = (async () => {
      const outputPath = (rs as RuntimeSettings).outputPath || resolvedConfig.outputPath
      logger.debug?.(`initPortsAsync — outputPath: ${outputPath}`)
      fs.ensureDirSync(outputPath)

      if (!resolvedConfig.cache && existsSync(outputPath)) {
        try {
          fs.rmSync(outputPath, { recursive: true })
        }
        catch {}
        fs.ensureDirSync(outputPath)
      }

      const { storage } = await initStorage({ outputPath, logger })

      // Sweep zombies left by a prior process before we wire core — see
      // reapStaleScans for D-019c rationale. Fire-and-forget so boot doesn't
      // block on storage IO; a stale row that survives one extra boot is
      // tolerable, blocking the CLI on a slow disk is not.
      reapStaleScans(storage, logger).catch(() => {})

      const coreConfig = resolvedConfig as unknown as Parameters<typeof createUnlighthouseCore>[0]['config']
      const auditor = resolveAuditor({ config: coreConfig, logger })

      const seeds = resolveSeeds(resolvedConfig, logger)

      // noFollow (page mode / explicit urls) is decided per-scan in core's
      // orchestrate() and passed via CrawlerRunOptions — it's override-aware
      // so the dashboard's per-scan mode works too. Nothing to set here.
      const crawler = crawleeCrawler({ logger: (logger as any).withTag('crawler/crawlee') as never })

      logger.debug?.('Creating core — crawler: crawlee')
      const core = createUnlighthouseCore({
        config: coreConfig,
        auditor,
        seeds,
        crawler,
        storage,
        logger,
      })

      wireWsBroadcast(core, ws, logger)

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
      }

      portsRef = { core, storage, auditor, handlerCtx }
      return portsRef
    })()

    try {
      return await portsInitPromise
    }
    finally {
      // Clear the in-flight marker so a failed init can be retried;
      // portsRef stays the source of truth on success.
      if (portsRef) portsInitPromise = null
    }
  }

  const ensurePorts = (): Ports => {
    if (!portsRef) {
      throw new Error(
        'unlighthouse: ports accessed before initialisation. '
        + 'Call host.start() or mount the server first, or await host.handlerCtx via setServerContext.',
      )
    }
    return portsRef
  }

  // ── setServerContext ──────────────────────────────────────────────────────

  const setServerContext = async ({ url, server, app }: { url: string, server: any, app: any }) => {
    logger.debug?.(`setServerContext — url: ${url}`)
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

    const { handlerCtx } = await initPortsAsync()

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
    logger.debug?.(`Mounting server — apiPath: ${(rs as RuntimeSettings).apiPath}, clientUrl: ${(rs as RuntimeSettings).clientUrl}`)
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

  const start = async (overrides?: UnlighthouseCoreRunOverrides) => {
    const { core } = await initPortsAsync()
    logger.info?.(`Starting scan — site: ${resolvedConfig.site}, overrides: ${JSON.stringify(overrides ?? {})}`)
    const session = core.run(overrides ? { overrides } : undefined)
    logger.info?.(`Scan session created — scanId: ${session.scanId}`)
    return { scanId: session.scanId }
  }

  const generateClientStub = async (opts?: { static?: boolean }) => {
    const { storage } = await initPortsAsync()
    const { generateClient } = await import('./build')
    await generateClient({ static: opts?.static ?? false }, {
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
