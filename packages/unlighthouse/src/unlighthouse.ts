import type { Hookable } from 'hookable'
import type { IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'
import type {
  NormalisedRoute,
  Provider,
  ResolvedUserConfig,
  RuntimeSettings,
  ServerContextArg,
  UnlighthouseWorker,
  UserConfig,
} from './types'
import type { UnlighthouseHooks } from './types/index'

interface HostCtx {
  runtimeSettings: RuntimeSettings
  hooks: Hookable<UnlighthouseHooks>
  resolvedConfig: ResolvedUserConfig
  ws: WS | null
  provider: Provider | undefined
  worker: UnlighthouseWorker
  routes: NormalisedRoute[]
  setCiContext: () => Promise<HostCtx>
  setSiteUrl: (url: string) => Promise<void>
  setServerContext: (arg: ServerContextArg) => Promise<HostCtx>
  start: () => Promise<HostCtx>
}
import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { createUnlighthouseCore } from '@unlighthouse/core'
import { createBroadcastingEvents, WS } from '@unlighthouse/core/api'
import { crawleeCrawler, crawlSite, legacyClusterEngine } from '@unlighthouse/core/crawlers'
import { fuseSeeds, manualSeeds } from '@unlighthouse/core/seeds'
import { createStorage } from '@unlighthouse/core/storage'
import { drizzleStorage } from '@unlighthouse/core/storage/drizzle'
import { unstorageBlobs } from '@unlighthouse/core/storage/unstorage-blobs'
import Database from 'better-sqlite3'
import { loadConfig } from 'c12'
import { createConsola } from 'consola'
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
// import { generateClient } from './build' — legacy callsite; file dies in Step H
import { AppName, ClientPkg } from './constants'
// initHistoryTracking moved to historySubscriber (called from host.ts); legacy file dies in Step H
import { createSitesStore } from './data/sites'
import { resolveUserConfig } from './resolveConfig'
import { mountServer } from './server'
import { normaliseHost } from './util'
import { successBox } from './util/cliFormatting'

/**
 * A simple define wrapper to provide typings to config definitions.
 * @deprecated Use `defineUnlighthouseConfig` from `unlighthouse/config` instead.
 */
export function defineConfig(config: UserConfig): UserConfig {
  return config
}

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
  const logger = createConsola().withTag('unlighthouse')
  if (userConfig.debug)
    logger.level = 4

  const { __dirname } = createCommonJS(import.meta.url)
  if (userConfig.root && !isAbsolute(userConfig.root))
    userConfig.root = join(process.cwd(), userConfig.root)
  else if (!userConfig.root)
    userConfig.root = process.cwd()

  logger.debug(`Starting Unlighthouse at root: \`${userConfig.root}\` cwd: ${process.cwd()}`)
  // resolve configFile to absolute before passing to c12
  if (userConfig.configFile && !isAbsolute(userConfig.configFile))
    userConfig.configFile = join(process.cwd(), userConfig.configFile)
  const { configFile, config } = await loadConfig<UserConfig>({
    name: 'unlighthouse',
    cwd: userConfig.root,
    configFile: userConfig.configFile || 'unlighthouse.config',
    dotenv: true,
  })
  logger.debug('Discovered config definition', config)
  userConfig = defu(userConfig, config)
  const runtimeSettings: { moduleWorkingDir: string, lighthouseProcessPath: string } & Partial<RuntimeSettings> = {
    configFile: configFile || undefined,
    moduleWorkingDir: __dirname,
    configCacheKey: '',
    lighthouseProcessPath: '',
    currentScanId: null,
  }
  // path to the lighthouse worker file
  runtimeSettings.lighthouseProcessPath = await resolvePath(
    join(runtimeSettings.moduleWorkingDir, 'lighthouse.mjs'),
  ).catch(() => '')
  if (!(await fs.pathExists(runtimeSettings.lighthouseProcessPath))) {
    runtimeSettings.lighthouseProcessPath = await resolvePath(
      join(runtimeSettings.moduleWorkingDir, '..', 'lighthouse.mjs'),
    ).catch(() => '')
  }
  if (!(await fs.pathExists(runtimeSettings.lighthouseProcessPath))) {
    runtimeSettings.lighthouseProcessPath = await resolvePath(
      join(runtimeSettings.moduleWorkingDir, 'lighthouse.ts'),
    )
  }

  runtimeSettings.configCacheKey = objectHash({ ...userConfig, version }).substring(0, 4)

  const resolvedConfig = await resolveUserConfig(userConfig, logger)
  logger.debug('Post config resolution', resolvedConfig)

  const hooks = createHooks<UnlighthouseHooks>()

  if (resolvedConfig.hooks)
    hooks.addHooks(resolvedConfig.hooks)

  await hooks.callHook('resolved-config', resolvedConfig)

  if (configFile)
    logger.info(`Creating Unlighthouse ${configFile ? `using config from \`${configFile}\`` : ''}`)

  const ws = behavior.ws !== undefined ? behavior.ws : new WS()

  const ctx = {
    runtimeSettings,
    hooks,
    resolvedConfig,
    ws,
    provider,
  } as unknown as HostCtx

  // Build legacyClusterEngine — will be initialized lazily when runtimeSettings is complete
  // (siteUrl must be set first, which happens in setSiteUrl / setCiContext)
  let engineRef: Awaited<ReturnType<typeof legacyClusterEngine>> | null = null

  const getOrCreateEngine = async () => {
    if (engineRef)
      return engineRef
    engineRef = await legacyClusterEngine({
      resolvedConfig,
      runtimeSettings: ctx.runtimeSettings as RuntimeSettings,
      hooks: hooks as never,
      logger,
    })
    return engineRef
  }

  ctx.setCiContext = async () => {
    const $site = new $URL(resolvedConfig.site)

    logger.debug(`Setting Unlighthouse CI Context [Site: ${$site}]`)

    let outputPath = join(
      resolvedConfig.outputPath,
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

    if (ws === null)
      outputPath = resolvedConfig.outputPath

    ctx.runtimeSettings = {
      ...ctx.runtimeSettings,
      outputPath,
      generatedClientPath: outputPath,
      resolvedClientPath: '',
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

    let resolvedClientPath = ''
    try {
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
      sites: createSitesStore({ outputPath: resolvedConfig.outputPath }),
    }

    const mountDeps = {
      resolvedConfig,
      runtimeSettings: ctx.runtimeSettings as RuntimeSettings,
      hooks: hooks as never,
      ws,
      logger,
    }
    await mountServer(mountDeps, app, { handlerCtx })

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

    // Legacy generateClient call removed (file dies in Step H — use createUnlighthouseHost.generateClient).
    void resolvedClientPath

    if (behavior.autoStartOnVisit) {
      hooks.hookOnce('visited-client', () => {
        ctx.start()
      })
    }
    return ctx
  }

  ctx.start = async () => {
    logger.debug(`Starting Unlighthouse [Server: ${ws === null ? 'N/A' : ctx.runtimeSettings.clientUrl} Site: ${ctx.resolvedConfig.site} Debug: \`${ctx.resolvedConfig.debug}\`]`)

    const engine = await getOrCreateEngine()
    ctx.worker = engine.worker

    // Run auth flow if configured (Step C)
    if (resolvedConfig.hooks?.authenticate) {
      await engine.worker.cluster.execute({}, async (taskCtx) => {
        logger.debug('Running authentication hook')
        await taskCtx.page.setBypassCSP(true)

        await hooks.callHook('authenticate', taskCtx.page)
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
        // @ts-expect-error untyped
        ctx.resolvedConfig.cookies = [...(ctx.resolvedConfig.cookies || []), ...cookies as any as ResolvedUserConfig['cookies']]
        ctx.resolvedConfig.localStorage = { ...ctx.resolvedConfig.localStorage, ...localStorageData }
        ctx.resolvedConfig.sessionStorage = { ...ctx.resolvedConfig.sessionStorage, ...sessionStorageData }
      })
    }

    const siteUrl = ctx.runtimeSettings.siteUrl
    const orchDeps = {
      resolvedConfig,
      siteUrl,
      logger,
    }
    ctx.routes = await crawlSite(orchDeps)
    logger.debug('Discovered and filtered routes', ctx.routes.length)

    if (ws) {
      createBroadcastingEvents({
        ws,
        hooks: hooks as never,
        worker: engine.worker,
      })
    }

    // History tracking now wired via historySubscriber in createUnlighthouseHost; legacy path removed.

    if (behavior.showBanner) {
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
        `⛵‍  ${colorize('bold', colorize('blueBright', AppName))} ${colorize('dim', `${behavior.label ?? ''} @ v${version}`)}`,
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
        [
          ctx.runtimeSettings.clientUrl ? colorize('whiteBright', `Report: ${ctx.runtimeSettings.clientUrl}`) : '',
        ].join('\n'),
        title.join('\n'),
      ))
      if (existsSync(join(ctx.runtimeSettings.generatedClientPath, 'reports', 'lighthouse.json')) && ctx.resolvedConfig.cache)
        logger.info(`Restoring reports from cache. ${colorize('gray', 'You can disable this behavior by passing --no-cache.')}`)
    }

    engine.worker.queueRoutes(ctx.routes)
    return ctx
  }

  if (ctx.resolvedConfig.site)
    ctx.setSiteUrl(resolvedConfig.site)

  return ctx
}
