import { join } from 'path'
import { IncomingMessage } from 'http'
import { Socket } from 'node:net'
import { ensureDirSync } from 'fs-extra'
import { $URL, joinURL } from 'ufo'
import {
  MockRouter,
  Provider,
  ResolvedUserConfig,
  RouteDefinition,
  RuntimeSettings,
  UnlighthouseEngineContext,
  UserConfig,
  WorkerHooks,
} from '@shared'
import { createContext } from 'unctx'
import { createHooks } from 'hookable'
import { listen } from 'listhen'
import { createApp } from 'h3'
import { createApi, createMockRouter } from '../router'
import { WS, createBroadcastingEvents } from '../router/broadcasting'
import { createUnlighthouseWorker, inspectHtmlTask, runLighthouseTask } from '../puppeteer'
import { generateClient } from './build'
import { discoverProvider, resolveReportableRoutes } from './discovery'
import { resolveUserConfig } from './config'
import { CLIENT_NAME } from './constants'
import { createLogger } from './logger'
import open from 'open'

const engineContext = createContext<UnlighthouseEngineContext>()

export const useUnlighthouseEngine = engineContext.use as () => UnlighthouseEngineContext

const setupRuntimeSettings = (config: ResolvedUserConfig) => {
  const $host = new $URL(config.host)
  const outputPath = join(config.root, config.outputPath, $host.hostname)
  const generatedClientPath = join(outputPath, 'client')
  const resolvedClientPath = require.resolve(CLIENT_NAME)

  return {
    $host,
    resolvedClientPath,
    outputPath,
    generatedClientPath,
    isLocalhost: $host.hostname.startsWith('localhost'),
  }
}

export const createUnlighthouse = async(config: UserConfig, provider?: Provider) => {
  const resolvedConfig = resolveUserConfig(config)
  const hooks = createHooks<WorkerHooks>()

  const logger = createLogger(resolvedConfig.debug)
  logger.info(`Booting Unlighthouse: ${resolvedConfig.host}`)

  const runtimeSettings = setupRuntimeSettings(resolvedConfig) as unknown as RuntimeSettings

  // if no provider was provided we can try and discover it ourselves
  if (!provider) {
    const discoveredProvider = discoverProvider(resolvedConfig)
    if (discoveredProvider) {
      provider = discoveredProvider
    } else {
      logger.info(`Missing provider, assuming static scan.`)
    }
  }

  let routeDefinitions: RouteDefinition[]|undefined
  if (provider?.routeDefinitions)
    routeDefinitions = await provider.routeDefinitions()

  let mockRouter: MockRouter|null = null
  runtimeSettings.hasRouteDefinitions = !!routeDefinitions
  if (routeDefinitions)
    mockRouter = createMockRouter(routeDefinitions)

  ensureDirSync(resolvedConfig.outputPath)

  // web socket instance for broadcasting
  const ws = new WS()

  const ctx = {
    runtimeSettings,
    hooks,
    resolvedConfig,
    routeDefinitions,
    ws,
    provider,
    mockRouter,
  } as UnlighthouseEngineContext
  engineContext.set(ctx, true)

  const tasks = {
    inspectHtmlTask,
    runLighthouseTask,
  }

  const worker = await createUnlighthouseWorker(tasks)

  ctx.worker = worker
  ctx.api = createApi()

  ctx.start = async(serverUrl) => {
    const $host = new $URL(serverUrl)
    ctx.runtimeSettings.apiUrl = joinURL($host.toString(), resolvedConfig.api.prefix)
    ctx.runtimeSettings.websocketUrl = `ws://${joinURL($host.host, resolvedConfig.api.prefix, '/ws')}`

    ctx.routes = await resolveReportableRoutes()
    await generateClient()
    await createBroadcastingEvents()
    worker.queueRoutes(ctx.routes)
    const mode = ctx.routes.length <= 1 ? 'crawl' : 'sitemap'
    if (mode === 'crawl') {
      logger.info(`Unlighthouse started, crawling host for routes...`)
    } else {
      logger.info(`Unlighthouse started, sampling \`${ctx.routes.length}\` routes from sitemap...`)
    }
  }

  ctx.startWithServer = async() => {
    const app = createApp()
    app.use(ctx.api)
    const server = await listen(app, {
      ...resolvedConfig.server,
      // delay opening the server until the app is ready
      open: false,
    })
    await ctx.start(server.url)

    server.server.on('upgrade', (request: IncomingMessage, socket) => {
      ws.handleUpgrade(request, socket as Socket)
    })

    if (resolvedConfig.server.open) {
      await open(server.url)
    }
  }

  return ctx
}
