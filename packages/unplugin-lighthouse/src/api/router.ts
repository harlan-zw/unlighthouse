import {dirname} from 'path'
import fs from 'fs'
import { createRouter, useBody, useParams } from 'unrouted'
import cors from 'cors'
import { RouteDefinition } from 'nuxt-kit-extras/types'
// import { PLUGIN_PATH_PREFIX } from '../core'
import {Options, Provider, UnlighthouseRouteReport, WorkerHooks} from '../types'
import { useLogger } from "../core"
import WS from "../server/ws";
import type {Hookable} from "hookable";

export type RuntimeAppData = {
  ws: WS
  worker: {
    routeReports: Map<string, UnlighthouseRouteReport>
    hooks: Hookable<WorkerHooks>
    monitor: () => Record<string, string>
    // cluster,
    processRoute: (route: RouteDefinition) => void,
    // processRoutes,
    runningTasks: () => number,
    hasStarted: () => boolean,
    reports: () => UnlighthouseRouteReport[],
  },
  options: Options
  provider: Provider
}

export const createApi = ({ ws, worker, provider, options }: RuntimeAppData) => {
  const logger = useLogger()
  const { serve, group, handle, get, } = createRouter({
    // prefix: PLUGIN_PATH_PREFIX,
    // hooks: {
    //   'serve:before-route:/': () => {
    //     // start processing when the user visits the page
    //    // appData.onAppVisit()
    //   },
    // },
  })

  worker.hooks.hook('job-complete', (path, response) => {
    ws.broadcast({ response })
  })
  worker.hooks.hook('job-added', (path, response) => {
    ws.broadcast({ response })
  })


  get('*', cors())

  group('/api', ({ get, post }) => {

    group('/reports', ({ get, post }) => {

      get('/:id', async () => {
        const {id} = useParams<{ id: string }>()
        const report = worker.reports().filter(report => report.reportId === id)[0]
        return fs.readFileSync(report.reportHtml, 'utf-8')
      })

      post('/:id/rescan', () => {
        const { id } = useParams<{ id: string }>()
        const route = worker.routeReports.get(id)
        if (route) {
          // clean up report files
          fs.rmSync(route.reportHtml)
          fs.rmSync(route.reportJson)
          fs.rmSync(route.htmlPayload)
          worker.routeReports.delete(id)
          worker.processRoute(route.route)
        }
      })
    })



    get('ws', (req) => ws.serve(req))

    get('reports', () => worker.reports())
    get('reports/:id', async() => {
      const { id } = useParams<{ id: string }>()
      const report = worker.reports().filter(report => report.reportId === id)[0]
      return fs.readFileSync(report.reportHtml, 'utf-8')
    })

    get('stats', () => {
      const stats = provider.stats ? provider.stats() : {}
      const data = worker.reports()
      const reportsWithScore = data.filter(r => r.report?.score)
      // @ts-ignore
      const score = (reportsWithScore
          .map(r => r.report?.score)
          // @ts-ignore
          .reduce((s, a) => s + a, 0) / reportsWithScore.length) || 0

      return {
        monitor: worker.monitor(),
        score,
        runningTasks: worker.runningTasks(),
        staticRoutes: data.length,
        ...stats,
      }
    })



    post('known-routes', async() => {
        // has started processing
        if (worker.hasStarted())
          return
        // maybe start processing routes once they visit the app
        const routes = await getRoutes()
        processRoutes(routes)
        logger.info(`Started processing with ${routes.length} static routes.`)

      worker.processRoute(useBody<RouteDefinition>())
      return { success: true }
    })
  })

  const module = require.resolve('unplugin-lighthouse-client')
  serve('/', dirname(module))

  return handle
}
