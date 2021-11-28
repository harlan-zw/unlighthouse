import { dirname } from 'path'
import fs from 'fs'
import { createUnrouted, useParams } from 'unrouted'
import { readJsonSync } from 'fs-extra'
import { LH } from 'lighthouse'
import { useUnlighthouseEngine } from '../core/engine'
import {useLogger} from "../core/logger";


export const createApi = () => {
  const logger = useLogger()
  const { ws, resolvedConfig, runtimeSettings } = useUnlighthouseEngine()
  const useReport = () => {
    const { worker } = useUnlighthouseEngine()

    const { id } = useParams<{ id: string }>()
    return worker.findReport(id)
  }

  const { serve, group, handle } = createUnrouted({
    prefix: resolvedConfig.router.prefix,
    hooks: {
      'serve:before-route:/': () => {
        // start processing when the user visits the page
        // appData.onAppVisit()
      },
    },
  })

  group('/api', ({ get }) => {
    group('/reports', ({ get, post }) => {
      post('/rescan', () => {
        const { worker } = useUnlighthouseEngine()

        const reports = [...worker.routeReports.values()]
        logger.info(`Doing site rescan, clearing ${reports.length} reports.`)
        worker.routeReports.clear()
        reports.forEach((route) => {
          const dir = dirname(route.reportHtml)
          if (fs.existsSync(dir))
            fs.rmdirSync(dir, { recursive: true })
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
        const { worker } = useUnlighthouseEngine()

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

    get('ws', req => ws.serve(req))

    get('reports', () => {
      const { worker } = useUnlighthouseEngine()

      return worker.reports()
    })
    get('reports/:id', async() => {
      const report = useReport()
      if (!report){
        return false
      }
      return fs.readFileSync(report.reportHtml, 'utf-8')
    })

    get('stats', () => {
      const { worker } = useUnlighthouseEngine()

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
