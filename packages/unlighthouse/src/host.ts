/**
 * host.ts — Step E (v1 architecture pass)
 *
 * createUnlighthouseHost: thin factory that wires v1 ports + createUnlighthouseCore.
 * Replaces the 465-line createUnlighthouse in unlighthouse.ts (deleted in Step H).
 */
import type { Logger, ResolvedUserConfig, RuntimeSettings, UserConfig } from '@unlighthouse/contracts'
import type { HookMap } from '@unlighthouse/contracts/hooks'
import type { Pack } from '@unlighthouse/contracts/packs'
import type { CrawlSession, UnlighthouseCore, UnlighthouseCoreRunOverrides } from '@unlighthouse/contracts/ports'
import type { WS } from '@unlighthouse/core/api'
import type { HandlerCtx } from '@unlighthouse/core/api/handlers'
import type { App } from 'h3'
import type { Hookable } from 'hookable'
import type http from 'node:http'
import type { IncomingMessage } from 'node:http'
import type https from 'node:https'
import type { Socket } from 'node:net'
import type { LocalRuntime } from './local-runtime'
import { existsSync, mkdirSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHookEvent } from '@unlighthouse/contracts/hooks'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { createWS } from '@unlighthouse/core/api'
import { createLogger } from '@unlighthouse/core/logger'
import { joinURL } from 'ufo'
import { version } from '../package.json'
import { resolveConfig } from './config/resolve'
import { historySubscriber } from './data/history/tracking'
import { createLocalRuntime } from './local-runtime'
import { mountServer } from './server'
import { checkWsUpgrade, isExposedHost, normaliseOrigin } from './server-guards'
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
  setServerContext: (arg: { url: string, server: http.Server | https.Server, app: App }) => Promise<void>
  handlerCtx: HandlerCtx
  /**
   * Begin the scan via core.run(). Returns the started session's scanId.
   * Optional `overrides` are forwarded as `UnlighthouseCoreRunOverrides`
   * (e.g. multi-device matrix from `--device mobile,desktop`).
   */
  start: (overrides?: UnlighthouseCoreRunOverrides) => Promise<CrawlSession>
}

export interface CreateUnlighthouseHostOptions {
  userConfig: UserConfig
  behavior?: UnlighthouseBehavior
  /** Root logger owned by the preset; a fresh default is created when absent. */
  logger?: Logger
  /** Host environment read once at the creation boundary. */
  env?: NodeJS.ProcessEnv
  /**
   * Third-party packs to register alongside the built-ins. Threaded to both the
   * scan-finalize step (via the core factory) and the `pack.*` handlers (via the
   * handler ctx) so they resolve the same set.
   */
  packs?: Pack[]
}

function requireCoreHooks(core: UnlighthouseCore): Hookable<HookMap> {
  if (!core.hooks)
    throw new TypeError('Expected the Unlighthouse core hook bus to be initialized.')
  return core.hooks
}

function wireWsBroadcast(core: UnlighthouseCore, ws: WS | null, logger: Logger) {
  if (!ws) {
    logger.debug?.('[host] WS disabled — no broadcast hooks wired')
    return
  }
  logger.debug?.('[host] Wiring WS broadcast hooks')
  const hookable = requireCoreHooks(core)
  hookable.hook('scan:created', (payload) => {
    logger.debug?.(`[ws] scan:created — scanId: ${payload.scanId}, site: ${payload.site}`)
    ws.broadcast(createHookEvent('scan:created', payload))
  })
  hookable.hook('scan:started', (payload) => {
    ws.broadcast(createHookEvent('scan:started', payload))
  })
  hookable.hook('scan:discovering', (payload) => {
    ws.broadcast(createHookEvent('scan:discovering', payload))
  })
  hookable.hook('scan:scanning', (payload) => {
    ws.broadcast(createHookEvent('scan:scanning', payload))
  })
  hookable.hook('scan:progress', (payload) => {
    logger.debug?.(`[ws] scan:progress — discovered: ${payload.discovered}, scanned: ${payload.scanned}/${payload.total}, failed: ${payload.failed}`)
    ws.broadcast(createHookEvent('scan:progress', payload))
  })
  hookable.hook('scan:route-complete', (payload) => {
    logger.debug?.(`[ws] scan:route-complete — ${payload.url} (perf: ${payload.metrics?.scorePerformance ?? '?'})`)
    ws.broadcast(createHookEvent('scan:route-complete', payload))
  })
  hookable.hook('scan:complete', (payload) => {
    logger.info?.(`[ws] scan:complete — scanId: ${payload.scanId}, routes: ${payload.summary?.completed}`)
    ws.broadcast(createHookEvent('scan:complete', payload))
  })
  hookable.hook('scan:cancelled', (payload) => {
    logger.info?.(`[ws] scan:cancelled — reason: ${payload.reason}`)
    ws.broadcast(createHookEvent('scan:cancelled', payload))
  })
  hookable.hook('scan:route-failed', (payload) => {
    ws.broadcast(createHookEvent('scan:route-failed', payload))
  })
  hookable.hook('scan:error', (payload) => {
    logger.error?.(`[ws] scan:error — ${payload.error}`)
    ws.broadcast(createHookEvent('scan:error', payload))
  })
}

