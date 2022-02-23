import { join } from 'path'
import { createUnrouted, get, group, post, redirect, serve, setStatusCode, useParams, useQuery } from 'unrouted'
import fs from 'fs-extra'
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
            const dir = route.artifactPath
            if (fs.existsSync(dir))
              fs.rmSync(dir, { recursive: true })
          })
          worker.queueRoutes(reports.map(report => report.route))
          return true
        })

        post('/:id/rescan', () => {
          const report = useReport()
          const { worker } = useUnlighthouse()

          if (report)
            worker.requeueReport(report)
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

      get('scan-meta', () => createScanMeta())
    })

    serve('/', runtimeSettings.generatedClientPath)
  })

  return handle
}
