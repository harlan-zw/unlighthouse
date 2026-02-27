import type { App, Router } from 'h3'
import { join } from 'node:path'
import fs from 'fs-extra'
import { createRouter, defineEventHandler, getQuery, getRouterParams, readBody, sendRedirect, serveStatic, setResponseHeader, setResponseStatus, useBase } from 'h3'
import launch from 'launch-editor'
import { joinURL } from 'ufo'
import { createScanMeta } from '../data'
import * as history from '../data/history'
import { getCurrentScanId } from '../data/history/tracking'
import { useLogger } from '../logger'
import { useUnlighthouse } from '../unlighthouse'
import { sanitiseUrlForFilePath } from '../util'
import { createDashboardApi } from './dashboard'

export async function createApi(app: App): Promise<Router> {
  const logger = useLogger()
  const { ws, resolvedConfig, runtimeSettings, hooks } = useUnlighthouse()

  const router = createRouter()

  // Handle typo redirect
  router.get('/__lighthouse/', defineEventHandler(event =>
    sendRedirect(event, resolvedConfig.routerPrefix),
  ))

  // API routes
  const apiRouter = createRouter()

  apiRouter.post('/reports/rescan', defineEventHandler(() => {
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
  }))

  apiRouter.post('/reports/:id/rescan', defineEventHandler((event) => {
    const { worker } = useUnlighthouse()
    const { id } = getRouterParams(event) as { id: string }
    const report = worker.findReport(id)
    if (report)
      worker.requeueReport(report)
    return true
  }))

  apiRouter.get('/__launch', defineEventHandler((event) => {
    const { file } = getQuery(event) as { file: string }
    if (!file) {
      setResponseStatus(event, 400)
      return false
    }
    const path = file.replace(resolvedConfig.root, '')
    const resolved = join(resolvedConfig.root, path)
    logger.info(`Launching file in editor: \`${path}\``)
    launch(resolved)
    return true
  }))

  apiRouter.get('/ws', defineEventHandler(event => ws.serve(event.node.req)))

  apiRouter.get('/reports', defineEventHandler(() => {
    const { worker } = useUnlighthouse()
    return worker.reports().filter(r => r.tasks.inspectHtmlTask === 'completed')
  }))

  apiRouter.get('/scan-meta', defineEventHandler(() => createScanMeta()))

  // Current scan ID for share functionality
  apiRouter.get('/current-scan-id', defineEventHandler(() => {
    const scanId = getCurrentScanId()
    return { scanId }
  }))

  // History API endpoints
  apiRouter.get('/history', defineEventHandler((event) => {
    const { limit, offset, site } = getQuery(event) as { limit?: string, offset?: string, site?: string }
    const scans = history.listScans(resolvedConfig.outputPath, {
      limit: limit ? Number.parseInt(limit) : 50,
      offset: offset ? Number.parseInt(offset) : 0,
      site,
    })
    return { scans }
  }))

  apiRouter.get('/history/:id', defineEventHandler((event) => {
    const { id } = getRouterParams(event) as { id: string }
    const scan = history.getScanWithRoutes(resolvedConfig.outputPath, id)
    if (!scan) {
      setResponseStatus(event, 404)
      return { error: 'Scan not found' }
    }
    // Add artifactUrl to each route for screenshots/lighthouse reports
    const routesWithArtifacts = scan.routes.map(route => ({
      ...route,
      artifactUrl: joinURL(resolvedConfig.routerPrefix, 'reports', sanitiseUrlForFilePath(route.path)),
    }))
    return { ...scan, routes: routesWithArtifacts }
  }))

  apiRouter.delete('/history/:id', defineEventHandler((event) => {
    const { id } = getRouterParams(event) as { id: string }
    const deleted = history.deleteScan(resolvedConfig.outputPath, id)
    if (!deleted) {
      setResponseStatus(event, 404)
      return { error: 'Scan not found' }
    }
    return { success: true }
  }))

  // Scan status endpoint with detailed progress info
  apiRouter.get('/scan/status', defineEventHandler(() => {
    const { worker, resolvedConfig, runtimeSettings } = useUnlighthouse()
    const stats = worker.monitor()
    const reports = worker.reports()
    const completedReports = reports.filter(r => r.report?.score !== undefined)

    // Determine scan status
    let status: 'idle' | 'starting' | 'discovering' | 'scanning' | 'complete' = 'scanning'
    if (stats.status === 'completed') {
      status = 'complete'
    }
    else if (stats.allTargets === 0) {
      status = 'starting'
    }
    else if (completedReports.length === 0 && reports.length > 0) {
      status = 'discovering'
    }

    // Get last 10 completed routes for live feed
    const recentlyCompleted = completedReports
      .sort((a, b) => (b.report?.fetchTime || 0) - (a.report?.fetchTime || 0))
      .slice(0, 10)
      .map(r => ({
        path: r.route.path,
        score: r.report?.score || 0,
        categories: r.report?.categories,
      }))

    // Current URL being scanned
    const inProgress = reports.find(r =>
      r.tasks.runLighthouseTask === 'in-progress' || r.tasks.inspectHtmlTask === 'in-progress',
    )

    return {
      status,
      paused: worker.isPaused(),
      site: resolvedConfig.site,
      progress: {
        discovered: reports.length,
        scanned: completedReports.length,
        failed: reports.filter(r => r.tasks.runLighthouseTask === 'failed').length,
        total: stats.allTargets,
        percent: Number.parseFloat(stats.donePercStr),
      },
      currentUrl: inProgress?.route.url,
      recentlyCompleted,
      startedAt: runtimeSettings.serverUrl ? new Date(Date.now() - stats.timeRunning).toISOString() : null,
      estimatedTimeRemaining: stats.timeRemaining > 0 ? stats.timeRemaining : null,
      workers: stats.workers,
    }
  }))

  // Cancel scan endpoint
  apiRouter.post('/scan/cancel', defineEventHandler(async () => {
    const { worker } = useUnlighthouse()
    logger.info('Scan cancel requested')
    // Close the cluster to stop all workers
    await worker.cluster.close()
    return { success: true, message: 'Scan cancelled' }
  }))

  // Pause scan endpoint
  apiRouter.post('/scan/pause', defineEventHandler(() => {
    const { worker } = useUnlighthouse()
    worker.pause()
    return { success: true, paused: true }
  }))

  // Resume scan endpoint
  apiRouter.post('/scan/resume', defineEventHandler(() => {
    const { worker } = useUnlighthouse()
    worker.resume()
    return { success: true, paused: false }
  }))

  // Start a new scan (for web UI onboarding)
  apiRouter.post('/scan/start', defineEventHandler(async (event) => {
    const body = await readBody(event)
    const { url, device, throttle, sampleSize, categories } = body as {
      url: string
      device?: 'mobile' | 'desktop'
      throttle?: boolean
      sampleSize?: number
      categories?: string[]
    }

    if (!url) {
      setResponseStatus(event, 400)
      return { error: 'URL is required' }
    }

    const { worker, resolvedConfig: config } = useUnlighthouse()

    logger.info(`Starting new scan for: ${url}`)

    // Clear existing reports
    const reports = [...worker.routeReports.values()]
    worker.routeReports.clear()
    reports.forEach((route) => {
      const dir = route.artifactPath
      if (fs.existsSync(dir))
        fs.rmSync(dir, { recursive: true })
    })

    // Update config with new settings
    config.site = url
    if (device)
      config.lighthouseOptions.formFactor = device
    if (throttle !== undefined)
      config.scanner.throttle = throttle
    if (categories?.length)
      config.lighthouseOptions.onlyCategories = categories
    if (sampleSize)
      config.scanner.maxRoutes = sampleSize

    // Queue the root URL to start discovery
    const { normaliseRoute } = await import('../discovery')
    const rootRoute = normaliseRoute(url)
    worker.queueRoutes([rootRoute])

    return {
      success: true,
      message: 'Scan started',
      site: url,
    }
  }))

  // Rescan from history
  apiRouter.post('/history/:id/rescan', defineEventHandler(async (event) => {
    const { id } = getRouterParams(event) as { id: string }
    const scan = history.getScan(resolvedConfig.outputPath, id)

    if (!scan) {
      setResponseStatus(event, 404)
      return { error: 'Scan not found' }
    }

    const { worker, resolvedConfig: config } = useUnlighthouse()

    logger.info(`Rescan requested for history entry: ${scan.site}`)

    // Clear existing reports
    const reports = [...worker.routeReports.values()]
    worker.routeReports.clear()
    reports.forEach((route) => {
      const dir = route.artifactPath
      if (fs.existsSync(dir))
        fs.rmSync(dir, { recursive: true })
    })

    // Restore config from history
    config.site = scan.site
    if (scan.device)
      config.lighthouseOptions.formFactor = scan.device

    // Queue the root URL to start discovery
    const { normaliseRoute } = await import('../discovery')
    const rootRoute = normaliseRoute(scan.site)
    worker.queueRoutes([rootRoute])

    return {
      success: true,
      message: 'Rescan started',
      site: scan.site,
    }
  }))

  // Mount dashboard API router
  const dashboardRouter = createDashboardApi(resolvedConfig.outputPath)
  apiRouter.use('/dashboard/**', useBase('/dashboard', dashboardRouter.handler))

  // Mount API router
  router.use('/api/**', useBase('/api', apiRouter.handler))

  // MIME types for static file serving
  const mimeTypes: Record<string, string> = {
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.html': 'text/html',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.ico': 'image/x-icon',
  }

  // Serve static client files with SPA fallback
  router.get('/**', defineEventHandler(async (event) => {
    await hooks.callHook('visited-client')
    const path = event.path || '/'
    const ext = path.substring(path.lastIndexOf('.'))
    const mimeType = mimeTypes[ext]

    // Try to serve the exact file first
    const filePath = join(runtimeSettings.generatedClientPath, path)
    const stats = await fs.stat(filePath).catch(() => null)

    if (stats?.isFile()) {
      if (mimeType)
        setResponseHeader(event, 'Content-Type', mimeType)
      return serveStatic(event, {
        getContents: id => fs.readFile(join(runtimeSettings.generatedClientPath, id)),
        getMeta: async (id) => {
          const fp = join(runtimeSettings.generatedClientPath, id)
          const s = await fs.stat(fp).catch(() => null)
          if (!s?.isFile())
            return
          return { size: s.size, mtime: s.mtimeMs }
        },
      })
    }

    // SPA fallback: serve index.html or 200.html for non-file routes
    const fallbackPath = join(runtimeSettings.generatedClientPath, '200.html')
    const indexPath = join(runtimeSettings.generatedClientPath, 'index.html')
    const htmlPath = await fs.stat(fallbackPath).then(() => fallbackPath).catch(() => indexPath)

    setResponseHeader(event, 'Content-Type', 'text/html')
    return fs.readFile(htmlPath, 'utf-8')
  }))

  // Mount router to app with prefix
  app.use(resolvedConfig.routerPrefix, router)

  return router
}
