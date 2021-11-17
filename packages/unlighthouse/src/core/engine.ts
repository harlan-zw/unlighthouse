import { ensureDirSync } from 'fs-extra'
import defu from 'defu'
import {$URL, joinURL} from 'ufo'
import groupBy from 'lodash/groupBy'
import map from 'lodash/map'
import sampleSize from 'lodash/sampleSize'
import {NormalisedRoute, Options, Provider, RouteDefinition, UnlighthouseEngineContext} from '@shared'
import { createApi, createMockRouter, normaliseRoute } from '../router'
import { defaultOptions, createLogger } from '../core'
import { generateBuild } from '../core/build'
import WS from '../server/ws'
import { createUnlighthouseWorker, inspectHtmlTask, runLighthouseTask } from '../puppeteer'
import {join} from "path";

export const createEngine = async(provider: Provider, options: Options) => {
  options = defu(options, defaultOptions) as Options

  const logger = createLogger(options.debug)

  const $url = new $URL(options.host)

  // for local urls we disable throttling
  if (options.lighthouse && $url.hostname.startsWith('localhost')) {
    options.lighthouse.throttling = {
      rttMs: 0,
      throughputKbps: 0,
      cpuSlowdownMultiplier: 0,
      requestLatencyMs: 0, // 0 means unset
      downloadThroughputKbps: 0,
      uploadThroughputKbps: 0,
    }
  }

  options.outputPath = join(options.outputPath, $url.hostname)
  options.clientPath = join(options.outputPath, '__client')

  logger.info(`Saving lighthouse reports to: ${options.outputPath}`)

  ensureDirSync(options.outputPath)

  const tasks = {
    inspectHtmlTask,
    runLighthouseTask,
  }

  const worker = await createUnlighthouseWorker(tasks, options)

  const ws = new WS()

  let routeDefinitions: RouteDefinition[]|undefined = undefined
  if (provider.routeDefinitions) {
    routeDefinitions = await provider.routeDefinitions()
  }
  options.hasDefinitions = !!routeDefinitions
  if (!routeDefinitions) {
    console.log('disabling group routing')
    options.groupRoutes = false
  }

  const ctx: Partial<UnlighthouseEngineContext> = {
    routeDefinitions,
    ws,
    worker,
    provider,
    options,
  }

  ctx.api = createApi(ctx as UnlighthouseEngineContext)

  const initialScanPaths: () => Promise<NormalisedRoute[]> = async() => {
    // @todo automatic sitemap / crawler url discovery
    if (!provider.urls)
      return []

    // no route definitions provided
    if (!routeDefinitions) {
      return (await provider.urls()).map(url => normaliseRoute(url))
    }

    const mockRouter = createMockRouter(routeDefinitions)

    const urls = await provider.urls()

    // group all urls by their route definition path name
    const pathsChunkedToRouteName = groupBy(
        urls
            .map(url => normaliseRoute(url, mockRouter))
            .filter(route => route !== false) as NormalisedRoute[],
        u => u.definition.name,
    )

    const pathsSampleChunkedToRouteName = map(
        pathsChunkedToRouteName,
        // we're matching dynamic rates here, only taking a sample to avoid duplicate tests
        (group) => {
          // whatever the sampling rate is
          return sampleSize(group, options.dynamicRouteSampleSize)
        })

    return pathsSampleChunkedToRouteName.flat()
  }

  ctx.start = async(serverUrl: string) => {
    const $url = new $URL(serverUrl)
    const apiUrl = joinURL($url.toString(), options.apiPrefix)
    ctx.client = await generateBuild({
      ...options,
      apiUrl,
      wsUrl: 'ws://' + joinURL($url.host, options.apiPrefix, '/ws')
    })
    worker.processRoutes(await initialScanPaths())
  }

  return ctx as UnlighthouseEngineContext
}
