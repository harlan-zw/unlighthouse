// Workers entry: composes the HTTP projection into a `fetch` handler and routes
// the WebSocket subscribe path to ScanEventsDO.

import type { BrowserWorker } from '@cloudflare/puppeteer'
import type {
  D1Database,
  DurableObjectNamespace,
  ExecutionContext,
  KVNamespace,
  R2Bucket,
} from '@cloudflare/workers-types'
import type { Logger, UnlighthouseConfig } from '@unlighthouse/contracts'
import type { HandlerCtx } from '@unlighthouse/core/api/handlers'
import { createUnlighthouseCore } from '@unlighthouse/core'
import { createHandlers } from '@unlighthouse/core/api/handlers'
import { createHttpRouter } from '@unlighthouse/core/api/http'
import { createMockAuditor } from '@unlighthouse/core/auditors'
import { manualSeeds } from '@unlighthouse/core/seeds'
import { createApp, toWebHandler } from 'h3'
import { createCloudflareBrowserAuditor } from './auditors/browser-rendering'
import { cloudflareCrawler } from './crawlers/cloudflare-crawl'
import { d1R2Storage } from './storage/d1-r2'

export interface CloudflareEnv {
  DB: D1Database
  BLOBS: R2Bucket
  KV?: KVNamespace
  /** Browser Rendering binding. */
  BROWSER: BrowserWorker
  SCAN_EVENTS_DO: DurableObjectNamespace
  RATE_LIMITER_DO: DurableObjectNamespace
  /** Inline config JSON; the preset Zod-validates this. */
  UNLIGHTHOUSE_CONFIG?: string
  /** Package version surfaced by `manifest` + `health`. Set during deploy. */
  UNLIGHTHOUSE_VERSION?: string
}

export interface CloudflareApp {
  fetch: (req: Request, env: CloudflareEnv, ctx: ExecutionContext) => Promise<Response>
}

// Minimal Workers-safe logger; consola is too heavy here.
function createWorkersLogger(tag = 'unlighthouse'): Logger {
  const fn = (level: string) => (...args: unknown[]) => {
    // eslint-disable-next-line no-console
    console.log(`[${tag}][${level}]`, ...args)
  }
  const base = {
    info: fn('info'),
    warn: fn('warn'),
    error: fn('error'),
    debug: fn('debug'),
    log: fn('log'),
    withTag: (childTag: string) => createWorkersLogger(`${tag}/${childTag}`),
  }
  return base as unknown as Logger
}

function parseConfig(env: CloudflareEnv): UnlighthouseConfig {
  if (!env.UNLIGHTHOUSE_CONFIG)
    return { site: 'https://example.com' } as unknown as UnlighthouseConfig
  return JSON.parse(env.UNLIGHTHOUSE_CONFIG) as UnlighthouseConfig
}

