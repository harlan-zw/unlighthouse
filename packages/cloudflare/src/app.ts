// Workers entry: composes the HTTP projection into a `fetch` handler and routes
// the WebSocket subscribe path to ScanEventsDO.

import type { BrowserWorker } from '@cloudflare/puppeteer'
import type {
  D1Database,
  DurableObjectNamespace,
  ExecutionContext,
  Fetcher,
  KVNamespace,
  R2Bucket,
} from '@cloudflare/workers-types'
import type { Logger } from '@unlighthouse/contracts'
import type { UnlighthouseConfig } from '@unlighthouse/contracts/config'
import type { DeviceMatrix } from '@unlighthouse/contracts/types/atoms'
import type { HandlerCtx } from '@unlighthouse/core/api/handlers'
import { UnlighthouseConfigSchema } from '@unlighthouse/contracts/config'
import { createErrorEnvelope, ErrorCodes, UnlighthouseError } from '@unlighthouse/contracts/errors'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { isDevice, normaliseDeviceMatrix, parseScanId } from '@unlighthouse/contracts/types/atoms'
import { auditRoute, createUnlighthouseCore } from '@unlighthouse/core'
import { createHandlers } from '@unlighthouse/core/api/handlers'
import { createHttpRouter } from '@unlighthouse/core/api/http'
// Subpath imports keep the Worker bundle off `@unlighthouse/core/auditors`
// (the barrel — which re-exports `auditors/local` and its lighthouse
// dependency, which breaks the Worker runtime with a Node-only
// `fileURLToPath` call). Pull the one adapter we use directly.
import { createMockAuditor } from '@unlighthouse/core/auditors/mock'
import { parallelMapCrawler } from '@unlighthouse/core/crawlers'
import { manualSeeds } from '@unlighthouse/core/seeds'
import { createApp, toWebHandler } from 'h3'
// Note: createCloudflareBrowserAuditor (and its transitive cdp-connect →
// lighthouse dependency) loads lazily inside buildHandlerCtx so a
// mock-mode deploy doesn't drag the lighthouse package into the Worker
// bundle. lighthouse uses node:url and other Node-only APIs at top-level
// and breaks the Workers runtime even when never invoked.
import { cloudflareCrawler } from './crawlers/cloudflare-crawl'
import { scanEventsEmit } from './scan-events-emit'
import { fuseSeedsDedup, workerSitemapSeeds } from './seeds'
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
  /**
   * Alarm-driven durable scan scheduler. When present, scan.start delegates to
   * it (durable, survives the waitUntil budget) instead of running the whole
   * scan inside execCtx.waitUntil. Optional — absent → legacy waitUntil path.
   */
  SCAN_RUNNER_DO?: DurableObjectNamespace
  /**
   * Service binding to this same Worker. ScanRunnerDO uses it to delegate each
   * per-URL audit back to the Worker (where the consumer's auditor lives), one
   * fresh invocation per URL. Required for the SCAN_RUNNER_DO path.
   */
  SELF?: Fetcher
  /**
   * LighthouseContainer DO binding. When present, the example wires
   * `createContainerLighthouseAuditor` (from @unlighthouse/cloudflare-lighthouse)
   * into the auditorFactory — real Lighthouse runs in the container.
   */
  LIGHTHOUSE_CONTAINER?: DurableObjectNamespace
  /** Shared bearer between Worker and LighthouseContainer. Set via `wrangler secret put`. */
  SHARED_AUDIT_TOKEN?: string
  /** Optional CrUX API key; enables the field-data fallback tier. */
  CRUX_API_KEY?: string
  /**
   * Optional Google PageSpeed Insights API key. The PSI auditor (real
   * Lighthouse via Google, no container/Browser Run cost) works without it but
   * at a low rate limit; a free key raises the quota (~25k/day).
   */
  PSI_API_KEY?: string
  /** Inline config JSON; the preset Zod-validates this. */
  UNLIGHTHOUSE_CONFIG?: string
  /** Package version surfaced by `manifest` + `health`. Set during deploy. */
  UNLIGHTHOUSE_VERSION?: string
  /** Set to "1" to fall back to the mock auditor (no Browser Rendering needed). */
  UNLIGHTHOUSE_USE_MOCK_AUDITOR?: string
  /**
   * Static assets binding (the built Nuxt dashboard SPA). Optional — when
   * present, non-API requests are served from it with SPA fallback, so a single
   * Worker hosts both the panel and the API. Configured via `[assets]` in
   * wrangler.toml with `binding = "ASSETS"`.
   */
  ASSETS?: Fetcher
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
  /**
   * SSRF policy hook (D-043). A multi-tenant deploy accepts `scan.start` with a
   * caller-supplied `site`; without a policy that target could be an internal
   * address (`http://169.254.169.254/…`, `http://10.0.0.5/…`), turning the
   * Worker into an SSRF proxy. When provided, this is called with the resolved
   * target URL before a scan starts; returning `false` rejects the request with
   * 403. Defaults to allow-all (single-tenant / trusted deploys); multi-tenant
   * deploys MUST supply it. Core stays policy-free — this is a host option.
   */
  allowedTargets?: (url: string) => boolean | Promise<boolean>
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
    success: fn('success'),
    trace: fn('trace'),
    withTag: (childTag: string) => createWorkersLogger(`${tag}/${childTag}`),
  }
  return base
}

