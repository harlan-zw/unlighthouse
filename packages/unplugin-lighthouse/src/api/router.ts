import {basename, dirname, relative} from 'path'
import fs from 'fs'
import { createRouter, useBody, useParams } from 'unrouted'
import cors from 'cors'
import { RouteDefinition } from 'nuxt-kit-extras/types'
// import { PLUGIN_PATH_PREFIX } from '../core'
import {Options, Provider, RouteReport} from '../types'
import logger from "../core/logger";
import {extractSitemapRoutes} from "../node/sitemap";

export type RuntimeAppData = {
  routeProcessor: {
    // cluster,
    processRoute: (route: RouteDefinition) => void,
    // processRoutes,
    runningTasks: () => number,
    hasStarted: () => boolean,
    reports: () => RouteReport[],
  },
  options: Options
  provider: Provider
}

export const createApi = ({ routeProcessor, provider, options }: RuntimeAppData) => {
  const { serve, group, handle, get, } = createRouter({
    // prefix: PLUGIN_PATH_PREFIX,
    // hooks: {
    //   'serve:before-route:/': () => {
    //     // start processing when the user visits the page
    //    // appData.onAppVisit()
    //   },
    // },
  })

  const reports = () => {
    // await onAppVisit()
    return routeProcessor.reports().map((report) => {
      if (report.route.component)
        report.route.component = relative(rootDir, report.route.component)

      return report
    })
  }


  const scannedSites = new Set<string>()
  get('*', cors())

  group('/api', ({ get, post }) => {
    post('site', async () => {
      const { site } = useBody<{ site: string }>()
      if (!scannedSites.has(site)) {
        scannedSites.add(site)

        const { sites } = await extractSitemapRoutes(site)

        sites.forEach(route => routeProcessor.processRoute(route))
      }
      return site
    })

    get('reports', () => routeProcessor.reports())
    get('reports/:id', async() => {
      const { id } = useParams<{ id: string }>()
      const report = routeProcessor.reports().filter(report => report.reportId === id)[0]
      return fs.readFileSync(report.reportHtml, 'utf-8')
    })

    get('routes', () => provider.routes())
    get('stats', () => {
      const stats = provider.stats ? provider.stats() : {}
      const data = routeProcessor.reports()
      let score = 0
      if (data && data.length > 0) {
        // @ts-ignore
        score = data
            .map(r => r.score)
            // @ts-ignore
            .reduce((s, a) => s + a, 0) / data.length
      }

      return {
        score,
        runningTasks: routeProcessor.runningTasks(),
        staticRoutes: data.length,
        ...stats,
      }
    })

    post('known-routes', async() => {
        // has started processing
        if (routeProcessor.hasStarted())
          return
        // maybe start processing routes once they visit the app
        const routes = await getRoutes()
        processRoutes(routes)
        logger.info(`Started processing with ${routes.length} static routes.`)

      routeProcessor.processRoute(useBody<RouteDefinition>())
      return { success: true }
    })
  })

  const module = require.resolve('unplugin-lighthouse-client')
  serve('/', dirname(module))

  return handle
}
