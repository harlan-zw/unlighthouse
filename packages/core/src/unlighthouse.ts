import { isAbsolute, join } from 'path'
import { existsSync } from 'fs'
import type { IncomingMessage } from 'http'
import type { Socket } from 'node:net'
import fs from 'fs-extra'
import { $URL, joinURL } from 'ufo'
import { createContext } from 'unctx'
import { createHooks } from 'hookable'
import { loadConfig } from 'unconfig'
import { defu } from 'defu'
import objectHash from 'object-hash'
import { createCommonJS, resolvePath } from 'mlly'
import { version } from '../package.json'
import { WS, createApi, createBroadcastingEvents, createMockRouter } from './router'
import { createUnlighthouseWorker, inspectHtmlTask, runLighthouseTask } from './puppeteer'
import type {
  Provider, RuntimeSettings,
  UnlighthouseContext,
  UnlighthouseHooks,
  UserConfig,
} from './types'
import { generateClient } from './build'
import { discoverRouteDefinitions, resolveReportableRoutes } from './discovery'
import { resolveUserConfig } from './resolveConfig'
import { AppName, ClientPkg } from './constants'
import { createLogger } from './logger'
import { normaliseHost } from './util'
import { successBox } from './util/cliFormatting'

const engineContext = createContext<UnlighthouseContext>()

export { useLogger } from './logger'
/**
 * Use the unlighthouse instance.
 */
export const useUnlighthouse = engineContext.use as () => UnlighthouseContext

