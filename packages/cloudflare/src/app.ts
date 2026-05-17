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
// Subpath imports keep the Worker bundle off `@unlighthouse/core/auditors`
// (the barrel — which re-exports `auditors/local` and its lighthouse
// dependency, which breaks the Worker runtime with a Node-only
// `fileURLToPath` call). Pull the one adapter we use directly.
import { createMockAuditor } from '@unlighthouse/core/auditors/mock'
import { parallelMapCrawler } from '@unlighthouse/core/crawlers/parallel-map'
import { manualSeeds } from '@unlighthouse/core/seeds'
import { createApp, toWebHandler } from 'h3'
// Note: createCloudflareBrowserAuditor (and its transitive cdp-connect →
// lighthouse dependency) loads lazily inside buildHandlerCtx so a
// mock-mode deploy doesn't drag the lighthouse package into the Worker
// bundle. lighthouse uses node:url and other Node-only APIs at top-level
// and breaks the Workers runtime even when never invoked.
import { cloudflareCrawler } from './crawlers/cloudflare-crawl'
import { d1R2Storage, migrate as migrateD1 } from './storage/d1-r2'

export interface CloudflareEnv {
  DB: D1Database
  BLOBS: R2Bucket
  KV?: KVNamespace
  /**
   * Browser Rendering binding. Optional — requires Workers Paid plan.
   * When absent, callers should set UNLIGHTHOUSE_USE_MOCK_AUDITOR=1 so
   * the mock auditor takes its place (everything else stays wired).
   */
  BROWSER?: BrowserWorker
  SCAN_EVENTS_DO: DurableObjectNamespace
  RATE_LIMITER_DO: DurableObjectNamespace
  /** Inline config JSON; the preset Zod-validates this. */
  UNLIGHTHOUSE_CONFIG?: string
  /** Package version surfaced by `manifest` + `health`. Set during deploy. */
  UNLIGHTHOUSE_VERSION?: string
  /** Set to "1" to fall back to the mock auditor (no Browser Rendering needed). */
  UNLIGHTHOUSE_USE_MOCK_AUDITOR?: string
}

export interface CloudflareApp {
  fetch: (req: Request, env: CloudflareEnv, ctx: ExecutionContext) => Promise<Response>
}

/**
 * Optional auditor factory. Lets the caller wire `createCloudflareBrowserAuditor`
 * (or anything else) without the preset statically importing it — which would
 * drag the lighthouse package into the Worker bundle whether the operator
 * uses it or not. Default behaviour without this opt: mock auditor when
 * UNLIGHTHOUSE_USE_MOCK_AUDITOR=1 or env.BROWSER is absent, otherwise we
 * still mock (we don't know how to spin Browser Rendering ourselves without
 * the extra dependency).
 */
export interface CreateCloudflareAppOptions {
  auditorFactory?: (env: CloudflareEnv) => import('@unlighthouse/contracts/ports').Auditor
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

function buildHandlerCtx(env: CloudflareEnv, opts?: CreateCloudflareAppOptions): HandlerCtx {
  const logger = createWorkersLogger()
  const config = parseConfig(env)
  // Auditor selection:
  //   1. opts.auditorFactory — the operator wired one (e.g. via
  //      createCloudflareBrowserAuditor in their worker entry). We use it.
  //   2. No factory + mock-mode opt OR no Browser binding → createMockAuditor.
  //      Keeps the rest of the stack (D1, R2, DOs, HTTP, WS) verifiable on
  //      a Workers Free deploy without dragging lighthouse into the bundle.
  //   3. No factory + Browser binding present → still mock. The preset can't
  //      construct the real auditor without statically importing the
  //      browser-rendering module, which would drag lighthouse in for
  //      every deploy. Callers who want real Browser Rendering auditing
  //      pass opts.auditorFactory.
  const useMockExplicit = (env as { UNLIGHTHOUSE_USE_MOCK_AUDITOR?: string }).UNLIGHTHOUSE_USE_MOCK_AUDITOR === '1'
  const auditor = opts?.auditorFactory && !useMockExplicit
    ? opts.auditorFactory(env)
    : createMockAuditor({ logger: (logger as { withTag: (t: string) => Logger }).withTag('auditors/mock') })
  // Crawler: cloudflareCrawler when env.BROWSER is available, otherwise
  // parallel-map (purely seed-driven, no in-page discovery — right shape
  // for the mock auditor case).
  const crawler = env.BROWSER
    ? cloudflareCrawler({ browser: env.BROWSER })
    : parallelMapCrawler({ concurrency: 4 })
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

export function createCloudflareApp(env: CloudflareEnv, opts?: CreateCloudflareAppOptions): CloudflareApp {
  const ctx = buildHandlerCtx(env, opts)
  const router = createHttpRouter({ handlers: createHandlers(), ctx })

  const app = createApp()
  app.use(router)
  const webHandler = toWebHandler(app)

  // Apply D1 schema migrations on the first request after a cold start.
  // The flag is module-scoped (this function builds it on every Worker
  // instance boot); D1 migrate() is idempotent (CREATE TABLE IF NOT
  // EXISTS) so repeated runs are no-ops, but we still skip after the
  // first to avoid the round-trip cost on every request.
  let migrated = false
  const ensureMigrated = async (runtimeEnv: CloudflareEnv): Promise<void> => {
    if (migrated)
      return
    await migrateD1(runtimeEnv.DB)
    migrated = true
  }

  return {
    async fetch(req: Request, runtimeEnv: CloudflareEnv, execCtx: ExecutionContext): Promise<Response> {
      await ensureMigrated(runtimeEnv)
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
      // Path is `/scan/start` (router prefix '/'); the leading `/api` got
      // dropped when the toWebHandler stopped prefixing routes.
      if (req.method === 'POST' && url.pathname === '/scan/start') {
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

      const res = await webHandler(req)

      // If scan.start kicked off a session, register session.done with the
      // Worker's ExecutionContext so the runtime keeps the orchestration
      // alive after the response returns. Without this, Workers GCs the
      // request scope as soon as the response is sent and the scan never
      // actually writes its row + LHR blobs.
      if (req.method === 'POST' && url.pathname === '/scan/start' && res.ok) {
        const session = ctx.core.session?.()
        if (session?.done)
          execCtx.waitUntil(session.done.catch(() => undefined))
      }

      return res
    },
  }
}