export async function createUnlighthouseHost(opts: CreateUnlighthouseHostOptions): Promise<UnlighthouseHost> {
  const { behavior = {} } = opts
  const { userConfig } = opts
  const env = opts.env ?? process.env

  const logger = (opts.logger ?? createLogger()).withTag('host')

  if (userConfig.root && !isAbsolute(userConfig.root))
    userConfig.root = join(process.cwd(), userConfig.root)
  else if (!userConfig.root)
    userConfig.root = process.cwd()

  if (userConfig.configFile && !isAbsolute(userConfig.configFile))
    userConfig.configFile = join(process.cwd(), userConfig.configFile)

  const { configFile, config, packs: configPacks } = await resolveConfig({
    cwd: userConfig.root,
    configFile: userConfig.configFile || 'unlighthouse.config',
    overrides: userConfig,
    env,
  })
  const resolvedConfig = config as ResolvedUserConfig

  // ── RuntimeSettings ──────────────────────────────────────────────────────

  const rs: RuntimeSettings = {
    configFile: configFile || undefined,
    moduleWorkingDir: import.meta.dirname,
    configCacheKey: computeConfigCacheKey(resolvedConfig, version),
    currentScanId: null,
    siteUrl: normaliseHost(resolvedConfig.site || 'http://localhost'),
    serverUrl: '',
    apiUrl: '',
    apiPath: joinURL(resolvedConfig.routerPrefix, resolvedConfig.apiPrefix),
    hasRouteDefinitions: false,
    websocketUrl: '',
    generatedClientPath: '',
    clientUrl: '',
    resolvedClientPath: '',
    outputPath: '',
  }

  if (resolvedConfig.site) {
    const site = rs.siteUrl
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
  const ws = behavior.ws !== undefined ? behavior.ws : createWS(logger)

  // ── Ports (lazy: Storage + Core built after outputPath is known) ──────────
  // Init is async (libsql adapter needs await for the dynamic import +
  // schema apply), but downstream proxy getters and the cached read path
  // need to stay sync. Resolved by splitting `initPortsAsync()` (await'd
  // by every entry point before it touches a port) from `ensurePorts()`
  // (sync; reads the cached ref or throws). Every entry point —
  // setServerContext, start, generateClientStub — already awaits before
  // any proxy access, so the proxies are guaranteed to find a hydrated
  // cache when they fire.
  type Ports = LocalRuntime
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
      const outputPath = rs.outputPath || resolvedConfig.outputPath
      logger.debug?.(`initPortsAsync — outputPath: ${outputPath}`)
      const runtime = await createLocalRuntime({
        config,
        output: {
          path: outputPath,
          mode: resolvedConfig.cache ? 'preserve' : 'reset',
        },
        logger,
        env,
        packs: [...(configPacks ?? []), ...(opts.packs ?? [])],
      })
      const { core, storage } = runtime

      wireWsBroadcast(core, ws, logger)

      historySubscriber({
        resolvedConfig,
        storage,
        hooks: requireCoreHooks(core),
        logger,
      })

      portsRef = runtime
      return portsRef
    })()

    try {
      return await portsInitPromise
    }
    finally {
      // Clear the in-flight marker so a failed init can be retried;
      // portsRef stays the source of truth on success.
      if (portsRef)
        portsInitPromise = null
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

  const setServerContext = async ({ url, server, app }: { url: string, server: http.Server | https.Server, app: App }) => {
    logger.debug?.(`setServerContext — url: ${url}`)
    const $server = new URL(url)

    let resolvedClientPath = ''
    try {
      resolvedClientPath = fileURLToPath(import.meta.resolve('@unlighthouse/ui'))
      if (!existsSync(resolvedClientPath))
        resolvedClientPath = ''
    }
    catch (err) {
      logOperationalWarn('host.client_resolve_failed', err, { phase: 'server-context' }, logger)
    }

    const clientUrl = joinURL($server.toString(), resolvedConfig.routerPrefix)
    const apiPath = joinURL(resolvedConfig.routerPrefix, resolvedConfig.apiPrefix)

    rs.serverUrl = url
    Object.assign(rs, {
      apiPath,
      server,
      resolvedClientPath,
      clientUrl,
      apiUrl: joinURL($server.toString(), apiPath),
      websocketUrl: `ws://${joinURL($server.host, apiPath, '/ws')}`,
    })

    if (!rs.outputPath) {
      const site = normaliseHost(resolvedConfig.site || 'http://localhost')
      const outputPath = join(
        resolvedConfig.outputPath,
        site.hostname.replace(':', '꞉'),
        rs.configCacheKey || '',
      )
      rs.outputPath = outputPath
      rs.generatedClientPath = outputPath
    }

    mkdirSync(rs.outputPath, { recursive: true })

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
      runtimeSettings: rs,
      hooks: serverHooks,
      ws,
      logger,
      env,
    }
    logger.debug?.(`Mounting server — apiPath: ${rs.apiPath}, clientUrl: ${rs.clientUrl}`)
    await mountServer(mountDeps, app, { handlerCtx })

    if (ws) {
      // The WS handshake arrives as a Node `'upgrade'` event on the raw server,
      // so it bypasses the h3 pipeline and its origin gate entirely. Apply the
      // same D-043 gate here: restrict to the `/api/ws` path and run the
      // Origin/Host check, so a cross-origin page cannot open the scan-event
      // stream and a rebinding Host cannot reach it. Same posture inputs as the
      // HTTP gate (server.ts).
      const wsPath = joinURL(apiPath, 'ws')
      const wsSiteOrigin = normaliseOrigin(typeof resolvedConfig.site === 'string' ? resolvedConfig.site : null)
      const serverHostname = typeof resolvedConfig.server?.hostname === 'string' ? resolvedConfig.server.hostname : undefined
      const wsExposed = isExposedHost(serverHostname)
      const wsTrustLoopbackOrigin = !env.UNLIGHTHOUSE_CORS_ORIGINS && !env.UNLIGHTHOUSE_API_TOKEN
      server.on('upgrade', (request: IncomingMessage, socket: Socket) => {
        const decision = checkWsUpgrade({
          reqPath: (request.url ?? '').split('?')[0] ?? '',
          wsPath,
          host: request.headers.host ?? null,
          origin: request.headers.origin ?? null,
          referer: request.headers.referer ?? null,
          siteOrigin: wsSiteOrigin,
          exposed: wsExposed,
          trustLoopbackOrigin: wsTrustLoopbackOrigin,
        })
        if (decision._tag === 'reject') {
          logger.warn?.(`ws: upgrade rejected — ${decision.reason}`)
          socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
          socket.destroy()
          return
        }
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
    return session
  }

  const generateClientStub = async (opts?: { static?: boolean }) => {
    const { storage } = await initPortsAsync()
    // CI (`--build-static`) never mounts a server, so `resolvedClientPath` —
    // normally set by setServerContext — is still empty. Resolve the
    // @unlighthouse/ui client package here so build.ts has a source to copy.
    if (!rs.resolvedClientPath) {
      try {
        const p = fileURLToPath(import.meta.resolve('@unlighthouse/ui'))
        if (existsSync(p))
          rs.resolvedClientPath = p
      }
      catch (err) {
        logOperationalWarn('host.client_resolve_failed', err, { phase: 'static-generation' }, logger)
      }
    }
    const { generateClient } = await import('./build')
    await generateClient({ static: opts?.static ?? false }, {
      resolvedConfig,
      runtimeSettings: rs,
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
        return Reflect.get(core, prop)
      },
    }),
    ws,
    runtimeSettings: rs,
    config: resolvedConfig,
    resolvedConfig,
    hooks: new Proxy({} as Hookable<HookMap>, {
      get(_, prop) {
        const { core } = ensurePorts()
        return Reflect.get(requireCoreHooks(core), prop)
      },
    }),
    generateClient: generateClientStub,
    setServerContext,
    handlerCtx: new Proxy({} as UnlighthouseHost['handlerCtx'], {
      get(_, prop) {
        const { handlerCtx } = ensurePorts()
        return Reflect.get(handlerCtx, prop)
      },
    }),
    start,
  }
  return result
}
