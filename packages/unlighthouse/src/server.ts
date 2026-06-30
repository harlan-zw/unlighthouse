import type { Logger, ResolvedUserConfig, RuntimeSettings } from '@unlighthouse/contracts'
import type { WS } from '@unlighthouse/core/api'
import type { App, H3Event } from 'h3'
import type { Hookable } from 'hookable'
import type { ServerHookMap } from './server-hooks'
import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { createDashboardApi } from '@unlighthouse/core/api/dashboard'
import { createHandlers } from '@unlighthouse/core/api/handlers'
import { createHttpRouter } from '@unlighthouse/core/api/http'
import { createTaggedLogger } from '@unlighthouse/core/logger'
import { createRouter, defineEventHandler, getHeader, getQuery, sendRedirect, serveStatic, setResponseHeader, setResponseStatus, useBase } from 'h3'
import launch from 'launch-editor'
import { joinURL } from 'ufo'

const log = createTaggedLogger('server')

async function statFileOrNull(path: string) {
  try {
    return await stat(path)
  }
  catch (err) {
    const code = (err as { code?: unknown }).code
    if (code !== 'ENOENT' && code !== 'ENOTDIR')
      logOperationalWarn('host.static_asset_probe_failed', err, { path }, log)
    return null
  }
}

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
    const stats = await statFileOrNull(filePath)

    if (stats?.isFile()) {
      if (mimeType)
        setResponseHeader(event, 'Content-Type', mimeType)
      return serveStatic(event, {
        getContents: id => readFile(join(runtimeSettings.generatedClientPath, id)),
        getMeta: async (id) => {
          const fp = join(runtimeSettings.generatedClientPath, id)
          const s = await statFileOrNull(fp)
          if (!s?.isFile())
            return
          return { size: s.size, mtime: s.mtimeMs }
        },
      })
    }

    // SPA fallback: 200.html if present, else index.html.
    const fallbackPath = join(runtimeSettings.generatedClientPath, '200.html')
    const indexPath = join(runtimeSettings.generatedClientPath, 'index.html')
    const htmlPath = await statFileOrNull(fallbackPath).then(s => s ? fallbackPath : indexPath)

    setResponseHeader(event, 'Content-Type', 'text/html')
    return readFile(htmlPath, 'utf-8')
  }))

  // CORS. The decision tree is:
  //
  //   - UNLIGHTHOUSE_CORS_ORIGINS set → strict allowlist from the env.
  //     Hosted deploys do this to pin the dashboard origin(s).
  //
  //   - Env not set BUT UNLIGHTHOUSE_API_TOKEN is → "hosted-ish"
  //     default: localhost allowlist. The token is the auth barrier;
  //     CORS narrows the blast radius of a stolen token by limiting
  //     which page origins can exfiltrate via XHR. Operator who exposes
  //     beyond localhost should set UNLIGHTHOUSE_CORS_ORIGINS explicitly.
  //
  //   - Neither set → open (`*`). The CLI default story:  user is
  //     running unlighthouse on their machine + the Nuxt dashboard
  //     wherever (localhost, tailnet tunnel, VPN). Without a token
  //     there's nothing meaningful for CORS to protect, and a strict
  //     localhost allowlist breaks the tailnet / tunnel paths users
  //     rely on for "show this dashboard on my phone".
  const corsOriginsEnv = process.env.UNLIGHTHOUSE_CORS_ORIGINS
  const apiTokenForCors = process.env.UNLIGHTHOUSE_API_TOKEN
  let corsAllowlist: string[]
  if (corsOriginsEnv)
    corsAllowlist = corsOriginsEnv.split(',').map(s => s.trim()).filter(Boolean)
  else if (apiTokenForCors)
    corsAllowlist = ['http://localhost:3000', 'http://127.0.0.1:3000']
  else
    corsAllowlist = ['*']
  const corsAllowAny = corsAllowlist.includes('*')
  log.info(`cors: ${corsAllowAny ? 'open (*)' : `allowlist [${corsAllowlist.join(', ')}]`}`)

  app.use(defineEventHandler((event) => {
    const origin = getHeader(event, 'origin')
    // Echo back the requesting origin only when it's allowed. Echoing
    // `*` works for unauthenticated GETs but breaks credentialed
    // requests (browsers reject `*` with credentials) — picking the
    // single origin is broader-compatible and tighter.
    if (origin && (corsAllowAny || corsAllowlist.includes(origin))) {
      setResponseHeader(event, 'Access-Control-Allow-Origin', origin)
      setResponseHeader(event, 'Vary', 'Origin')
    }
    else if (corsAllowAny && !origin) {
      // Non-browser callers (curl, server-side fetch) skip Origin
      // entirely; an Allow-Origin header is harmless and lets bare
      // tools probe the API.
      setResponseHeader(event, 'Access-Control-Allow-Origin', '*')
    }
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
  // Trust-proxy turns on X-Forwarded-* awareness for downstream client
  // identity (auth bypass + rate-limit bucketing). Only enable when the
  // app actually sits behind a proxy you control — without that, any
  // client can spoof the header and become "127.0.0.1".
  const trustProxy = process.env.UNLIGHTHOUSE_TRUST_PROXY === '1'
  if (trustProxy && localBypass) {
    // Behind a real proxy the socket.remoteAddress is always the
    // proxy's IP, which often is 127.0.0.1 — combined with LOCAL_BYPASS
    // this turns auth off for the whole world. Loud refuse rather than
    // warn; the misconfiguration is footgun-grade.
    logger?.warn?.('[auth] UNLIGHTHOUSE_TRUST_PROXY=1 + UNLIGHTHOUSE_LOCAL_BYPASS=1 disables auth for all requests via the proxy. Drop LOCAL_BYPASS in hosted setups.')
  }
  if (trustProxy)
    log.info(`network: trust-proxy enabled (X-Forwarded-For honoured)`)

  // Rate limit on the /api/* surface. 0 disables; default 120 req/min
  // per bucket keeps a chatty dashboard happy (avg ~2 req/sec) while
  // blocking abusive loops. In-memory token bucket — single-process
  // only, so behind a horizontal-scale deployment you'd want to swap
  // this for redis-backed; document.
  const rateLimitRpm = Number.parseInt(process.env.UNLIGHTHOUSE_RATE_LIMIT ?? '120', 10)
  if (rateLimitRpm > 0) {
    const buckets = new Map<string, { tokens: number, last: number }>()
    const refillPerMs = rateLimitRpm / 60_000
    const capacity = rateLimitRpm
    log.info(`rate-limit: ${rateLimitRpm} req/min per bucket (token+IP fallback)`)

    app.use(defineEventHandler((event) => {
      const url = event.node.req.url ?? ''
      if (!url.startsWith('/'))
        return
      // Don't rate-limit health / ready / OPTIONS — monitoring
      // shouldn't trip the limit and preflight is paired with a
      // request that will hit the limit anyway.
      if (event.node.req.method === 'OPTIONS')
        return
      const apiBase = joinURL(resolvedConfig.routerPrefix, resolvedConfig.apiPrefix)
      const apiPathPrefix = apiBase.endsWith('/') ? apiBase : `${apiBase}/`
      if (!url.startsWith(apiPathPrefix))
        return
      const sub = url.slice(apiPathPrefix.length).split('?')[0]
      if (sub === 'health' || sub === 'ready')
        return

      // Bucket key: prefer the token (each tenant gets their own
      // budget) and fall back to client IP for unauthenticated callers
      // / the LOCAL_BYPASS path. Don't blend the two — a token's
      // budget shouldn't be drained by a noisy IP that doesn't use
      // that token.
      const got = parseBearer(event)
      const ip = getClientIp(event, trustProxy)
      const key = got ? `t:${got}` : `i:${ip ?? 'unknown'}`

      const now = Date.now()
      let b = buckets.get(key)
      if (!b) {
        b = { tokens: capacity, last: now }
        buckets.set(key, b)
      }
      // Lazy refill: each tick adds tokens proportional to elapsed
      // ms, capped at capacity. Cheaper than a setInterval, and
      // perfectly fair under bursts.
      const elapsed = now - b.last
      b.tokens = Math.min(capacity, b.tokens + elapsed * refillPerMs)
      b.last = now
      if (b.tokens < 1) {
        const retryMs = Math.ceil((1 - b.tokens) / refillPerMs)
        const retrySec = Math.ceil(retryMs / 1000)
        setResponseStatus(event, 429)
        setResponseHeader(event, 'Retry-After', retrySec)
        setResponseHeader(event, 'X-RateLimit-Limit', String(rateLimitRpm))
        setResponseHeader(event, 'X-RateLimit-Remaining', '0')
        return { error: 'rate_limited', message: `Try again in ${retrySec}s.` }
      }
      b.tokens -= 1
      setResponseHeader(event, 'X-RateLimit-Limit', String(rateLimitRpm))
      setResponseHeader(event, 'X-RateLimit-Remaining', String(Math.floor(b.tokens)))
    }))
  }

  if (apiToken) {
    if (apiToken.length < 16) {
      // Don't refuse to start — operator may be experimenting — but log
      // loudly so a weak token isn't accidentally shipped to prod.
      logger?.warn?.('[auth] UNLIGHTHOUSE_API_TOKEN is shorter than 16 chars; use a high-entropy token (e.g. `openssl rand -hex 32`).')
    }
    if (corsAllowAny) {
      // `*` CORS while auth is enforced means a successful XSS on a
      // user's open browser tab could read responses — the token is the
      // only barrier and we'd hand over the egress. Loud warn, don't
      // refuse to start.
      logger?.warn?.('[cors] UNLIGHTHOUSE_CORS_ORIGINS=* while UNLIGHTHOUSE_API_TOKEN is set. Pin specific origins instead.')
    }
    log.info(`auth: Bearer-token gate enabled on ${joinURL(resolvedConfig.routerPrefix, resolvedConfig.apiPrefix)}/* (local-bypass=${localBypass})`)
    app.use(createBearerAuthGate({
      apiToken,
      apiBase: joinURL(resolvedConfig.routerPrefix, resolvedConfig.apiPrefix),
      localBypass,
      trustProxy,
    }))
  }

  app.use(resolvedConfig.routerPrefix, root.handler)
}

// Extracted out of mountServer so it can be tested without spinning up
// the full host stack (which needs storage + chrome + a real listener).
// All decisions land in pure functions:
//   - parseBearer(): header extraction
//   - getClientIp(): trust-proxy aware client identity
//   - isLoopback(): bypass classification
// Returns an h3 event handler that 401s when the request hits the API
// surface without a valid token. Pass-through (return undefined) on
// everything that should bypass auth.
export interface BearerAuthGateOptions {
  apiToken: string
  apiBase: string
  localBypass: boolean
  trustProxy: boolean
}

export function createBearerAuthGate(opts: BearerAuthGateOptions) {
  const expected = Buffer.from(opts.apiToken, 'utf8')
  // Anchored with trailing slash so a `/apidocs` request doesn't
  // accidentally match a `/api` prefix.
  const apiPathPrefix = opts.apiBase.endsWith('/') ? opts.apiBase : `${opts.apiBase}/`

  return defineEventHandler((event) => {
    const url = event.node.req.url ?? ''
    if (!url.startsWith(apiPathPrefix))
      return
    if (event.node.req.method === 'OPTIONS')
      return
    const sub = url.slice(apiPathPrefix.length).split('?')[0]
    if (sub === 'health' || sub === 'ready')
      return
    if (opts.localBypass && isLoopback(getClientIp(event, opts.trustProxy)))
      return

    const got = parseBearer(event)
    if (got) {
      const gotBuf = Buffer.from(got, 'utf8')
      // timingSafeEqual requires equal lengths — fast-pass a length
      // mismatch as "wrong" without doing the compare so timing
      // doesn't leak the expected length.
      if (gotBuf.length === expected.length && timingSafeEqual(gotBuf, expected))
        return
    }

    setResponseStatus(event, 401)
    setResponseHeader(event, 'WWW-Authenticate', 'Bearer realm="unlighthouse"')
    return { error: 'unauthorized', message: 'Bearer token required.' }
  })
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

// Resolve the client IP for auth-bypass and rate-limiting bucketing.
// When trustProxy is on, prefer the left-most X-Forwarded-For entry
// (the original client per the standard). Otherwise use the socket peer
// directly so a misconfigured deploy can't spoof identity via headers.
export function getClientIp(event: H3Event, trustProxy: boolean): string | null {
  if (trustProxy) {
    const fwd = getHeader(event, 'x-forwarded-for')
    if (fwd) {
      // Header value is `client, proxy1, proxy2`. The left-most is the
      // originator the closest proxy saw.
      const first = fwd.split(',')[0]?.trim()
      if (first)
        return first
    }
  }
  return event.node.req.socket?.remoteAddress ?? null
}

// Loopback check used by the LOCAL_BYPASS escape hatch. Operates on a
// raw IP string so the same helper works for both socket peer and
// X-Forwarded-For-resolved address.
function isLoopback(ip: string | null): boolean {
  if (!ip)
    return false
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
}
