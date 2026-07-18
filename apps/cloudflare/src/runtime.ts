// Workers composition module: projects core commands into a secured fetch
// handler and exposes direct audit/retention methods to platform entrypoints.

import type {
  ScanAuditInput,
  ScanAuditResult,
  ScanWorkflowBinding,
  ScanWorkflowParams,
} from '@unlighthouse/cloudflare/workflows/scan'
import type { Logger } from '@unlighthouse/contracts'
import type { CommandInput } from '@unlighthouse/contracts/commands'
import type { UnlighthouseConfig } from '@unlighthouse/contracts/config'
import type { Auditor } from '@unlighthouse/contracts/ports'
import type { DeviceMatrix } from '@unlighthouse/contracts/types/atoms'
import type { HandlerCtx } from '@unlighthouse/core/api/handlers'
import type { EmitFn } from '@unlighthouse/core/runtime'
import { fuseSeedsDedup, workerSitemapSeeds } from '@unlighthouse/cloudflare/seeds'
import { d1R2Storage } from '@unlighthouse/cloudflare/storage'
import { ScanCancel, ScanPause, ScanResume, ScanStart } from '@unlighthouse/contracts/commands'
import { UnlighthouseConfigSchema } from '@unlighthouse/contracts/config'
import { createErrorEnvelope, ErrorCodes, UnlighthouseError } from '@unlighthouse/contracts/errors'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { isDevice, normaliseDeviceMatrix, parseScanId } from '@unlighthouse/contracts/types/atoms'
import { createHandlers } from '@unlighthouse/core/api/handlers'
import { createHttpRouter } from '@unlighthouse/core/api/http'
// Explicit Worker-safe core entrypoints keep Node-only adapters out of the
// production graph.
import { parallelMapCrawler } from '@unlighthouse/core/crawlers/parallel-map'
import { auditRoute, createScanLifecycle, createUnlighthouseCore, pruneScans } from '@unlighthouse/core/runtime'
import { manualSeeds } from '@unlighthouse/core/seeds'
import { createApp, toWebHandler } from 'h3'

export interface CloudflareEnv {
  DB: D1Database
  BLOBS: R2Bucket
  RATE_LIMITER_DO: {
    getByName: (name: string) => {
      consume: (key: string, cost?: number) => Promise<{
        ok: boolean
        remaining: number
        limit: number
        resetAt: number
      }>
    }
  }
  /** Durable, step-retried orchestration for discovery and route auditing. */
  SCAN_WORKFLOW: ScanWorkflowBinding
  /**
   * LighthouseContainer DO binding. When present, the example wires
   * `createContainerLighthouseAuditor` (from this package's `./auditors/container` subpath)
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
  /** Inline config JSON, validated against the shared core config schema. */
  UNLIGHTHOUSE_CONFIG?: string
  /** Package version surfaced by `manifest` + `health`. Set during deploy. */
  UNLIGHTHOUSE_VERSION?: string
  /**
   * Static assets binding (the built Nuxt dashboard SPA). Optional — when
   * present, non-API requests are served from it with SPA fallback, so a single
   * Worker hosts both the panel and the API. Configured by `assets` in
   * wrangler.jsonc.
   */
  ASSETS?: Fetcher
}

export interface CloudflareApp {
  fetch: (req: Request, env: CloudflareEnv, ctx: ExecutionContext) => Promise<Response>
  audit: (input: CloudflareAuditInput) => Promise<CloudflareAuditResult>
  scheduled: () => Promise<void>
}

export type CloudflareAuditInput = ScanAuditInput
export type CloudflareAuditResult = ScanAuditResult

type ScanStartInput = CommandInput<typeof ScanStart>

/** Host-owned policies and adapters for one Worker invocation. */
export interface CreateCloudflareAppOptions {
  /** The host must choose an explicit real or development-only auditor. */
  auditorFactory: (env: CloudflareEnv) => Auditor
  /** Authenticates every non-health request and returns a stable limiter key. */
  authenticate: (request: Request) => Promise<{ principal: string } | null>
  /** Deployment version surfaced by manifest and health responses. */
  version?: string
  /**
   * SSRF policy hook (D-043). A multi-tenant deploy accepts `scan.start` with a
   * caller-supplied `site`; without a policy that target could be an internal
   * address (`http://169.254.169.254/…`, `http://10.0.0.5/…`), turning the
   * Worker into an SSRF proxy. When provided, this is called with the resolved
   * target URL before a scan starts; returning `false` rejects the request with
   * 403. Core stays policy-free — this is a required host policy.
   */
  allowedTargets: (url: string) => boolean | Promise<boolean>
}

function serializableLogValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    }
  }
  return value
}

// Minimal Workers-safe structured logger; consola is too heavy here.
function createWorkersLogger(tag = 'unlighthouse'): Logger {
  const fn = (level: string) => (...args: unknown[]) => {
    const entry = {
      timestamp: new Date().toISOString(),
      tag,
      level,
      message: typeof args[0] === 'string' ? args[0] : undefined,
      data: args.map(serializableLogValue),
    }
    if (level === 'error') {
      console.error(entry)
    }
    else if (level === 'warn') {
      console.warn(entry)
    }
    else if (level === 'debug' || level === 'trace') {
      // eslint-disable-next-line no-console
      console.debug(entry)
    }
    else {
      // eslint-disable-next-line no-console
      console.log(entry)
    }
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
  const parsed: unknown = JSON.parse(env.UNLIGHTHOUSE_CONFIG)
  return UnlighthouseConfigSchema.parse(parsed)
}

// Mutable reference to the site the next scan should seed against.
// `scan.start` requests update this just before the handler runs (see the
// body-parse interceptor in createCloudflareApp's fetch path); seeds()
// reads it lazily so a single Worker instance can serve scans for any
// number of sites without needing a redeploy per site.
//
// This value is request-scoped: the maintained Worker creates the factory once
// per invocation. It must never be hoisted into module-global mutable state.
interface PendingSeed {
  site: string | null
}

async function fetchStaticAsset(assets: Fetcher, req: Request): Promise<Response> {
  const response = await assets.fetch(req)
  const headers = new Headers(response.headers)
  headers.set('cache-control', 'private, no-store')
  return new Response(response.body, {
    status: response.status,
    headers,
  })
}

function errorResponse(err: unknown, status?: number): Response {
  const envelope = createErrorEnvelope(err)
  return new Response(JSON.stringify(envelope), {
    status: status ?? envelope.error.statusCode,
    headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
  })
}

function noStoreResponse(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.set('cache-control', 'no-store')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

const MAX_JSON_BODY_BYTES = 64 * 1024
const NOOP_EMIT: EmitFn = async () => {}

interface JsonBodyRequest {
  headers: { get: (name: string) => string | null }
  body: ReadableStream<Uint8Array> | null
}

async function readJsonBody(request: JsonBodyRequest, maxBytes = MAX_JSON_BODY_BYTES): Promise<unknown> {
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new UnlighthouseError({
      code: ErrorCodes.INPUT_INVALID,
      message: `Request body exceeds the ${maxBytes}-byte limit.`,
    })
  }

  if (!request.body)
    throw new UnlighthouseError({ code: ErrorCodes.INPUT_INVALID, message: 'Request body is required.' })

  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break
    bytes += value.byteLength
    if (bytes > maxBytes) {
      await reader.cancel()
      throw new UnlighthouseError({
        code: ErrorCodes.INPUT_INVALID,
        message: `Request body exceeds the ${maxBytes}-byte limit.`,
      })
    }
    text += decoder.decode(value, { stream: true })
  }
  const parsed: unknown = JSON.parse(text + decoder.decode())
  return parsed
}

function buildHandlerCtx(env: CloudflareEnv, opts: CreateCloudflareAppOptions, pendingSeed?: PendingSeed): HandlerCtx {
  const logger = createWorkersLogger()
  const config = parseConfig(env)
  const auditor = opts.auditorFactory(env)
  // Discovery is seed-driven in Workers. Browser Rendering belongs to auditor
  // adapters; opening a browser here adds cost without discovering links.
  const crawler = parallelMapCrawler({ concurrency: 4 })
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
    const fromConfig = config.site
    return fromConfig ?? null
  }
  // Seeds: manual (the site root, always) fused with Workers-native sitemap
  // discovery. Without the sitemap source the Worker only ever audits the
  // single seed URL — the cloudflare/parallel-map crawlers do no in-page link
  // discovery — so "scan the whole site" degraded to one page. Sitemap
  // discovery (global fetch + regex parse, no Node deps) restores it. Gated by
  // `scanner.sitemap !== false` to mirror the local host's behaviour.
  const sitemapConfig = config.scanner?.sitemap
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
      logger: logger.withTag('seeds/sitemap'),
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

  return {
    core,
    auditor,
    storage,
    config,
    version: opts.version ?? env.UNLIGHTHOUSE_VERSION ?? 'unknown',
  }
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

