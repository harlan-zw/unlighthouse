import { dirname, join } from 'path'
import fs from 'fs'
import { createUnrouted, useParams, useQuery } from 'unrouted'
import { readJsonSync } from 'fs-extra'
import type { LH } from 'lighthouse'
// @ts-ignore
import launch from 'launch-editor'
import { useUnlighthouse } from '../core/unlighthouse'
import { useLogger } from '../core/logger'

/**
 * The API layer of unlighthouse.
 *
 * Internally this uses unrouted which provides an elegant and batteries packed solution.
 */
export const createApi = () => {
  const logger = useLogger()
  const { ws, resolvedConfig, runtimeSettings, hooks } = useUnlighthouse()
  const useReport = () => {
    const { worker } = useUnlighthouse()

    const { id } = useParams<{ id: string }>()
    return worker.findReport(id)
  }

  const { serve, group, handle, redirect } = createUnrouted({
    prefix: resolvedConfig.router.prefix,
    hooks: {
      // @ts-ignore
      'serve:before-route': () => {
        // before we serve a route to the user we trigger a hook to let unlighthouse context know
        return hooks.callHook('visited-client')
      },
    },
  })

  // handle typos
  redirect('/__lighthouse/', resolvedConfig.router.prefix)

  group('/api', ({ get }) => {
    group('/reports', ({ get, post }) => {
      post('/rescan', () => {
        const { worker } = useUnlighthouse()

        const reports = [...worker.routeReports.values()]
        logger.info(`Doing site rescan, clearing ${reports.length} reports.`)
        worker.routeReports.clear()
        reports.forEach((route) => {
          const dir = dirname(route.reportHtml)
          if (fs.existsSync(dir))
            fs.rmSync(dir, { recursive: true })
        })
        worker.queueRoutes(reports.map(report => report.route))
        return true
      })

      get('/:id/lighthouse', async() => {
        const report = useReport()
        if (!report)
          return false

        return fs.readFileSync(report.reportHtml, 'utf-8')
      })

      get('/:id/full-page-screenshot', async() => {
        const report = useReport()
        if (!report)
          return false

        const json = readJsonSync(report.reportJson) as LH.Result
        const screenshot = json.audits?.['full-page-screenshot'].details.screenshot
        // inline html
        return `<img style="display: block; margin: 0 auto;"
                     src="${screenshot.data}"
                     width="${screenshot.width}" 
                     height="${screenshot.height}" 
                 />`
      })

      post('/:id/rescan', () => {
        const report = useReport()
        const { worker } = useUnlighthouse()

        if (report) {
          // clean up report files
          fs.rmSync(report.reportHtml, { force: true })
          fs.rmSync(report.reportJson, { force: true })
          fs.rmSync(report.htmlPayload, { force: true })
          worker.routeReports.delete(report.reportId)
          worker.queueRoute(report.route)
        }
      })
    })

    get('__launch', (req) => {
      const query = useQuery(req)
      const file = query.file as string
      const path = file.replace(resolvedConfig.root, '')
      const resolved = join(resolvedConfig.root, path)
      logger.info(`Launching file in editor: \`${path}\``)
      launch(resolved)
    })

    get('ws', req => ws.serve(req))

    get('reports', () => {
      const { worker } = useUnlighthouse()

      return worker.reports()
    })
    get('reports/:id', async() => {
      const report = useReport()
      if (!report)
        return false

      return fs.readFileSync(report.reportHtml, 'utf-8')
    })

    get('stats', () => {
      const { worker } = useUnlighthouse()

      const data = worker.reports()
      const reportsWithScore = data.filter(r => r.report?.score) as { report: { score: number }}[]
      const score = (reportsWithScore
        .map(r => r.report.score)
        .reduce((s, a) => s + a, 0) / reportsWithScore.length) || 0

      return {
        hostMeta: {
          favicon: data?.[0]?.seo?.favicon,
        },
        monitor: worker.monitor(),
        routes: data.length || 0,
        score,
      }
    })
  })

  serve('/', runtimeSettings.generatedClientPath)

  return handle
}
