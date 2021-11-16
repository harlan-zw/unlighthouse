import { dirname } from 'path'
import fs from 'fs'
import { createRouter, useBody, useParams } from 'unrouted'
import cors from 'cors'
import { RouteDefinition } from 'nuxt-kit-extras/types'
import { UnlighthouseEngineContext } from '@shared'
import { useLogger } from '../core'

export const createApi = ({ ws, worker, provider, options, client }: UnlighthouseEngineContext) => {
  const logger = useLogger()
  const { serve, group, handle, get } = createRouter({
    // prefix: PLUGIN_PATH_PREFIX,
    // hooks: {
    //   'serve:before-route:/': () => {
    //     // start processing when the user visits the page
    //    // appData.onAppVisit()
    //   },
    // },
  })

  worker.hooks.hook('task-started', (path, response) => {
    ws.broadcast({ response })
  })
  worker.hooks.hook('task-complete', (path, response) => {
    ws.broadcast({ response })
  })
  worker.hooks.hook('task-added', (path, response) => {
    ws.broadcast({ response })
  })

  get('*', cors())

  group('/api', ({ get, post }) => {
    group('/reports', ({ get, post }) => {
      post('/rescan', () => {
        const reports = [...worker.routeReports.values()]
        worker.routeReports.clear()
        reports.forEach((route) => {
          if (route.resolved) {
            fs.rmSync(route.reportHtml, { force: true })
            fs.rmSync(route.reportJson, { force: true })
            fs.rmSync(route.htmlPayload, { force: true })
          }
        })
        worker.processRoutes(reports.map(report => report.route))
        return true
      })

      get('/:id', async() => {
        const { id } = useParams<{ id: string }>()
        const report = worker.reports().filter(report => report.reportId === id)[0]
        return fs.readFileSync(report.reportHtml, 'utf-8')
      })

      post('/:id/rescan', () => {
        const { id } = useParams<{ id: string }>()
        const route = worker.routeReports.get(id)
        if (route) {
          // clean up report files
          fs.rmSync(route.reportHtml, { force: true })
          fs.rmSync(route.reportJson, { force: true })
          fs.rmSync(route.htmlPayload, { force: true })
          worker.routeReports.delete(id)
          worker.processRoute(route.route)
        }
      })
    })

    get('ws', req => ws.serve(req))

    get('reports', () => worker.reports())
    get('reports/:id', async() => {
      const { id } = useParams<{ id: string }>()
      const report = worker.reports().filter(report => report.reportId === id)[0]
      return fs.readFileSync(report.reportHtml, 'utf-8')
    })

    get('stats', () => {
      const stats = provider.stats ? provider.stats() : {}
      const data = worker.reports()
      const reportsWithScore = data.filter(r => r.report?.score) as { report: { score: number }}[]
      const score = (reportsWithScore
        .map(r => r.report.score)
        .reduce((s, a) => s + a, 0) / reportsWithScore.length) || 0

      return {
        monitor: worker.monitor(),
        score,
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

  serve('/', client)

  return handle
}