// Normalise a scan.start `device` input (single | array | absent) into a
// deduped device matrix, defaulting to ['mobile'].
function resolveDevices(input: unknown): DeviceMatrix {
  const raw = Array.isArray(input) ? input : input != null ? [input] : []
  return normaliseDeviceMatrix(raw.filter(isDevice))
}

export function createCloudflareApp(env: CloudflareEnv, opts: CreateCloudflareAppOptions): CloudflareApp {
  const logger = createWorkersLogger('unlighthouse/fetch')
  const pendingSeed: PendingSeed = { site: null }
  const ctx = buildHandlerCtx(env, opts, pendingSeed)
  const router = createHttpRouter({ handlers: createHandlers(), ctx })

  const app = createApp()
  app.use(router)
  const webHandler = toWebHandler(app)

  const audit = async (input: CloudflareAuditInput): Promise<CloudflareAuditResult> => {
    if (!(await opts.allowedTargets(input.url))) {
      throw new UnlighthouseError({
        code: ErrorCodes.INPUT_INVALID,
        message: 'Audit target rejected by host policy.',
        details: { url: input.url },
      })
    }
    const parsedScanId = parseScanId(input.scanId)
    let scanned = 0
    let failed = 0
    for (const device of resolveDevices(input.devices)) {
      const { ok } = await auditRoute(
        { auditor: ctx.auditor, storage: ctx.storage, config: ctx.config, logger: undefined, emit: NOOP_EMIT },
        { scanId: parsedScanId, url: input.url, device },
      )
      if (ok)
        scanned++
      else
        failed++
    }
    return { scanned, failed }
  }

  const lifecycleForParams = (params: ScanWorkflowParams) => createScanLifecycle({
    storage: ctx.storage,
    config: ctx.config,
    emit: NOOP_EMIT,
    scan: {
      scanId: parseScanId(params.scanId),
      site: params.site,
      devices: params.devices,
      mode: params.mode,
      startedAt: params.startedAt,
      startedAtMs: params.startedAtMs,
    },
  })

  const lifecycleForExistingScan = async (scanId: string) => {
    const parsedScanId = parseScanId(scanId)
    const scan = await ctx.storage.scans.get(parsedScanId)
    if (!scan) {
      throw new UnlighthouseError({
        code: ErrorCodes.SCAN_NOT_FOUND,
        message: `scanId=${scanId}`,
      })
    }
    return createScanLifecycle({
      storage: ctx.storage,
      config: ctx.config,
      emit: NOOP_EMIT,
      scan: {
        scanId: parsedScanId,
        site: scan.site,
        devices: normaliseDeviceMatrix(scan.summary?.devices ?? [scan.device]),
        mode: scan.mode,
        startedAt: scan.startedAt,
        startedAtMs: Date.parse(scan.startedAt),
      },
    })
  }

  return {
    audit,
    async fetch(req: Request, runtimeEnv: CloudflareEnv, _execCtx: ExecutionContext): Promise<Response> {
      const url = new URL(req.url)

      // Health remains available to deployment probes. Every other route,
      // including the dashboard, is host-authenticated.
      const auth = url.pathname === '/health' ? { principal: 'health-probe' } : await opts.authenticate(req)
      if (!auth) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
          headers: {
            'cache-control': 'no-store',
            'content-type': 'application/json',
            'www-authenticate': 'Basic realm="Unlighthouse", Bearer realm="Unlighthouse"',
          },
        })
      }

      // The assets binding is deliberately reached only after authentication.
      // `run_worker_first` in Wrangler ensures direct asset requests cannot
      // bypass this gate.
      if (runtimeEnv.ASSETS && (req.method === 'GET' || req.method === 'HEAD') && !isApiPath(url.pathname))
        return fetchStaticAsset(runtimeEnv.ASSETS, req)

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
      let startBody: ScanStartInput | null = null
      let startBodyParseError: unknown = null
      if (apiReq.method === 'POST' && url.pathname === '/scan/start') {
        try {
          startBody = ScanStart.input.parse(await readJsonBody(apiReq.clone()))
          pendingSeed.site = startBody.site
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
        // work starts. Core stays policy-free; the host policy is required.
        const target = pendingSeed.site ?? ctx.config.site ?? null
        if (target && !(await opts.allowedTargets(target))) {
          logOperationalWarn('cloudflare.scan_target_rejected', null, { target }, logger)
          return new Response(
            JSON.stringify({ error: 'forbidden', message: 'Scan target not allowed by host policy.' }),
            { status: 403, headers: { 'cache-control': 'no-store', 'content-type': 'application/json' } },
          )
        }

        const key = auth.principal
        const stub = runtimeEnv.RATE_LIMITER_DO.getByName(key)
        const limiterBody = await stub.consume(key, 1)
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
                'cache-control': 'no-store',
                'content-type': 'application/json',
                'retry-after': String(retryAfter),
              },
            },
          )
        }

        const site = pendingSeed.site ?? ctx.config.site ?? null
        if (!site) {
          return errorResponse(new UnlighthouseError({
            code: ErrorCodes.INPUT_INVALID,
            message: 'site is required',
          }))
        }

        const startedAtMs = Date.now()
        const params: ScanWorkflowParams = {
          scanId: crypto.randomUUID(),
          site,
          devices: resolveDevices(startBody?.device),
          mode: startBody?.mode === 'page' ? 'page' : 'site',
          config: ctx.config,
          startedAt: new Date(startedAtMs).toISOString(),
          startedAtMs,
        }
        const lifecycle = lifecycleForParams(params)
        try {
          // Workflows may remain queued briefly. Create the idempotent row
          // first so status polling and immediate cancellation are reliable.
          await lifecycle.create()
          await runtimeEnv.SCAN_WORKFLOW.create({ id: params.scanId, params })
        }
        catch (err) {
          await lifecycle.fail(err)
          return errorResponse(new UnlighthouseError({
            code: ErrorCodes.INFRA_RETRYABLE,
            message: 'failed to start scan workflow',
            cause: err,
            retryable: true,
          }))
        }
        return new Response(
          JSON.stringify({
            scanId: params.scanId,
            site: params.site,
            mode: params.mode,
            startedAt: params.startedAt,
          }),
          { status: 200, headers: { 'cache-control': 'no-store', 'content-type': 'application/json' } },
        )
      }

      // Native Workflow controls own durable execution; the core lifecycle
      // mirrors pause/resume into D1 so polling reflects the change at once.
      if (
        apiReq.method === 'POST'
        && (url.pathname === '/scan/cancel' || url.pathname === '/scan/pause' || url.pathname === '/scan/resume')
      ) {
        const action = url.pathname.slice('/scan/'.length) // cancel | pause | resume
        const rawBody = await readJsonBody(apiReq.clone()).catch((err) => {
          logOperationalWarn('api.request_body_parse_failed', err, { path: url.pathname }, logger)
          return null
        })
        const parsedBody = rawBody === null
          ? null
          : action === 'cancel'
            ? ScanCancel.input.safeParse(rawBody)
            : action === 'pause'
              ? ScanPause.input.safeParse(rawBody)
              : ScanResume.input.safeParse(rawBody)
        const scanId = parsedBody?.success ? parsedBody.data.scanId : null
        if (!scanId) {
          return errorResponse(new UnlighthouseError({
            code: ErrorCodes.INPUT_INVALID,
            message: 'scanId is required.',
          }))
        }
        try {
          const [instance, lifecycle] = await Promise.all([
            runtimeEnv.SCAN_WORKFLOW.get(scanId),
            lifecycleForExistingScan(scanId),
          ])
          if (action === 'cancel') {
            await instance.terminate({ rollback: true })
            // A queued Workflow may be terminated before its first step has
            // registered the rollback. This explicit update is idempotent with
            // the Workflow rollback and keeps D1 authoritative for polling.
            await lifecycle.cancel('workflow terminated')
          }
          else if (action === 'pause') {
            await instance.pause()
            await lifecycle.pause()
          }
          else {
            await instance.resume()
            await lifecycle.resume()
          }
        }
        catch (err) {
          return errorResponse(err instanceof UnlighthouseError
            ? err
            : new UnlighthouseError({
                code: ErrorCodes.INFRA_RETRYABLE,
                message: `failed to ${action} scan workflow`,
                cause: err,
                retryable: true,
              }))
        }
        const nextStatus = action === 'cancel' ? 'cancelled' : action === 'pause' ? 'paused' : 'scanning'
        return new Response(
          JSON.stringify({ scanId, status: nextStatus }),
          { status: 200, headers: { 'cache-control': 'no-store', 'content-type': 'application/json' } },
        )
      }

      return noStoreResponse(await webHandler(apiReq))
    },
    async scheduled(): Promise<void> {
      const result = await pruneScans(ctx.storage, ctx.config.retention)
      logger.info('scheduled retention completed', result)
    },
  }
}
