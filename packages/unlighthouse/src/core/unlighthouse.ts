import { join } from 'path'
/*import type { IncomingMessage } from 'http'
import type { Socket } from 'node:net'*/
import { ensureDirSync, rmSync } from 'fs-extra'
import { $URL, joinURL } from 'ufo'
import type {
  Provider,
  RouteDefinition,
  UnlighthouseContext,
  UserConfig,
  WorkerHooks,
} from 'unlighthouse-utils'
import { createContext } from 'unctx'
import { createHooks } from 'hookable'
import open from 'open'
import { createApi, createMockRouter } from '../router'
import { WS, createBroadcastingEvents } from '../router/broadcasting'
import { createUnlighthouseWorker, inspectHtmlTask, runLighthouseTask } from '../puppeteer'
import { generateClient } from './build'
import { discoverProvider, resolveReportableRoutes } from './discovery'
import { resolveUserConfig } from './resolveConfig'
import { CLIENT_NAME } from './constants'
import { createLogger } from './logger'
import { normaliseHost } from './util'
import {loadConfig} from "unconfig";
import defu from "defu";
import objectHash from 'object-hash'
import {existsSync} from "fs";
import { IncomingMessage } from 'http'
import {Socket} from "node:net";

const engineContext = createContext<UnlighthouseContext>()

export const useUnlighthouse = engineContext.use as () => UnlighthouseContext

export const createUnlighthouse = async(userConfig: UserConfig, provider?: Provider) => {
  const runtimeSettings = {
    moduleWorkingDir: __dirname,
    configCacheKey: ''
  }
  const configDefinition = await loadConfig<UserConfig>({
    sources: [
      {
        files: 'unlighthouse.config',
        // default extensions
        extensions: ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs', 'json', ''],
      },
    ],
  })
  if (configDefinition) {
    userConfig = defu(configDefinition.config, userConfig)
  }
  // create a cache key for the users provided key so we can cache burst on config update
  runtimeSettings.configCacheKey = objectHash(userConfig).substring(0, 4)

  const resolvedConfig = resolveUserConfig(userConfig)
  const hooks = createHooks<WorkerHooks>()


  const logger = createLogger(resolvedConfig.debug)
  logger.debug('Creating Unlighthouse')

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
    // userFlowTask,
  }

  const worker = await createUnlighthouseWorker(tasks)

  ctx.worker = worker

  ctx.setServerContext = async ({ url, server, app }) => {
    const serverUrl = url
    const $host = new $URL(serverUrl)
    logger.debug(`Setting Unlighthouse server context ${$host}`)
    if (!resolvedConfig.host)
      resolvedConfig.host = normaliseHost(serverUrl)

    const outputPath = join(resolvedConfig.root, resolvedConfig.outputPath, $host.hostname + '-' + runtimeSettings.configCacheKey)
    const clientUrl = joinURL($host.toString(), resolvedConfig.router.prefix)
    const apiPath = joinURL(resolvedConfig.router.prefix, resolvedConfig.api.prefix)
    ctx.runtimeSettings.serverUrl = url
    ctx.runtimeSettings = {
      ...ctx.runtimeSettings,
      outputPath,
      apiPath,
      generatedClientPath: join(outputPath, 'client'),
      resolvedClientPath: require.resolve(CLIENT_NAME),
      clientUrl,
      apiUrl: joinURL($host.toString(), apiPath),
      websocketUrl: `ws://${joinURL($host.host, apiPath, '/ws')}`,
    }

    ctx.api = createApi()
    // make the router use our router
    app.use((...args) => {
      return ctx.api(...args)
    })
    server.on('upgrade', (request: IncomingMessage, socket) => {
      ws.handleUpgrade(request, socket as Socket)
    })

    if (!resolvedConfig.cacheReports && existsSync(resolvedConfig.outputPath)) {
      logger.debug(`\`cacheReports\` is disabled, deleting cache folder: \`${resolvedConfig.outputPath}\``)
      rmSync(resolvedConfig.outputPath, { recursive: true })
    }
    ensureDirSync(resolvedConfig.outputPath)
    await generateClient()
  }

  ctx.start = async() => {
    if (worker.hasStarted()) {
      logger.warn('Unlighthouse has already started.')
      return
    }
    logger.info(`Starting Unlighthouse [Server: ${ctx.runtimeSettings.clientUrl} Host: ${ctx.resolvedConfig.host} Debug: \`${ctx.resolvedConfig.debug}\`]`)

    // if no provider was provided we can try and discover it ourselves
    if (!provider) {
      const discoveredProvider = discoverProvider(resolvedConfig)
      if (discoveredProvider)
        provider = discoveredProvider
      else
        logger.info('Missing provider, assuming static scan.')
    }

    if (typeof provider?.routeDefinitions === 'function') {
      ctx.routeDefinitions = await provider.routeDefinitions()
    } else
      ctx.routeDefinitions = provider?.routeDefinitions

    ctx.routes = await resolveReportableRoutes()
    await createBroadcastingEvents()
    worker.queueRoutes(ctx.routes)
    const mode = ctx.routes.length <= 1 ? 'crawl' : 'sitemap'
    if (mode === 'crawl')
      logger.info('Unlighthouse started, crawling host for routes...')
    else
      logger.info(`Unlighthouse started, sampling \`${ctx.routes.length}\` routes from sitemap...`)

    if (provider?.name === 'cli' && resolvedConfig.server.open)
      await open(ctx.runtimeSettings.clientUrl)
  }

  return ctx
}
