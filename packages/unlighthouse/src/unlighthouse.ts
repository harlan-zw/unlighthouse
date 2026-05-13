import type { IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'
import type {
  Provider,
  ResolvedUserConfig,
  RuntimeSettings,
  UnlighthouseContext,
  UserConfig,
} from './types'
import type { UnlighthouseHooks } from './types/index'
import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { createUnlighthouseCore } from '@unlighthouse/core'
import { createBroadcastingEvents, WS } from '@unlighthouse/core/api'
import { crawleeCrawler, crawlSite, createInspectHtmlTask, createRunLighthouseTask, createUnlighthouseWorker } from '@unlighthouse/core/crawlers'
import { fuseSeeds, manualSeeds } from '@unlighthouse/core/seeds'
import { createStorage } from '@unlighthouse/core/storage'
import { drizzleStorage } from '@unlighthouse/core/storage/drizzle'
import { unstorageBlobs } from '@unlighthouse/core/storage/unstorage-blobs'
import Database from 'better-sqlite3'
import { loadConfig } from 'c12'
import { colorize } from 'consola/utils'
import { defu } from 'defu'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import fs from 'fs-extra'
import { createHooks } from 'hookable'
import { createCommonJS, resolvePath } from 'mlly'
import objectHash from 'object-hash'
import { $fetch } from 'ofetch'
import { $URL, joinURL } from 'ufo'
import fsDriver from 'unstorage/drivers/fs'
import { version } from '../package.json'
import { resolveAuditor } from './auditor'
import { generateClient } from './build'
import { AppName, ClientPkg } from './constants'
import { initHistoryTracking } from './data/history/tracking'
import { createLogger } from './logger'
import { resolveUserConfig } from './resolveConfig'
import { mountServer } from './server'
import { normaliseHost } from './util'
import { successBox } from './util/cliFormatting'

export { useLogger } from './logger'

/**
 * A simple define wrapper to provide typings to config definitions.
 * @deprecated Use `defineUnlighthouseConfig` from `unlighthouse/config` instead.
 */
export function defineConfig(config: UserConfig): UserConfig {
  return config
}

/**
 * Create an Unlighthouse instance. The returned context is threaded explicitly to all consumers. Scanning will
 * not start automatically, a server context needs to be provided using `setServerContext()`.
 *
 * @param userConfig
 * @param provider
 */
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

export async function createUnlighthouse(userConfig: UserConfig, provider?: Provider, behavior: UnlighthouseBehavior = {}) {
  const logger = createLogger(userConfig.debug)
  const { __dirname } = createCommonJS(import.meta.url)
  if (userConfig.root && !isAbsolute(userConfig.root))
    userConfig.root = join(process.cwd(), userConfig.root)
  else if (!userConfig.root)
    userConfig.root = process.cwd()

  logger.debug(`Starting Unlighthouse at root: \`${userConfig.root}\` cwd: ${process.cwd()}`)
  // resolve configFile to absolute before passing to c12
  if (userConfig.configFile && !isAbsolute(userConfig.configFile))
    userConfig.configFile = join(process.cwd(), userConfig.configFile)
  // support loading configuration files
  ;(globalThis as any).defineUnlighthouseConfig = (c: any) => c
  const { configFile, config } = await loadConfig<UserConfig>({
    name: 'unlighthouse',
    cwd: userConfig.root,
    configFile: userConfig.configFile || 'unlighthouse.config',
    dotenv: true,
  })
  delete (globalThis as any).defineUnlighthouseConfig
  logger.debug('Discovered config definition', config)
  userConfig = defu(userConfig, config)
  const runtimeSettings: { moduleWorkingDir: string, lighthouseProcessPath: string } & Partial<RuntimeSettings> = {
    configFile: configFile || undefined,
    moduleWorkingDir: __dirname,
    configCacheKey: '',
    lighthouseProcessPath: '',
    currentScanId: null,
  }
  // path to the lighthouse worker file - try both dist locations (root and _chunks)
  runtimeSettings.lighthouseProcessPath = await resolvePath(
    join(runtimeSettings.moduleWorkingDir, 'lighthouse.mjs'),
  ).catch(() => '')
  // try parent dir (when __dirname is _chunks)
  if (!(await fs.pathExists(runtimeSettings.lighthouseProcessPath))) {
    runtimeSettings.lighthouseProcessPath = await resolvePath(
      join(runtimeSettings.moduleWorkingDir, '..', 'lighthouse.mjs'),
    ).catch(() => '')
  }
  // ts module in stub mode, not sure why extensions won't resolve
  if (!(await fs.pathExists(runtimeSettings.lighthouseProcessPath))) {
    runtimeSettings.lighthouseProcessPath = await resolvePath(
      join(runtimeSettings.moduleWorkingDir, 'lighthouse.ts'),
    )
  }

  // create a cache key for the users provided key so we can cache burst on config update
  runtimeSettings.configCacheKey = objectHash({ ...userConfig, version }).substring(0, 4)

  const resolvedConfig = await resolveUserConfig(userConfig)
  logger.debug('Post config resolution', resolvedConfig)

  const hooks = createHooks<UnlighthouseHooks>()

  // add hooks from config
  if (resolvedConfig.hooks)
    hooks.addHooks(resolvedConfig.hooks)

  await hooks.callHook('resolved-config', resolvedConfig)

  if (configFile)
    logger.info(`Creating Unlighthouse ${configFile ? `using config from \`${configFile}\`` : ''}`)

  // web socket instance for broadcasting; presets pass null for non-interactive (CI) flows.
  const ws = behavior.ws !== undefined ? behavior.ws : new WS()

  const ctx = {
    runtimeSettings,
    hooks,
    resolvedConfig,
    ws,
    provider,
  } as unknown as UnlighthouseContext

  const tasks = {
    inspectHtmlTask: createInspectHtmlTask(ctx),
    runLighthouseTask: createRunLighthouseTask(ctx),
  }

  const worker = await createUnlighthouseWorker(ctx, tasks)

  if (resolvedConfig.hooks?.authenticate) {
    // do an authentication step
    await worker.cluster.execute({}, async (taskCtx) => {
      logger.debug('Running authentication hook')
      await taskCtx.page.setBypassCSP(true)

      await hooks.callHook('authenticate', taskCtx.page)
      // collect page authentication, either cookie or localStorage tokens
      const localStorageData = await taskCtx.page.evaluate(() => {
        const json: Record<string, any> = {}
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key)
            json[key] = localStorage.getItem(key)
        }
        return json
      }).catch((e: any) => {
        logger.warn('Failed to collect authentication localStorage.\n', e)
        return {}
      })
      const sessionStorageData = await taskCtx.page.evaluate(() => {
        const json: Record<string, any> = {}
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i)
          if (key)
            json[key] = sessionStorage.getItem(key)
        }
        return json
      }).catch((e: any) => {
        logger.warn('Failed to collect authentication sessionStorage.\n', e)
        return {}
      })
      const cookies = await taskCtx.page.cookies()
      logger.debug('Authentication completed', { cookies, localStorageData, sessionStorageData })
      // merge this into the config
      // @ts-expect-error untyped
      ctx.resolvedConfig.cookies = [...(ctx.resolvedConfig.cookies || []), ...cookies as any as ResolvedUserConfig['cookies']]
      ctx.resolvedConfig.localStorage = { ...ctx.resolvedConfig.localStorage, ...localStorageData }
      ctx.resolvedConfig.sessionStorage = { ...ctx.resolvedConfig.sessionStorage, ...sessionStorageData }
    })
  }

  ctx.worker = worker

  ctx.setCiContext = async () => {
    const $site = new $URL(resolvedConfig.site)

    logger.debug(`Setting Unlighthouse CI Context [Site: ${$site}]`)

    // avoid nesting reports for ci mode
    let outputPath = join(
      resolvedConfig.outputPath,
      // fix windows not supporting : in paths
      $site.hostname.replace(':', '꞉'),
      runtimeSettings.configCacheKey || '',
    )

    try {
      await fs.mkdir(resolvedConfig.outputPath, { recursive: true })
    }
    catch (e) {
      logger.error(`Failed to create output directory. Please check unlighthouse has permissions to: ${resolvedConfig.outputPath}`, e)
    }

    try {
      await fs.mkdir(outputPath, { recursive: true })
    }
    catch (e) {
      logger.error(`Failed to create output directory. Please check unlighthouse has permission to create files and folders in: ${resolvedConfig.outputPath}`, e)
    }

    // When ws is disabled (CI), don't nest reports by hostname/cache key.
    if (ws === null)
      outputPath = resolvedConfig.outputPath

    ctx.runtimeSettings = {
      ...ctx.runtimeSettings,
      outputPath,
      generatedClientPath: outputPath,
      resolvedClientPath: '', // Skip client resolution for dev mode
    }

    if (!resolvedConfig.cache && existsSync(resolvedConfig.outputPath)) {
      logger.debug(`\`cache\` is disabled, deleting cache folder: \`${resolvedConfig.outputPath}\``)
      fs.rmSync(outputPath, { recursive: true })
    }
    fs.ensureDirSync(ctx.runtimeSettings.outputPath)
    return ctx
  }

  ctx.setSiteUrl = async (url: string) => {
    const site = normaliseHost(url)
    ctx.runtimeSettings.siteUrl = site

    logger.debug(`Setting Unlighthouse Site URL [Site: ${site.toString()}]`)

    const outputPath = join(
      resolvedConfig.outputPath,
      // fix windows not supporting : in paths
      runtimeSettings.siteUrl?.hostname.replace(':', '꞉') || '',
      runtimeSettings.configCacheKey || '',
    )

    if (!ctx.resolvedConfig.site)
      ctx.resolvedConfig.site = site.toString()
    ctx.runtimeSettings.outputPath = outputPath
    ctx.runtimeSettings.generatedClientPath = outputPath

    await hooks.callHook('site-changed', ctx.resolvedConfig.site)
  }

  ctx.setServerContext = async ({ url, server, app }) => {
    const $server = new URL(url)

    logger.debug(`Setting Unlighthouse Server Context [Server: ${$server}]`)

    // Resolve client package path - resolvePath returns main field (dist/index.html)
    let resolvedClientPath = ''
    try {
      // resolvePath returns the main entry (dist/index.html)
      resolvedClientPath = await resolvePath(ClientPkg, { url: import.meta.url })
      logger.debug(`Resolved client path: ${resolvedClientPath}`)
      if (!existsSync(resolvedClientPath)) {
        logger.warn(`Client path does not exist: ${resolvedClientPath}`)
        resolvedClientPath = ''
      }
    }
    catch (e) {
      logger.debug('Failed to resolve client package path', e)
    }

    const clientUrl = joinURL($server.toString(), resolvedConfig.routerPrefix)
    const apiPath = joinURL(resolvedConfig.routerPrefix, resolvedConfig.apiPrefix)
    ctx.runtimeSettings.serverUrl = url
    ctx.runtimeSettings = {
      ...ctx.runtimeSettings,
      apiPath,
      server,
      resolvedClientPath,
      clientUrl,
      apiUrl: joinURL($server.toString(), apiPath),
      websocketUrl: `ws://${joinURL($server.host, apiPath, '/ws')}`,
    }

    // v3: HTTP projection from command registry (replaces hand-wired routes in createApi).
    // D-018: the host owns the concrete consola; pass it through so core can `logger.withTag(adapterName)` per adapter.
    const coreConfig = resolvedConfig as unknown as Parameters<typeof createUnlighthouseCore>[0]['config']
    const auditor = resolveAuditor({ config: coreConfig, logger })
    const crawler = crawleeCrawler({ logger: logger.withTag('crawler/crawlee') as never })
    fs.ensureDirSync(ctx.runtimeSettings.outputPath)
    const sqliteDb = new Database(join(ctx.runtimeSettings.outputPath, 'db.sqlite'))
    const rowStorage = drizzleStorage({
      driver: drizzle(sqliteDb),
      logger: logger.withTag('storage/drizzle') as never,
    })
    const storage = createStorage({
      rows: rowStorage,
      blobs: unstorageBlobs({
        driver: fsDriver({ base: join(ctx.runtimeSettings.outputPath, 'blobs') }),
      }),
    })
    const seeds = fuseSeeds([
      manualSeeds({ urls: resolvedConfig.urls ?? [], logger: logger.withTag('seeds/manual') as never }),
    ])
    const core = createUnlighthouseCore({
      config: coreConfig,
      auditor,
      seeds,
      crawler,
      storage,
      logger,
    })
    const handlerCtx = {
      core,
      auditor,
      storage,
      config: coreConfig,
      version,
      auditors: undefined,
    }
    await mountServer(ctx, app, { handlerCtx })

    if (ws) {
      server.on('upgrade', (request: IncomingMessage, socket) => {
        ws.handleUpgrade(request, socket as Socket)
      })
    }

    if (!resolvedConfig.cache && existsSync(ctx.runtimeSettings.outputPath)) {
      logger.debug(`\`cache\` is disabled, deleting cache folder: \`${ctx.runtimeSettings.outputPath}\``)
      try {
        fs.rmSync(ctx.runtimeSettings.outputPath, { recursive: true })
      }
      catch (e) {
        logger.debug(`Failed to delete cache folder: \`${ctx.runtimeSettings.outputPath}\``, e)
      }
    }
    fs.ensureDirSync(ctx.runtimeSettings.outputPath)

    // Generate client (copy and transform client files) when the preset requests it.
    if (behavior.generateClient && resolvedClientPath && existsSync(resolvedClientPath)) {
      await generateClient({}, ctx)
    }

    if (behavior.autoStartOnVisit) {
      // start if the user visits the client
      hooks.hookOnce('visited-client', () => {
        ctx.start()
      })
    }
    return ctx
  }

  ctx.start = async () => {
    logger.debug(`Starting Unlighthouse [Server: ${ws === null ? 'N/A' : ctx.runtimeSettings.clientUrl} Site: ${ctx.resolvedConfig.site} Debug: \`${ctx.resolvedConfig.debug}\`]`)

    // v1: discovery is sitemap + crawler only. Route-definition seed source dropped.
    // Two-phase URL discovery: crawlSite handles sitemap, manual URLs, and Crawlee crawling
    ctx.routes = await crawlSite(ctx)
    logger.debug('Discovered and filtered routes', ctx.routes.length)
    createBroadcastingEvents(ctx)
    initHistoryTracking(ctx)

    // Show the static info box first (before any progress starts)
    if (behavior.showBanner) {
      // fancy CLI banner when we start
      const label = (name: string) => colorize('bold', colorize('magenta', (`▸ ${name}:`)))
      let mode = ''
      if (resolvedConfig.urls?.length)
        mode = 'Manual'

      if (resolvedConfig.scanner.sitemap !== false)
        mode += 'Sitemap'

      if (resolvedConfig.scanner.crawler)
        mode += mode.length > 0 ? ' + Crawler' : 'Crawler'

      let latestTag = `v${version}`
      try {
        latestTag = (await $fetch<any>('https://ungh.unjs.io/repos/harlan-zw/unlighthouse/releases/latest')).release.tag
      }
      catch {}

      const title = [
        `⛵\u200D  ${colorize('bold', colorize('blueBright', AppName))} ${colorize('dim', `${behavior.label ?? ''} @ v${version}`)}`,
      ]
      if (Number(latestTag.replace('v', '').replace('.', '')) > Number(version.replace('.', ''))) {
        title.push(...[
          '',
          `🎉 New version ${latestTag} available! Use the latest:`,
          colorize('gray', ` > ${colorize('underline', `npx unlighthouse@^${latestTag} --site ${resolvedConfig.site}`)}`),
        ])
      }
      title.push(...[
        '',
        `${label('Scanning')} ${resolvedConfig.site}`,
        `${label('Route Discovery')} ${mode} ${ctx.routes.length > 1 ? (colorize('dim', (`${ctx.routes.length} initial URLs`))) : ''}`,
      ])

      process.stdout.write(successBox(
        // messages
        [
          ctx.runtimeSettings.clientUrl ? colorize('whiteBright', `Report: ${ctx.runtimeSettings.clientUrl}`) : '',
        ].join('\n'),
        // title
        title.join('\n'),
      ))
      if (existsSync(join(ctx.runtimeSettings.generatedClientPath, 'reports', 'lighthouse.json')) && ctx.resolvedConfig.cache)
        logger.info(`Restoring reports from cache. ${colorize('gray', 'You can disable this behavior by passing --no-cache.')}`)
    }

    // Now start queuing routes after the static info is shown
    worker.queueRoutes(ctx.routes)
    return ctx
  }

  if (ctx.resolvedConfig.site)
    ctx.setSiteUrl(resolvedConfig.site)

  return ctx
}
