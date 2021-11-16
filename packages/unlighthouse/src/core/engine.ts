import { ensureDirSync } from 'fs-extra'
import defu from 'defu'
import { $URL } from 'ufo'
import groupBy from 'lodash/groupBy'
import map from 'lodash/map'
import sampleSize from 'lodash/sampleSize'
import { NormalisedRoute, Options, Provider, UnlighthouseEngineContext } from '@shared'
import { createApi, createMockRouter, normaliseRoute } from '../router'
import { defaultOptions, createLogger } from '../core'
import { generateBuild } from '../core/build'
import WS from '../server/ws'
import { createUnlighthouseWorker, inspectHtmlTask, runLighthouseTask } from '../puppeteer'

export const createEngine = async(provider: Provider, options: Options) => {
  options = defu(options, defaultOptions) as Options

  const logger = createLogger(options.debug)

  const $url = new $URL(options.host)

  options.outputPath = `${options.outputPath}/${$url.hostname}`

  logger.info(`Saving lighthouse reports to: ${options.outputPath}`)

  ensureDirSync(options.outputPath)

  const tasks = {
    inspectHtmlTask,
    runLighthouseTask,
  }

  const worker = await createUnlighthouseWorker(tasks, options)

  const ws = new WS()

  const client = await generateBuild({
    ...options
  })

  const ctx: Partial<UnlighthouseEngineContext> = {
    client,
    ws,
    worker,
    provider,
    options,
  }

  ctx.api = createApi(ctx as UnlighthouseEngineContext)

  const initialScanPaths: () => Promise<NormalisedRoute[]> = async() => {
    if (!provider.urls || !provider.routeDefinitions)
      return []

    const routeDefinitions = await provider.routeDefinitions()
    if (!routeDefinitions)
      return []

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

  ctx.start = async() => {
    (await initialScanPaths()).forEach((route) => {
      worker.processRoute(route)
    })
  }

  return ctx
}
