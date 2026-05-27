import type { Logger, ResolvedUserConfig, RuntimeSettings } from '@unlighthouse/contracts'
import type { WS } from '@unlighthouse/core/api'
import type { App, H3Event } from 'h3'
import type { Hookable } from 'hookable'
import type { ServerHookMap } from './server-hooks'
import { timingSafeEqual } from 'node:crypto'
import { join } from 'node:path'
import { createDashboardApi } from '@unlighthouse/core/api/dashboard'
import { createHandlers } from '@unlighthouse/core/api/handlers'
import { createHttpRouter } from '@unlighthouse/core/api/http'
import fs from 'fs-extra'
import { createRouter, defineEventHandler, getHeader, getQuery, sendRedirect, serveStatic, setResponseHeader, setResponseStatus, useBase } from 'h3'
import { joinURL } from 'ufo'
import { createTaggedLogger } from '@unlighthouse/core/logger'
import launch from 'launch-editor'

const log = createTaggedLogger('server')

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
  hooks: Hookable<ServerHookMap>
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

  log.debug(`Mounting — prefix: ${resolvedConfig.routerPrefix}, client: ${runtimeSettings.generatedClientPath}`)

  root.get('/__lighthouse/', defineEventHandler(event => sendRedirect(event, resolvedConfig.routerPrefix)))

  const apiRouter = createHttpRouter({ handlers: createHandlers(), ctx: opts.handlerCtx })
  log.debug('API router created with command handlers')

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
    log.debug('WS upgrade endpoint registered at /api/ws')
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
    await (hooks as { callHook: (name: string) => Promise<void> | void }).callHook('visited-client')
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

  // CORS for dev: the UI runs on :3000 while the API is on :5678. Open up
  // everything because the host is bound to localhost by default; tighten if
  // the listen address ever moves off the loopback.
  app.use(defineEventHandler((event) => {
    setResponseHeader(event, 'Access-Control-Allow-Origin', '*')
    setResponseHeader(event, 'Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS')
    setResponseHeader(event, 'Access-Control-Allow-Headers', 'Content-Type, Authorization')
    if (event.node.req.method === 'OPTIONS') {
      setResponseStatus(event, 204)
      return ''
    }
  }))

  // Bearer-token auth for the /api/* surface. Engaged only when
  // UNLIGHTHOUSE_API_TOKEN is set so the CLI default (no token) stays
  // unbroken. UI/static assets remain unauthenticated — the dashboard
  // SPA is supposed to be loadable so it can prompt the user for the
  // token (UI-level auth gate is a separate concern). Specific paths
  // bypass even when auth is configured:
  //
  //   - OPTIONS preflight: needs to succeed so CORS works at all.
  //   - /health and /ready: monitoring endpoints; leaking the token to
  //     a healthcheck poller would be a footgun.
  //   - Connections from 127.0.0.1 / ::1 when UNLIGHTHOUSE_LOCAL_BYPASS=1
  //     so an operator can shell in and curl without exporting the token
  //     into every shell.
  const apiToken = process.env.UNLIGHTHOUSE_API_TOKEN
  const localBypass = process.env.UNLIGHTHOUSE_LOCAL_BYPASS === '1'
  if (apiToken) {
    if (apiToken.length < 16) {
      // Don't refuse to start — operator may be experimenting — but log
      // loudly so a weak token isn't accidentally shipped to prod.
      logger?.warn?.('[auth] UNLIGHTHOUSE_API_TOKEN is shorter than 16 chars; use a high-entropy token (e.g. `openssl rand -hex 32`).')
    }
    const expected = Buffer.from(apiToken, 'utf8')
    // The API base is `routerPrefix + apiPrefix` (e.g. '/' + '/api' = '/api').
    // Anchored with a trailing slash so prefix matching can't accidentally
    // gate a `/apidocs` path that just *starts* with `/api`.
    const apiBase = joinURL(resolvedConfig.routerPrefix, resolvedConfig.apiPrefix)
    const apiPathPrefix = apiBase.endsWith('/') ? apiBase : `${apiBase}/`
    log.info(`auth: Bearer-token gate enabled on ${apiPathPrefix}* (local-bypass=${localBypass})`)

    app.use(defineEventHandler((event) => {
      const url = event.node.req.url ?? ''
      // Scope the gate strictly to the API surface. Anything outside
      // routerPrefix+apiPrefix is the static UI shell + assets.
      if (!url.startsWith(apiPathPrefix))
        return
      if (event.node.req.method === 'OPTIONS')
        return
      // Exempt health/ready under the apiPathPrefix.
      const sub = url.slice(apiPathPrefix.length).split('?')[0]
      if (sub === 'health' || sub === 'ready')
        return
      if (localBypass && isLoopback(event))
        return

      const got = parseBearer(event)
      if (got) {
        const gotBuf = Buffer.from(got, 'utf8')
        // timingSafeEqual requires equal lengths; differ-length tokens
        // would otherwise leak the expected length via timing. Fast-pass
        // a length mismatch as "wrong" without doing the compare.
        if (gotBuf.length === expected.length && timingSafeEqual(gotBuf, expected))
          return
      }

      setResponseStatus(event, 401)
      setResponseHeader(event, 'WWW-Authenticate', 'Bearer realm="unlighthouse"')
      return { error: 'unauthorized', message: 'Bearer token required.' }
    }))
  }

  app.use(resolvedConfig.routerPrefix, root.handler)
}

// Pull the bearer token from the Authorization header. Returns null if
// missing, malformed, or some other scheme. Whitespace around the token
// is trimmed.
function parseBearer(event: H3Event): string | null {
  const header = getHeader(event, 'authorization')
  if (!header)
    return null
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header)
  return m ? m[1] : null
}

// Loopback check used by the LOCAL_BYPASS escape hatch. socket.remoteAddress
// is what node sees, which is the real peer; when running behind a proxy
// (UNLIGHTHOUSE_TRUST_PROXY) callers should not enable LOCAL_BYPASS because
// the proxy itself would always appear local. Documented in self-hosted.md.
function isLoopback(event: H3Event): boolean {
  const addr = event.node.req.socket?.remoteAddress
  if (!addr)
    return false
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1'
}