/**
 * A simple define wrapper to provide typings to config definitions.
 * @param config
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
export const createUnlighthouse = async(userConfig: UserConfig, provider?: Provider) => {
  const logger = createLogger(userConfig.debug)
  const { __dirname } = createCommonJS(import.meta.url)
  if (userConfig.root && !isAbsolute(userConfig.root))
    userConfig.root = join(process.cwd(), userConfig.root)
  else if (!userConfig.root)
    userConfig.root = process.cwd()

  logger.debug(`Starting Unlighthouse at root: \`${userConfig.root}\` cwd: ${process.cwd()}`)
  let configFile: string|null = null
  // support loading configuration files
  const configDefinition = await loadConfig<UserConfig>({
    cwd: userConfig.root,
    sources: [
      {
        files: [
          'unlighthouse.config',
          // may provide the config file as an argument
          ...(userConfig.configFile ? [userConfig.configFile] : []),
        ],
        // default extensions
        extensions: ['ts', 'js', 'mjs', 'cjs', 'json', ''],
      },
    ],
  })
  logger.debug('Discovered config definition', configDefinition)

  if (configDefinition.sources?.[0]) {
    configFile = configDefinition.sources[0]
    // @ts-expect-error fixes issue with default being returned for mjs loads
    const config = configDefinition.config?.default || configDefinition.config
    userConfig = defu(config, userConfig)
  }
  const runtimeSettings: { moduleWorkingDir: string; lighthouseProcessPath: string } & Partial<RuntimeSettings> = {
    configFile: configFile || undefined,
    moduleWorkingDir: __dirname,
    configCacheKey: '',
    lighthouseProcessPath: '',
  }
  // path to the lighthouse worker file
  runtimeSettings.lighthouseProcessPath = await resolvePath(
    join(runtimeSettings.moduleWorkingDir, 'process', 'lighthouse.mjs'),
  ).catch(() => {})
  // ts module in stub mode, not sure why extensions won't resolve
  if (!(await fs.pathExists(runtimeSettings.lighthouseProcessPath))) {
    runtimeSettings.lighthouseProcessPath = await resolvePath(
      join(runtimeSettings.moduleWorkingDir, 'process', 'lighthouse.ts'),
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

  logger.debug(`Creating Unlighthouse ${configFile ? `using config from \`${configFile}\`` : ''}`)

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

  ctx.worker = worker

  ctx.setCiContext = async() => {
    const $site = new $URL(resolvedConfig.site)

    logger.debug(`Setting Unlighthouse CI Context [Site: ${$site}]`)

    // avoid nesting reports for ci mode
    let outputPath = join(
      resolvedConfig.root,
      resolvedConfig.outputPath,
      // fix windows not supporting : in paths
      $site.hostname.replace(':', '꞉'),
      runtimeSettings.configCacheKey || '',
    )
    if (provider?.name === 'ci')
      outputPath = join(resolvedConfig.root, resolvedConfig.outputPath)

    ctx.runtimeSettings = {
      ...ctx.runtimeSettings,
      outputPath,
      generatedClientPath: outputPath,
      resolvedClientPath: await resolvePath(ClientPkg, { url: import.meta.url }),
    }

    if (!resolvedConfig.cache && existsSync(resolvedConfig.outputPath)) {
      logger.debug(`\`cache\` is disabled, deleting cache folder: \`${resolvedConfig.outputPath}\``)
      fs.rmSync(resolvedConfig.outputPath, { recursive: true })
    }
    fs.ensureDirSync(ctx.runtimeSettings.outputPath)
    return ctx
  }

  ctx.setSiteUrl = async(url: string) => {
    const site = normaliseHost(url)
    ctx.runtimeSettings.siteUrl = new $URL(site)

    logger.debug(`Setting Unlighthouse Site URL [Site: ${site}]`)

    const outputPath = join(
      resolvedConfig.root,
      resolvedConfig.outputPath,
      // fix windows not supporting : in paths
      runtimeSettings.siteUrl?.hostname.replace(':', '꞉') || '',
      runtimeSettings.configCacheKey || '',
    )

    ctx.resolvedConfig.site = site
    ctx.runtimeSettings.outputPath = outputPath
    ctx.runtimeSettings.generatedClientPath = outputPath

    await hooks.callHook('site-changed', site)
  }

  ctx.setServerContext = async({ url, server, app }) => {
    const $server = new $URL(url)

    logger.debug(`Setting Unlighthouse Server Context [Server: ${$server}]`)

    const clientUrl = joinURL($server.toString(), resolvedConfig.routerPrefix)
    const apiPath = joinURL(resolvedConfig.routerPrefix, resolvedConfig.apiPrefix)
    ctx.runtimeSettings.serverUrl = url
    ctx.runtimeSettings = {
      ...ctx.runtimeSettings,
      apiPath,
      server,
      resolvedClientPath: await resolvePath(ClientPkg, { url: import.meta.url }),
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

    if (!resolvedConfig.cache && existsSync(resolvedConfig.outputPath)) {
      logger.debug(`\`cache\` is disabled, deleting cache folder: \`${resolvedConfig.outputPath}\``)
      fs.rmSync(resolvedConfig.outputPath, { recursive: true })
    }
    fs.ensureDirSync(ctx.runtimeSettings.outputPath)
    await generateClient()

    if (provider?.name !== 'cli') {
      // start if the user visits the client
      hooks.hookOnce('visited-client', () => {
        ctx.start()
      })
    }
    return ctx
  }

  ctx.start = async() => {
    if (worker.hasStarted()) {
      logger.debug('Attempted to start Unlighthouse, has already started.')
      return ctx
    }

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
      if (typeof ctx.provider.mockRouter === 'function')
        ctx.provider.mockRouter = ctx.provider.mockRouter(ctx.routeDefinitions)
      else if (!ctx.provider.mockRouter)
        ctx.provider.mockRouter = createMockRouter(ctx.routeDefinitions)
      logger.debug(`Discovered ${ctx.routeDefinitions?.length} definitions and setup mock router.`)
    }

    ctx.routes = await resolveReportableRoutes()
    await createBroadcastingEvents()
    worker.queueRoutes(ctx.routes)

    if (provider?.name !== 'ci') {
      let chalk = (await import('chalk'))
      if (chalk.default) {
        // @ts-expect-error hacky chalk fix for cjs / mjs issues
        chalk = chalk.default
      }
      // fancy CLI banner when we start
      const label = (name: string) => chalk.bold.magenta(`▸ ${name}:`)
      let mode = ''
      if (resolvedConfig.urls?.length)
        mode = 'Manual'

      if (resolvedConfig.scanner.sitemap)
        mode += 'Sitemap'

      if (resolvedConfig.scanner.crawler)
        mode += mode.length > 0 ? ' + Crawler' : 'Crawler'

      const title = [
        `⛵  ${chalk.bold.blueBright(AppName)} ${chalk.dim(`${provider?.name} @ v${version}`)}`,
        '',
        `${label('Scanning')} ${resolvedConfig.site}`,
        `${label('Route Discovery')} ${mode} ${ctx.routes.length > 1 ? (chalk.dim(`${ctx.routes.length} initial URLs`)) : ''}`,
      ]
      if (ctx.routeDefinitions?.length)
        title.push(`${label('Route Definitions')} ${ctx.routeDefinitions.length}`)

      process.stdout.write(successBox(
        // messages
        [
          `Root: ${chalk.dim(resolvedConfig.root)}`,
          ctx.runtimeSettings.clientUrl ? `URL: ${ctx.runtimeSettings.clientUrl}` : '',
        ].join('\n'),
        // title
        title.join('\n'),
      ))
    }
    return ctx
  }

  if (ctx.resolvedConfig.site)
    ctx.setSiteUrl(resolvedConfig.site)

  return ctx
}