function buildHandlerCtx(env: CloudflareEnv): HandlerCtx {
  const logger = createWorkersLogger()
  const config = parseConfig(env)
  // D-022 + Phase 5: real auditor backed by env.BROWSER. The wrapper
  // lazily launches the browser on first audit, exposes wsEndpoint() to
  // cdp-connect, and reuses it across calls. UNLIGHTHOUSE_USE_MOCK_AUDITOR
  // stays as an escape hatch for tests / failure modes where the binding
  // isn't available — same shape as before, just opt-in instead of the
  // default.
  const useMock = (env as { UNLIGHTHOUSE_USE_MOCK_AUDITOR?: string }).UNLIGHTHOUSE_USE_MOCK_AUDITOR === '1'
  const auditor = useMock
    ? createMockAuditor({ logger: (logger as { withTag: (t: string) => Logger }).withTag('auditors/mock') })
    : createCloudflareBrowserAuditor({
        browser: env.BROWSER,
        logger: (logger as { withTag: (t: string) => Logger }).withTag('auditors/browser-rendering'),
      })
  const crawler = cloudflareCrawler({ browser: env.BROWSER })
  const storage = d1R2Storage({ db: env.DB, bucket: env.BLOBS })
  const seeds = manualSeeds({
    urls: (config as { site?: string }).site ? [(config as { site: string }).site] : [],
  })
  const core = createUnlighthouseCore({
    config,
    auditor,
    seeds,
    crawler,
    storage,
    logger,
  })

  // Bridge core's hook bus into ScanEventsDO. Every emitted hook with a
  // scanId-bearing payload is forwarded to the matching DO via its POST
  // RPC; subscribers (WebSocket clients) downstream of that DO see the
  // event live without polling. Cross-cutting hooks without a scanId
  // (the global `log` channel) skip the forward — they belong on a
  // separate broadcast channel if/when one ships.
  const hookable = (core as { hooks?: { afterEach?: (cb: (e: { name: string, args: unknown[] }) => void) => () => void } }).hooks
  if (hookable?.afterEach) {
    hookable.afterEach((event) => {
      const payload = event.args?.[0] as { scanId?: string } | undefined
      const scanId = payload?.scanId
      if (!scanId)
        return
      const id = env.SCAN_EVENTS_DO.idFromName(scanId)
      const stub = env.SCAN_EVENTS_DO.get(id)
      // Fire-and-forget; we don't await the DO write because hook
      // listeners are synchronous and DO RPCs are async. Errors surface
      // through the DO's own log; failing to fan out shouldn't fail the
      // hook.
      void stub.fetch('https://scan-events/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event: event.name, payload }),
      }).catch(() => undefined)
    })
  }

  return {
    core,
    auditor,
    storage,
    config,
    version: env.UNLIGHTHOUSE_VERSION ?? 'unknown',
  } as HandlerCtx
}

export function createCloudflareApp(env: CloudflareEnv): CloudflareApp {
  const ctx = buildHandlerCtx(env)
  const router = createHttpRouter({ handlers: createHandlers(), ctx })

  const app = createApp()
  app.use(router)
  const webHandler = toWebHandler(app)

  return {
    async fetch(req: Request, runtimeEnv: CloudflareEnv): Promise<Response> {
      const url = new URL(req.url)

      // WebSocket subscribe → ScanEventsDO. Avoids the standard HTTP pipeline
      // since toWebHandler can't return a 101 with a webSocket field.
      if (url.pathname === '/api/events/subscribe' && req.headers.get('Upgrade') === 'websocket') {
        const scanId = url.searchParams.get('scanId')
        if (!scanId)
          return new Response('scanId required', { status: 400 })
        const id = runtimeEnv.SCAN_EVENTS_DO.idFromName(scanId)
        const stub = runtimeEnv.SCAN_EVENTS_DO.get(id)
        // @ts-expect-error - DO stub.fetch accepts Request; types fight Workers types.
        return stub.fetch(req)
      }

      // Transport-level rate-limit gate for scan.start. Kept out of the HTTP
      // projection so the limiter never leaks into handler/router concerns.
      if (req.method === 'POST' && url.pathname === '/api/scan/start') {
        const key = req.headers.get('x-api-key')
          ?? req.headers.get('cf-connecting-ip')
          ?? 'global'
        const id = runtimeEnv.RATE_LIMITER_DO.idFromName(key)
        const stub = runtimeEnv.RATE_LIMITER_DO.get(id)
        const limiterUrl = `https://rate-limiter/?key=${encodeURIComponent(key)}&cost=1`
        const limiterRes = await stub.fetch(limiterUrl)
        const limiterBody = await limiterRes.json() as { ok: boolean, resetAt: number }
        if (!limiterBody.ok) {
          const retryAfter = Math.max(0, Math.ceil((limiterBody.resetAt - Date.now()) / 1000))
          return new Response(
            JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded', resetAt: limiterBody.resetAt } }),
            {
              status: 429,
              headers: {
                'content-type': 'application/json',
                'retry-after': String(retryAfter),
              },
            },
          )
        }
      }

      return webHandler(req)
    },
  }
}