function parseConfig(env: CloudflareEnv): UnlighthouseConfig {
  if (!env.UNLIGHTHOUSE_CONFIG)
    return UnlighthouseConfigSchema.parse({ site: 'https://example.com' })
  return UnlighthouseConfigSchema.parse(JSON.parse(env.UNLIGHTHOUSE_CONFIG) as unknown)
}

// Mutable reference to the site the next scan should seed against.
// `scan.start` requests update this just before the handler runs (see the
// body-parse interceptor in createCloudflareApp's fetch path); seeds()
// reads it lazily so a single Worker instance can serve scans for any
// number of sites without needing a redeploy per site.
//
// Concurrency: `scan.start` is gated by `core.session()` ("active scan
// conflict") and by the transport-level rate limiter, so two simultaneous
// writes to this slot can't race in practice — the second request 409s
// before its seeds() fires.
interface PendingSeed {
  site: string | null
}

interface StaticAssetsBinding {
  fetch: (request: Request) => Response | Promise<Response>
}

function fetchStaticAsset(assets: Fetcher, req: Request): Response | Promise<Response> {
  return (assets as unknown as StaticAssetsBinding).fetch(req)
}

function errorResponse(err: unknown, status?: number): Response {
  const envelope = createErrorEnvelope(err)
  return new Response(JSON.stringify(envelope), {
    status: status ?? envelope.error.statusCode,
    headers: { 'content-type': 'application/json' },
  })
}

async function cloneResponse(res: { status: number, headers: Headers, text: () => Promise<string> }): Promise<Response> {
  return new Response(await res.text(), {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
  })
}

function buildHandlerCtx(env: CloudflareEnv, opts?: CreateCloudflareAppOptions, pendingSeed?: PendingSeed): HandlerCtx {
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
  // Resolve the site to scan lazily: prefer the host the inbound scan.start
  // carried in its body (set on `pendingSeed.site` by the fetch interceptor);
  // fall back to UNLIGHTHOUSE_CONFIG.site for callers that omit it (mostly the
  // smoke-test path). Null when neither is set so the scan errors cleanly
  // instead of crawling a placeholder.
  const siteFor = (): string | null => {
    const fromRequest = pendingSeed?.site
    if (fromRequest)
      return fromRequest
    const fromConfig = (config as { site?: string }).site
    return fromConfig ?? null
  }
  // Seeds: manual (the site root, always) fused with Workers-native sitemap
  // discovery. Without the sitemap source the Worker only ever audits the
  // single seed URL — the cloudflare/parallel-map crawlers do no in-page link
  // discovery — so "scan the whole site" degraded to one page. Sitemap
  // discovery (global fetch + regex parse, no Node deps) restores it. Gated by
  // `scanner.sitemap !== false` to mirror the local host's behaviour.
  const sitemapConfig = (config as { scanner?: { sitemap?: true | string[] | false } }).scanner?.sitemap
  const seedSources = [
    manualSeeds({
      urls: () => {
        const s = siteFor()
        return s ? [s] : []
      },
    }),
  ]
  if (sitemapConfig !== false) {
    seedSources.push(workerSitemapSeeds({
      site: siteFor,
      sitemaps: Array.isArray(sitemapConfig) ? sitemapConfig : true,
      logger: (logger as { withTag: (t: string) => Logger }).withTag('seeds/sitemap'),
    }))
  }
  const seeds = fuseSeedsDedup(seedSources)
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
      }).catch((err) => {
        logOperationalWarn('cloudflare.scan_event_fanout_failed', err, {
          scanId,
          event: event.name,
        }, logger)
      })
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

