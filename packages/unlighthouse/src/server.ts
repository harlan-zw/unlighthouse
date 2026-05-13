import type { Logger, ResolvedUserConfig, RuntimeSettings } from '@unlighthouse/contracts'
import type { WS } from '@unlighthouse/core/api'
import type { LegacyWorkerHooks } from '@unlighthouse/core/crawlers'
import type { App } from 'h3'
import type { Hookable } from 'hookable'
import { join } from 'node:path'
import { createDashboardApi } from '@unlighthouse/core/api/dashboard'
import { createHandlers } from '@unlighthouse/core/api/handlers'
import { createHttpRouter } from '@unlighthouse/core/api/http'
import fs from 'fs-extra'
import { createRouter, defineEventHandler, getQuery, sendRedirect, serveStatic, setResponseHeader, setResponseStatus, useBase } from 'h3'
import launch from 'launch-editor'

// MIME types for static client serving.
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

export interface MountServerDeps {
  resolvedConfig: ResolvedUserConfig
  runtimeSettings: RuntimeSettings
  hooks: Hookable<LegacyWorkerHooks>
  ws: WS | null
  logger?: Logger
}

interface MountServerOptions {
  /** Handler context for createHttpRouter (passes core/storage/config/auditors). */
  handlerCtx: Parameters<typeof createHttpRouter>[0]['ctx']
}

/**
 * Mount all HTTP surface area: command-driven /api router, dashboard router,
 * WebSocket upgrade endpoint, editor launch, typo redirect, and static SPA.
 */
export async function mountServer(deps: MountServerDeps, app: App, opts: MountServerOptions): Promise<void> {
  const { ws, resolvedConfig, runtimeSettings, hooks, logger } = deps

  const root = createRouter()

  // Typo redirect: /__lighthouse/ -> resolved router prefix.
  root.get('/__lighthouse/', defineEventHandler(event => sendRedirect(event, resolvedConfig.routerPrefix)))

  // Command-driven REST surface.
  const apiRouter = createHttpRouter({ handlers: createHandlers(), ctx: opts.handlerCtx })

  // Editor launch endpoint.
  apiRouter.get('/__launch', defineEventHandler((event) => {
    const { file } = getQuery(event) as { file: string }
    if (!file) {
      setResponseStatus(event, 400)
      return false
    }
    const path = file.replace(resolvedConfig.root, '')
    const resolved = join(resolvedConfig.root, path)
    logger?.info(`Launching file in editor: \`${path}\``)
    launch(resolved)
    return true
  }))

  // WebSocket upgrade (only when ws is enabled).
  if (ws) {
    apiRouter.get('/ws', defineEventHandler(event => ws.serve(event.node.req)))
  }

  // Dashboard sub-router.
  // Host always passes a resolved HandlerCtx (not a factory); narrow here.
  const storage = (opts.handlerCtx as { storage: Parameters<typeof createDashboardApi>[0] }).storage
  const dashboardRouter = createDashboardApi(storage)
  apiRouter.use('/dashboard/**', useBase('/dashboard', dashboardRouter.handler))

  root.use('/api/**', useBase('/api', apiRouter.handler))

  // Static client with SPA fallback.
  root.get('/**', defineEventHandler(async (event) => {
    await hooks.callHook('visited-client')
    const path = event.path || '/'
    const ext = path.substring(path.lastIndexOf('.'))
    const mimeType = mimeTypes[ext]

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

    // SPA fallback: 200.html if present, else index.html.
    const fallbackPath = join(runtimeSettings.generatedClientPath, '200.html')
    const indexPath = join(runtimeSettings.generatedClientPath, 'index.html')
    const htmlPath = await fs.stat(fallbackPath).then(() => fallbackPath).catch(() => indexPath)

    setResponseHeader(event, 'Content-Type', 'text/html')
    return fs.readFile(htmlPath, 'utf-8')
  }))

  app.use(resolvedConfig.routerPrefix, root.handler)
}
