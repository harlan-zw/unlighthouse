import type { IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'
import type {
  Provider,
  ResolvedUserConfig,
  RuntimeSettings,
  UnlighthouseContext,
  UnlighthouseHooks,
  UserConfig,
} from './types'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { isAbsolute, join, dirname as pathDirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from 'c12'
import { colorize } from 'consola/utils'
import { defu } from 'defu'
import { createHooks } from 'hookable'
import { $fetch } from 'ofetch'
import { $URL, joinURL } from 'ufo'
import { createContext } from 'unctx'
import { version } from '../package.json'
import { generateClient } from './build'
import { AppName, ClientPkg } from './constants'
import { discoverRouteDefinitions, resolveReportableRoutes } from './discovery'
import { createLogger } from './logger'
import { createUnlighthouseWorker, inspectHtmlTask, runLighthouseTask } from './puppeteer'
import { resolveUserConfig } from './resolveConfig'
import { createApi, createBroadcastingEvents, createMockRouter, WS } from './router'
import { normaliseHost } from './util'
import { successBox } from './util/cliFormatting'

const engineContext = createContext<UnlighthouseContext>()

export { useLogger } from './logger'
/**
 * Use the unlighthouse instance.
 */
export const useUnlighthouse = engineContext.tryUse as () => UnlighthouseContext

/**
 * A simple define wrapper to provide typings to config definitions.
 * @deprecated Use `defineUnlighthouseConfig` from `unlighthouse/config` instead.
 */
export function defineConfig(config: UserConfig) {
  return config
}

/**
 * Create a unique single unlighthouse instance that can be referenced globally with `useUnlighthouse()`. Scanning will
 * not start automatically, a server context needs to be provided using `setServerContext()`.
 *
 * @param userConfig
 * @param provider
 */
export async function createUnlighthouse(userConfig: UserConfig, provider?: Provider) {
  const logger = createLogger(userConfig.debug)
  const __dirname = pathDirname(fileURLToPath(import.meta.url))
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
  }
  // path to the lighthouse worker file
  const mjsPath = join(runtimeSettings.moduleWorkingDir, 'lighthouse.mjs')
  if (existsSync(mjsPath)) {
    runtimeSettings.lighthouseProcessPath = mjsPath
  }
  else {
    // ts module in stub mode
    runtimeSettings.lighthouseProcessPath = join(runtimeSettings.moduleWorkingDir, 'lighthouse.ts')
  }

  // create a cache key for the users provided key so we can cache burst on config update
  runtimeSettings.configCacheKey = createHash('md5')
    .update(JSON.stringify({ ...userConfig, version }))
    .digest('hex')
    .substring(0, 4)

  const resolvedConfig = await resolveUserConfig(userConfig)
  logger.debug('Post config resolution', resolvedConfig)

  const hooks = createHooks<UnlighthouseHooks>()

  // add hooks from config
  if (resolvedConfig.hooks)
    hooks.addHooks(resolvedConfig.hooks)

  await hooks.callHook('resolved-config', resolvedConfig)

  if (configFile)
    logger.info(`Creating Unlighthouse ${configFile ? `using config from \`${configFile}\`` : ''}`)

  // web socket instance for broadcasting
  const ws = provider?.name === 'ci' ? null : new WS()

  const ctx = {
    runtimeSettings,
    hooks,
    resolvedConfig,
    ws,
    provider,
  } as unknown as UnlighthouseContext
  engineContext.set(ctx, true)

  const tasks = {
    inspectHtmlTask,
    runLighthouseTask,
  }

  const worker = await createUnlighthouseWorker(tasks)

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
      await mkdir(resolvedConfig.outputPath, { recursive: true })
    }
    catch (e) {
      logger.error(`Failed to create output directory. Please check unlighthouse has permissions to: ${resolvedConfig.outputPath}`, e)
    }

    try {
      await mkdir(outputPath, { recursive: true })
    }
    catch (e) {
      logger.error(`Failed to create output directory. Please check unlighthouse has permission to create files and folders in: ${resolvedConfig.outputPath}`, e)
    }

    if (provider?.name === 'ci')
      outputPath = resolvedConfig.outputPath

    ctx.runtimeSettings = {
      ...ctx.runtimeSettings,
      outputPath,
      generatedClientPath: outputPath,
      resolvedClientPath: fileURLToPath(import.meta.resolve(ClientPkg)),
    }

    if (!resolvedConfig.cache && existsSync(resolvedConfig.outputPath)) {
      logger.debug(`\`cache\` is disabled, deleting cache folder: \`${resolvedConfig.outputPath}\``)
      rmSync(outputPath, { recursive: true })
    }
    mkdirSync(ctx.runtimeSettings.outputPath, { recursive: true })
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

    const clientUrl = joinURL($server.toString(), resolvedConfig.routerPrefix)
    const apiPath = joinURL(resolvedConfig.routerPrefix, resolvedConfig.apiPrefix)
    ctx.runtimeSettings.serverUrl = url
    ctx.runtimeSettings = {
      ...ctx.runtimeSettings,
      apiPath,
      server,
      resolvedClientPath: fileURLToPath(import.meta.resolve(ClientPkg)),
      clientUrl,
      apiUrl: joinURL($server.toString(), apiPath),
      websocketUrl: `ws://${joinURL($server.host, apiPath, '/ws')}`,
    }

    ctx.api = await createApi(app)

    if (ws) {
      server.on('upgrade', (request: IncomingMessage, socket) => {
        ws.handleUpgrade(request, socket as Socket)
      })
    }

    if (!resolvedConfig.cache && existsSync(ctx.runtimeSettings.outputPath)) {
      logger.debug(`\`cache\` is disabled, deleting cache folder: \`${ctx.runtimeSettings.outputPath}\``)
      try {
        rmSync(ctx.runtimeSettings.outputPath, { recursive: true })
      }
      catch (e) {
        logger.debug(`Failed to delete cache folder: \`${ctx.runtimeSettings.outputPath}\``, e)
      }
    }
    mkdirSync(ctx.runtimeSettings.outputPath, { recursive: true })
    await generateClient()

    if (provider?.name !== 'cli') {
      // start if the user visits the client
      hooks.hookOnce('visited-client', () => {
        ctx.start()
      })
    }
    return ctx
  }

  ctx.start = async () => {
    logger.debug(`Starting Unlighthouse [Server: ${provider?.name === 'ci' ? 'N/A' : ctx.runtimeSettings.clientUrl} Site: ${ctx.resolvedConfig.site} Debug: \`${ctx.resolvedConfig.debug}\`]`)

    if (typeof provider?.routeDefinitions === 'function')
      ctx.routeDefinitions = await provider.routeDefinitions()
    else
      ctx.routeDefinitions = provider?.routeDefinitions

    // generate our own route definitions if the integration can't provide them
    if (!ctx.routeDefinitions && resolvedConfig.discovery !== false) {
      logger.debug('No route definitions provided, discovering them ourselves.')
      ctx.routeDefinitions = await discoverRouteDefinitions()
    }

    if (ctx.routeDefinitions?.length) {
      ctx.provider = ctx.provider || {}
      if (typeof ctx.provider?.mockRouter === 'function')
        ctx.provider.mockRouter = ctx.provider.mockRouter(ctx.routeDefinitions)
      else if (!ctx.provider.mockRouter)
        ctx.provider.mockRouter = createMockRouter(ctx.routeDefinitions)
      logger.debug(`Discovered ${ctx.routeDefinitions?.length} definitions and setup mock router.`)
    }

    ctx.routes = await resolveReportableRoutes()
    logger.debug('Resolved reportable routes', ctx.routes.length)
    createBroadcastingEvents()

    // Show the static info box first (before any progress starts)
    if (provider?.name !== 'ci') {
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
        `⛵\u200D  ${colorize('bold', colorize('blueBright', AppName))} ${colorize('dim', `${provider?.name} @ v${version}`)}`,
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
      if (ctx.routeDefinitions?.length)
        title.push(`${label('Route Definitions')} ${ctx.routeDefinitions.length}`)

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