// Distinguish API calls from UI routes so non-API GETs can be served from the
// bundled SPA. The dashboard always calls the API under its configured `/api/*`
// base, so that prefix is unambiguously API and is the path the panel uses.
//
// The bare, prefix-less command roots also need to resolve (raw `/scan/start`
// callers, the WS path), but several collide with UI routes that share a first
// segment: `/sites/list` is API while `/sites/example.com` is a page; likewise
// `/route/*`, `/compare/*`, `/history/*`. Since the panel never calls those
// without the `/api` prefix, we treat the prefix-less form as API only for roots
// that have NO UI collision, plus the two singletons. Everything else falls
// through to the SPA.
const API_EXCLUSIVE_ROOTS = new Set([
  'api',
  'scan',
  'pack',
  'query',
  'events',
  'auditors',
  'assert',
  'dashboard',
])
function isApiPath(pathname: string): boolean {
  if (pathname === '/health' || pathname === '/manifest')
    return true
  const root = pathname.split('/')[1] ?? ''
  return API_EXCLUSIVE_ROOTS.has(root)
}

interface ScanStartBody {
  site?: unknown
  device?: unknown
  mode?: unknown
}

// Normalise a scan.start `device` input (single | array | absent) into a
// deduped device matrix, defaulting to ['mobile'].
function resolveDevices(input: unknown): DeviceMatrix {
  const raw = Array.isArray(input) ? input : input != null ? [input] : []
  return normaliseDeviceMatrix(raw.filter(isDevice))
}

