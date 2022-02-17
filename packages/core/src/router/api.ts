import { dirname, join } from 'path'
import { createUnrouted, get, group, post, redirect, serve, setStatusCode, useParams, useQuery } from 'unrouted'
import fs from 'fs-extra'
import type { LH } from 'lighthouse'
import launch from 'launch-editor'
import { useUnlighthouse } from '../unlighthouse'
import { useLogger } from '../logger'
import { createScanMeta } from '../data'

/**
 * The API layer of unlighthouse.
 *
 * Internally, this uses unrouted which provides an elegant and batteries-packed solution.
 */
export const createApi = async() => {
  const logger = useLogger()
  const { ws, resolvedConfig, runtimeSettings, hooks } = useUnlighthouse()
  const useReport = () => {
    const { worker } = useUnlighthouse()

    const { id } = useParams<{ id: string }>()
    return worker.findReport(id)
  }

  const { handle, setup } = await createUnrouted({
    name: 'unlighthouse-api',
    debug: resolvedConfig.debug,
    prefix: resolvedConfig.routerPrefix,
    hooks: {
      'serve:before-route': () => {
        // before we serve a route to the user we trigger a hook to let unlighthouse context know
        return hooks.callHook('visited-client')
      },
    },
  })

  await setup(() => {
    // handle typos
    redirect('/__lighthouse/', resolvedConfig.routerPrefix)

    group('/api', () => {
      group('/reports', () => {
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

          const json = fs.readJsonSync(report.reportJson) as LH.Result
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

      get('__launch', () => {
        const { file } = useQuery<{ file: string }>()
        if (!file) {
          setStatusCode(400)
          return false
        }
        const path = file.replace(resolvedConfig.root, '')
        const resolved = join(resolvedConfig.root, path)
        logger.info(`Launching file in editor: \`${path}\``)
        launch(resolved)
      })

      get('ws', req => ws.serve(req))

      get('reports', () => {
        const { worker } = useUnlighthouse()

        return worker.reports().filter(r => r.tasks.inspectHtmlTask === 'completed')
      })
      get('reports/:id', async() => {
        const report = useReport()
        if (!report)
          return false

        return fs.readFileSync(report.reportHtml, 'utf-8')
      })

      get('scan-meta', () => createScanMeta())
    })

    serve('/', runtimeSettings.generatedClientPath)
  })

  return handle
}
