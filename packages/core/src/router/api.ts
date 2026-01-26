import { join } from 'node:path'
import { createUnrouted, get, post, prefix, redirect, setStatusCode, useParams, useQuery } from '@unrouted/core'
import { presetApi } from '@unrouted/preset-api'
import { presetNode, serve } from '@unrouted/preset-node'
import fs from 'fs-extra'
import launch from 'launch-editor'
import { generateClient } from '../build'
import { createScanMeta } from '../data'
import { resolveReportableRoutes } from '../discovery'
import { useLogger } from '../logger'
import { useUnlighthouse } from '../unlighthouse'

/**
 * The API layer of unlighthouse.
 *
 * Internally, this uses unrouted which provides an elegant and batteries-packed solution.
 */
export async function createApi(h3: any): Promise<any> {
  const logger = useLogger()
  const { ws, resolvedConfig, runtimeSettings, hooks } = useUnlighthouse()
  const useReport = () => {
    const { worker } = useUnlighthouse()

    const { id } = useParams<{ id: string }>()
    return worker.findReport(id)
  }

  const { app, setup } = await createUnrouted({
    name: 'unlighthouse-api',
    debug: resolvedConfig.debug,
    prefix: resolvedConfig.routerPrefix,
    app: h3,
    hooks: {
      // @ts-expect-error untyped
      'serve:before-route': () => {
        // before we serve a route to the user we trigger a hook to let unlighthouse context know
        return hooks.callHook('visited-client')
      },
    },
    presets: [
      presetApi(),
      presetNode({
        generateTypes: false,
      }),
    ],
  })

  await setup(() => {
    // handle typos
    redirect('/__lighthouse/', resolvedConfig.routerPrefix)

    prefix('/api', () => {
      // Start scan endpoint - used when CLI is started with --wait
      post('/start-scan', async () => {
        const { worker, start, resolvedConfig } = useUnlighthouse()

        // Check if scan is already running with active workers
        if (worker.routeReports.size > 0 && worker.monitor().status === 'working') {
          return { success: false, message: 'Scan already in progress', site: resolvedConfig.site }
        }

        logger.info(`Starting scan for: ${resolvedConfig.site}`)

        // Start the scan
        const ctx = await start()

        return { success: true, site: resolvedConfig.site, routeCount: ctx.routes?.length || 0 }
      })

      // Change target site endpoint
      post('/change-site', async () => {
        const { worker, setSiteUrl, start } = useUnlighthouse()
        const { site: newSite } = useQuery<{ site: string }>()

        if (!newSite) {
          setStatusCode(400)
          return { error: 'Missing site parameter' }
        }

        logger.info(`Changing target site to: ${newSite}`)

        // Clear existing reports
        const reports = [...worker.routeReports.values()]
        worker.routeReports.clear()
        reports.forEach((route) => {
          const dir = route.artifactPath
          if (fs.existsSync(dir))
            fs.rmSync(dir, { recursive: true })
        })

        // Set new site URL (this updates resolvedConfig.site)
        await setSiteUrl(newSite)

        // Regenerate client so payload.js reflects the new site
        await generateClient()

        // Start scanning the new site
        logger.info(`Starting scan for: ${newSite}`)
        const ctx = await start()

        return { success: true, site: newSite, routeCount: ctx.routes?.length || 0 }
      })

      prefix('/reports', () => {
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

      get('ws', event => ws.serve(event.req))

      get('reports', () => {
        const { worker } = useUnlighthouse()

        return worker.reports().filter(r => r.tasks.inspectHtmlTask === 'completed')
      })

      get('scan-meta', () => createScanMeta())
    })

    serve('/', runtimeSettings.generatedClientPath)
  })

  return app
}