export function createCloudflareApp(env: CloudflareEnv, opts?: CreateCloudflareAppOptions): CloudflareApp {
  const logger = createWorkersLogger('unlighthouse/fetch')
  const pendingSeed: PendingSeed = { site: null }
  const ctx = buildHandlerCtx(env, opts, pendingSeed)
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

      // Serve the bundled dashboard SPA for everything that isn't an API call.
      // The API surface is `/api/*` plus the bare command roots (the router
      // mounts prefix-less); anything else is a UI route and is handed to the
      // ASSETS binding, which does its own static lookup + SPA fallback to
      // index.html for client-side routes like `/sites/example.com`.
      if (runtimeEnv.ASSETS && req.method === 'GET' && !isApiPath(url.pathname)) {
        return fetchStaticAsset(runtimeEnv.ASSETS, req)
      }

      // Internal audit endpoint — ScanRunnerDO delegates each per-URL audit here
      // (via the SELF service binding) so the audit runs with the consumer's
      // auditor (which only the Worker's auditorFactory has) AND in a fresh
      // invocation with its own budget. Token-guarded; never exposed publicly.
      if (req.method === 'POST' && url.pathname === '/__scan/audit') {
        const token = req.headers.get('x-audit-token')
        if (!runtimeEnv.SHARED_AUDIT_TOKEN || token !== runtimeEnv.SHARED_AUDIT_TOKEN)
          return new Response('unauthorized', { status: 401 })
        let body: { scanId?: string, url?: string, devices?: unknown }
        try {
          body = await req.json() as typeof body
        }
        catch (err) {
          return errorResponse(new UnlighthouseError({
            code: ErrorCodes.INPUT_INVALID,
            message: 'Invalid internal audit request body.',
            cause: err,
          }))
        }
        const scanId = body.scanId
        const targetUrl = body.url
        if (!scanId || !targetUrl) {
          return errorResponse(new UnlighthouseError({
            code: ErrorCodes.INPUT_INVALID,
            message: 'scanId and url are required.',
          }))
        }
        const parsedScanId = parseScanId(scanId)
        const emit = scanEventsEmit(runtimeEnv, scanId)
        let scanned = 0
        let failed = 0
        for (const device of resolveDevices(body.devices)) {
          const { ok } = await auditRoute(
            { auditor: ctx.auditor, storage: ctx.storage, config: ctx.config, logger: undefined, emit },
            { scanId: parsedScanId, url: targetUrl, device },
          )
          if (ok)
            scanned++
          else
            failed++
        }
        return new Response(JSON.stringify({ scanned, failed }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      // WebSocket subscribe → ScanEventsDO. Avoids the standard HTTP pipeline
      // since toWebHandler can't return a 101 with a webSocket field.
      if (url.pathname === '/api/events/subscribe' && req.headers.get('Upgrade') === 'websocket') {
        const scanId = url.searchParams.get('scanId')
        if (!scanId)
          return new Response('scanId required', { status: 400 })
        const id = runtimeEnv.SCAN_EVENTS_DO.idFromName(scanId)
        const stub = runtimeEnv.SCAN_EVENTS_DO.get(id) as unknown as { fetch: (request: Request) => Response | Promise<Response> }
        return stub.fetch(req)
      }

      // The HTTP command router mounts routes WITHOUT a prefix (`/scan/start`),
      // but the dashboard client (and the WS path above) speak the conventional
      // `/api/*` surface. Strip a leading `/api` so both the bundled panel and
      // raw `/api/...` callers reach the same routes — and the prefix-less
      // `/scan/start` form keeps working too.
      let apiReq = req
      if (url.pathname.startsWith('/api/') || url.pathname === '/api') {
        const stripped = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/'
        const rewritten = new URL(req.url)
        rewritten.pathname = stripped
        apiReq = new Request(rewritten, req)
        url.pathname = stripped
      }

      // Transport-level rate-limit gate for scan.start + body peek to
      // capture `site` for the seed-source (so a single deploy can scan
      // many hosts without redeploying). Read the clone of `apiReq` — the
      // request that's actually handed downstream — so the body isn't consumed
      // out from under the h3 handler (the `/api` rewrite above already moved
      // the body onto `apiReq`).
      let startBody: ScanStartBody | null = null
      let startBodyParseError: unknown = null
      if (apiReq.method === 'POST' && url.pathname === '/scan/start') {
        try {
          startBody = await apiReq.clone().json() as ScanStartBody
          pendingSeed.site = (startBody && typeof startBody.site === 'string' && startBody.site.length > 0)
            ? startBody.site
            : null
        }
        catch (err) {
          startBodyParseError = err
          logOperationalWarn('api.request_body_parse_failed', err, { path: url.pathname }, logger)
          pendingSeed.site = null
        }
        if (startBodyParseError) {
          return errorResponse(new UnlighthouseError({
            code: ErrorCodes.INPUT_INVALID,
            message: 'Invalid scan.start request body.',
            cause: startBodyParseError,
          }))
        }

        // SSRF policy gate (D-043). Vet the resolved target before any scan
        // work starts. Host concern — the rejection is a plain 403, not a core
        // UnlighthouseError. Default (no hook) allows all targets.
        if (opts?.allowedTargets) {
          const target = pendingSeed.site ?? (ctx.config as { site?: string }).site ?? null
          if (target && !(await opts.allowedTargets(target))) {
            logOperationalWarn('cloudflare.scan_target_rejected', null, { target }, logger)
            return new Response(
              JSON.stringify({ error: 'forbidden', message: 'Scan target not allowed by host policy.' }),
              { status: 403, headers: { 'content-type': 'application/json' } },
            )
          }
        }

        const key = apiReq.headers.get('x-api-key')
          ?? apiReq.headers.get('cf-connecting-ip')
          ?? 'global'
        const id = runtimeEnv.RATE_LIMITER_DO.idFromName(key)
        const stub = runtimeEnv.RATE_LIMITER_DO.get(id)
        const limiterUrl = `https://rate-limiter/?key=${encodeURIComponent(key)}&cost=1`
        const limiterRes = await stub.fetch(limiterUrl)
        const limiterBody = await limiterRes.json() as { ok: boolean, resetAt: number }
        if (!limiterBody.ok) {
          const retryAfter = Math.max(0, Math.ceil((limiterBody.resetAt - Date.now()) / 1000))
          return new Response(
            JSON.stringify(createErrorEnvelope(new UnlighthouseError({
              code: ErrorCodes.RATE_LIMITED,
              message: 'Rate limit exceeded',
              details: { resetAt: limiterBody.resetAt },
              retryable: true,
            }))),
            {
              status: 429,
              headers: {
                'content-type': 'application/json',
                'retry-after': String(retryAfter),
              },
            },
          )
        }

        // Durable scan path: when the alarm-driven runner DO is wired, delegate
        // the whole scan to it (discovery + per-URL audit + finalize all happen
        // across alarm ticks, surviving the waitUntil budget that wedged the
        // legacy path at "scanning" on multi-URL sites). Await the DO's /start
        // so the scan row + queue exist before we respond (status polling works
        // immediately); the alarm loop then runs independently of this request.
        if (runtimeEnv.SCAN_RUNNER_DO && runtimeEnv.SELF) {
          const site = pendingSeed.site ?? (ctx.config as { site?: string }).site ?? null
          if (!site) {
            return errorResponse(new UnlighthouseError({
              code: ErrorCodes.INPUT_INVALID,
              message: 'site is required',
            }))
          }
          const devices = resolveDevices(startBody?.device)
          const mode = startBody?.mode === 'page' ? 'page' : 'site'
          const scanId = crypto.randomUUID()
          const startedAt = new Date().toISOString()
          const runnerId = runtimeEnv.SCAN_RUNNER_DO.idFromName(scanId)
          const runner = runtimeEnv.SCAN_RUNNER_DO.get(runnerId)
          try {
            const runnerRes = await runner.fetch('https://scan-runner/start', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ scanId, site, devices, mode, config: ctx.config }),
            } satisfies RequestInit)
            if (!runnerRes.ok)
              return cloneResponse(runnerRes as unknown as Parameters<typeof cloneResponse>[0])
          }
          catch (err) {
            return errorResponse(new UnlighthouseError({
              code: ErrorCodes.INFRA_RETRYABLE,
              message: 'failed to start scan runner',
              cause: err,
              retryable: true,
            }))
          }
          return new Response(
            JSON.stringify({ scanId, site, mode, startedAt }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        }
      }

      // Durable cancel/pause/resume. The ScanRunnerDO owns the alarm loop, so
      // these controls must reach the DO — the default webHandler path runs
      // core's session-based handlers, which don't exist for a DO-driven scan
      // (so the buttons silently no-op'd). Route to the runner DO by scanId.
      // Falls through to the webHandler when no scanId / no DO (legacy path).
      if (
        runtimeEnv.SCAN_RUNNER_DO
        && apiReq.method === 'POST'
        && (url.pathname === '/scan/cancel' || url.pathname === '/scan/pause' || url.pathname === '/scan/resume')
      ) {
        const body = await apiReq.clone().json().catch((err) => {
          logOperationalWarn('api.request_body_parse_failed', err, { path: url.pathname }, logger)
          return null
        }) as { scanId?: string } | null
        const scanId = body?.scanId
        if (scanId) {
          const action = url.pathname.slice('/scan/'.length) // cancel | pause | resume
          const runnerId = runtimeEnv.SCAN_RUNNER_DO.idFromName(scanId)
          const runner = runtimeEnv.SCAN_RUNNER_DO.get(runnerId)
          let forwarded
          try {
            forwarded = await runner.fetch(`https://scan-runner/${action}`, { method: 'POST' } satisfies RequestInit)
          }
          catch (err) {
            return errorResponse(new UnlighthouseError({
              code: ErrorCodes.INFRA_RETRYABLE,
              message: `failed to forward scan ${action} to runner`,
              cause: err,
              retryable: true,
            }))
          }
          if (!forwarded.ok)
            return cloneResponse(forwarded as unknown as Parameters<typeof cloneResponse>[0])
          const nextStatus = action === 'cancel' ? 'cancelled' : action === 'pause' ? 'paused' : 'scanning'
          return new Response(
            JSON.stringify({ scanId, status: nextStatus }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        }
      }

      const res = await webHandler(apiReq)

      // If scan.start kicked off a session, register session.done with the
      // Worker's ExecutionContext so the runtime keeps the orchestration
      // alive after the response returns. Without this, Workers GCs the
      // request scope as soon as the response is sent and the scan stays
      // wedged in `starting` (its row + LHR blobs never get written).
      // Use `apiReq`/`url` (both already normalised past the /api strip) so the
      // match is robust whether the caller hit `/scan/start` or `/api/scan/start`.
      if (apiReq.method === 'POST' && url.pathname === '/scan/start' && res.ok) {
        const session = ctx.core.session?.()
        if (session?.done) {
          execCtx.waitUntil(session.done.catch((err) => {
            logger.debug('background scan session rejected', err)
          }))
        }
      }

      return res
    },
  }
}
