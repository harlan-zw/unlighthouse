import { join } from 'path'
import { existsSync } from 'fs'
import { IncomingMessage } from 'http'
import { Socket } from 'node:net'
import { ensureDirSync, rmSync } from 'fs-extra'
import { $URL, joinURL } from 'ufo'
import type {
  Provider,
  UnlighthouseContext,
  UserConfig,
  UnlighthouseHooks,
} from 'unlighthouse-utils'
import { createContext } from 'unctx'
import { createHooks } from 'hookable'
import { loadConfig } from 'unconfig'
import defu from 'defu'
import objectHash from 'object-hash'
// @ts-ignore
import { successBox } from '@nuxt/cli/dist/cli-index.js'
import { createApi, createMockRouter } from '../router'
import { WS, createBroadcastingEvents } from '../router/broadcasting'
import { createUnlighthouseWorker, inspectHtmlTask, runLighthouseTask } from '../puppeteer'
import { version } from '../../package.json'
import { generateClient } from './build'
import { resolveReportableRoutes, discoverRouteDefinitions } from './discovery'
import { resolveUserConfig } from './resolveConfig'
import { APP_NAME, CLIENT_NAME, TAG_LINE } from './constants'
import { createLogger } from './logger'
import { normaliseHost } from './util'
import { resolvePath } from 'mlly'


const engineContext = createContext<UnlighthouseContext>()

/**
 * Use the unlighthouse instance.
 */
export const useUnlighthouse = engineContext.use as () => UnlighthouseContext

/**
 * Create a unique single unlighthouse instance that can be referenced globally with `useUnlighthouse()`. Scanning will
 * not start automatically, a server context needs to be provided using `setServerContext()`.
 *
 * @param userConfig
 * @param provider
 */
export const createUnlighthouse = async(userConfig: UserConfig, provider?: Provider) => {
  let configFile: string|null = null
  // support loading configuration files
  const configDefinition = await loadConfig<UserConfig>({
    cwd: userConfig.root || process.cwd(),
    sources: [
      {
        files: [
          'unlighthouse.config',
          // may provide the config file as an argument
          ...(userConfig.configFile ? [userConfig.configFile] : []),
        ],
        // default extensions
        extensions: ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs', 'json', ''],
      },
    ],
  })

  if (configDefinition.sources?.[0]) {
    configFile = configDefinition.sources[0]
    userConfig = defu(configDefinition.config, userConfig)
  }
  const runtimeSettings = {
    configFile,
    moduleWorkingDir: __dirname,
    configCacheKey: '',
  }
  // create a cache key for the users provided key so we can cache burst on config update
  runtimeSettings.configCacheKey = objectHash(userConfig).substring(0, 4)

  const resolvedConfig = resolveUserConfig(userConfig)
  const hooks = createHooks<UnlighthouseHooks>()

  const logger = createLogger(resolvedConfig.debug)
  logger.debug(`Creating Unlighthouse ${configFile ? `using config from \`${configFile}\`` : ''}`)

  // web socket instance for broadcasting
  const ws = new WS()

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

  ctx.setServerContext = async({ url, server, app }) => {
    const serverUrl = url
    const $server = new $URL(serverUrl)
    if (!resolvedConfig.host)
      resolvedConfig.host = normaliseHost(serverUrl)
    const $host = new $URL(resolvedConfig.host)

    logger.debug(`Setting Unlighthouse Server Context [Host: ${$host} Server: ${$server}]`)

    const outputPath = join(resolvedConfig.root, resolvedConfig.outputPath, $host.hostname, runtimeSettings.configCacheKey)
    const clientUrl = joinURL($server.toString(), resolvedConfig.router.prefix)
    const apiPath = joinURL(resolvedConfig.router.prefix, resolvedConfig.api.prefix)
    ctx.runtimeSettings.serverUrl = url
    ctx.runtimeSettings = {
      ...ctx.runtimeSettings,
      outputPath,
      apiPath,
      generatedClientPath: join(outputPath, 'client'),
      resolvedClientPath: await resolvePath(CLIENT_NAME, { url: import.meta.url }),
      clientUrl,
      apiUrl: joinURL($server.toString(), apiPath),
      websocketUrl: `ws://${joinURL($server.host, apiPath, '/ws')}`,
    }

    ctx.api = createApi()
    // make the router use our router
    app.use((...args) => ctx.api(...args))
    // increase server listener size
    server.setMaxListeners(30)

    server.on('upgrade', (request: IncomingMessage, socket) => {
      ws.handleUpgrade(request, socket as Socket)
    })

    if (!resolvedConfig.cacheReports && existsSync(resolvedConfig.outputPath)) {
      logger.debug(`\`cacheReports\` is disabled, deleting cache folder: \`${resolvedConfig.outputPath}\``)
      rmSync(resolvedConfig.outputPath, { recursive: true })
    }
    ensureDirSync(ctx.runtimeSettings.outputPath)
    await generateClient()

    if (provider?.name !== 'cli') {
      // start if the user visits the client
      hooks.hookOnce('visited-client', () => {
        ctx.start()
      })
    }
  }

  ctx.start = async() => {
    if (worker.hasStarted()) {
      logger.debug('Attempted to start Unlighthouse, has already started.')
      return
    }

    logger.debug(`Starting Unlighthouse [Server: ${ctx.runtimeSettings.clientUrl} Host: ${ctx.resolvedConfig.host} Debug: \`${ctx.resolvedConfig.debug}\`]`)

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

    // fancy CLI banner when we start
    const chalk = new (await import('chalk')).Chalk()
    const label = (name: string) => chalk.bold.magenta(`▸ ${name}:`)
    const mode = ctx.routes.length <= 1 ? 'crawl' : 'sitemap'
    process.stdout.write(successBox(
      // messages
      [
        `Root: ${chalk.dim(resolvedConfig.root)}`,
        `URL: ${ctx.runtimeSettings.clientUrl}`,
      ].join('\n'),
      // title
      [
        `⛵  ${chalk.bold.blueBright(APP_NAME)} @ v${version}`,
        '',
        chalk.dim.italic(TAG_LINE),
        '',
        `${label('Scanning')} ${resolvedConfig.host}`,
        `${label('Route Discovery')} ${mode === 'crawl' ? 'Crawl' : 'Sitemap + Crawl'}`,
        `${label('Route Definitions')} ${!ctx.routeDefinitions ? 'None' : ctx.routeDefinitions.length}`,
      ].join('\n'),
    ))
  }

  return ctx
}
