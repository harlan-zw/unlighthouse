import type { App, Router } from 'h3'
import { join } from 'node:path'
import fs from 'fs-extra'
import { createRouter, defineEventHandler, getQuery, getRouterParams, sendRedirect, serveStatic, setResponseHeader, setResponseStatus, useBase } from 'h3'
import launch from 'launch-editor'
import { createScanMeta } from '../data'
import { useLogger } from '../logger'
import { useUnlighthouse } from '../unlighthouse'

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
  app.use(resolvedConfig.routerPrefix, router.handler)

  return router
}
