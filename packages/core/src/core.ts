import type {
  CrawlEvent,
  CrawlSession,
  CrawlStats,
  HookEvent,
  HookMap,
  Logger,
  ScanId,
  ScanStatus,
  ScanSummary,
  Storage,
  UnlighthouseCore,
  UnlighthouseCoreOptions,
  UnlighthouseCoreRunOptions,
  UnlighthouseCoreRunOverrides,
} from '@unlighthouse/contracts'
import type { Hookable } from 'hookable'
import {
  UnlighthouseConfig,
  UnlighthouseError,
} from '@unlighthouse/contracts'
import { createHooks } from 'hookable'
import { persistStableEvents } from './persist-events'

/** Map from CrawlEvent.type → counter side-effect on CrawlStats. */
type LoggerLike = Logger & {
  withTag?: (tag: string) => LoggerLike
  error?: (...args: unknown[]) => void
  info?: (...args: unknown[]) => void
}

function tagLogger(logger: LoggerLike | undefined, tag: string): LoggerLike | undefined {
  if (!logger)
    return undefined
  if (typeof logger.withTag === 'function')
    return logger.withTag(tag) as LoggerLike
  return logger
}

function nowIso(): string {
  return new Date().toISOString()
}

function generateScanId(): ScanId {
  // Cast through unknown: ScanId is a branded string; runtime is plain UUID.
  return globalThis.crypto.randomUUID() as unknown as ScanId
}

/**
 * Apply `UnlighthouseCoreRunOverrides` on top of the resolved config for a
 * single session. Returns a new object; never mutates the input. Unknown
 * override fields are no-ops. `categories` maps onto
 * `lighthouseOptions.onlyCategories` (Lighthouse-native shape).
 */
function mergeOverrides(
  base: UnlighthouseConfig,
  overrides?: UnlighthouseCoreRunOverrides,
): UnlighthouseConfig {
  if (!overrides)
    return base
  const next: UnlighthouseConfig = { ...base }
  if (overrides.site)
    next.site = overrides.site
  if (overrides.device || overrides.sampleSize != null) {
    next.scanner = {
      ...(base.scanner ?? {}),
      ...(overrides.device ? { device: overrides.device } : {}),
      ...(overrides.sampleSize != null ? { samples: overrides.sampleSize } : {}),
    }
  }
  if (overrides.categories && overrides.categories.length) {
    next.lighthouseOptions = {
      ...(base.lighthouseOptions ?? {}),
      onlyCategories: overrides.categories,
    }
  }
  return next
}

function toStructuredError(err: unknown): { code: string, message: string, cause?: unknown } {
  if (err instanceof UnlighthouseError)
    return { code: err.code, message: err.message, cause: err.cause }
  if (err instanceof Error)
    return { code: 'INTERNAL', message: err.message, cause: err }
  return { code: 'INTERNAL', message: String(err) }
}

/**
 * Boot-time housekeeping: mark any scan still in a non-terminal state
 * (`starting`, `discovering`, `scanning`, `paused`) as `error`. These are
 * zombies from a prior process that crashed or was killed before it could
 * write a terminal status — they have no live session to recover.
 *
 * v1.md D-019c ("no silent stalls") promises that every scan that stops
 * emits a terminal status. Without this sweep, a SIGKILL on the prior
 * CLI run leaves rows that look in-flight forever and break compare.run /
 * scan.start (`ACTIVE_SCAN_CONFLICT` is per-process so it doesn't trip,
 * but downstream consumers can't tell the difference from disk).
 *
 * Call this once during host boot, before `createUnlighthouseCore`. Safe
 * to call concurrently with new scans — only touches rows in non-terminal
 * states, never the row being written by the live session.
 */
export async function reapStaleScans(storage: Storage, logger?: Logger): Promise<number> {
  const NON_TERMINAL: ScanStatus[] = ['starting', 'discovering', 'scanning', 'paused']
  let reaped = 0
  for (const status of NON_TERMINAL) {
    const { items } = await storage.scans.list({ status, page: 1, pageSize: 1000 })
    for (const scan of items) {
      await storage.scans.update(scan.scanId, {
        status: 'error',
        completedAt: nowIso(),
      }).catch(() => {})
      reaped++
    }
  }
  if (reaped > 0)
    (logger as { warn?: (msg: string) => void } | undefined)?.warn?.(`[core] reaped ${reaped} stale scan${reaped === 1 ? '' : 's'} from prior process`)
  return reaped
}

// Compute (scoreAverage, scoresByCategory) over a set of completed routes.
// Routes with `null` for a given category are skipped — Lighthouse leaves a
// category null when it failed to run (e.g. a 5xx response on that URL).
// Returns `scoreAverage: null` only when no route produced *any* score at all.
function aggregateScores(routes: Array<{
  scorePerformance: number | null
  scoreAccessibility: number | null
  scoreSeo: number | null
  scoreBestPractices: number | null
}>): Pick<ScanSummary, 'scoreAverage' | 'scoresByCategory'> {
  const cols = {
    'performance': 'scorePerformance',
    'accessibility': 'scoreAccessibility',
    'seo': 'scoreSeo',
    'best-practices': 'scoreBestPractices',
  } as const
  const byCategory: ScanSummary['scoresByCategory'] = {}
  const overall: number[] = []
  for (const [category, key] of Object.entries(cols) as Array<[keyof typeof cols, (typeof cols)[keyof typeof cols]]>) {
    const values = routes.map(r => r[key]).filter((v): v is number => v != null)
    if (values.length === 0)
      continue
    const avg = values.reduce((a, b) => a + b, 0) / values.length
    byCategory[category] = avg
    overall.push(avg)
  }
  return {
    scoreAverage: overall.length === 0 ? null : overall.reduce((a, b) => a + b, 0) / overall.length,
    scoresByCategory: byCategory,
  }
}

export function createUnlighthouseCore(opts: UnlighthouseCoreOptions): UnlighthouseCore {
  // 1. Validate config via Zod; throw CONFIG_INVALID on failure.
  const parsed = UnlighthouseConfig.safeParse(opts.config)
  if (!parsed.success) {
    throw new UnlighthouseError({
      code: 'CONFIG_INVALID',
      message: `UnlighthouseConfig validation failed: ${parsed.error.message}`,
      cause: parsed.error,
    })
  }
  const config = parsed.data

  // 2. Hook bus + user-supplied subscribers.
  const hooks: Hookable<HookMap> = createHooks<HookMap>()
  if (opts.hooks)
    hooks.addHooks(opts.hooks)

  const logger = tagLogger(opts.logger as LoggerLike | undefined, 'core')

  let currentSession: CrawlSession | null = null

  function run(runOpts?: UnlighthouseCoreRunOptions): CrawlSession {
    if (currentSession) {
      throw new UnlighthouseError({
        code: 'ACTIVE_SCAN_CONFLICT',
        message: 'A scan is already in flight on this Core instance.',
      })
    }

    const session = createSession({
      config: mergeOverrides(config, runOpts?.overrides),
      storage: opts.storage,
      auditor: opts.auditor,
      seeds: opts.seeds,
      crawler: opts.crawler,
      hooks,
      logger,
      userSignal: runOpts?.signal,
      overrides: runOpts?.overrides,
    })

    currentSession = session
    // Catch on the chained promise so cancel/error rejections don't surface as
    // unhandled rejections when the caller only awaits `session.done` directly.
    session.done.finally(() => {
      if (currentSession === session)
        currentSession = null
    }).catch(() => {})

    return session
  }

  return {
    run,
    session: () => currentSession,
    hooks,
  }
}

interface SessionDeps {
  config: UnlighthouseConfig
  storage: Storage
  auditor: UnlighthouseCoreOptions['auditor']
  seeds: UnlighthouseCoreOptions['seeds']
  crawler: UnlighthouseCoreOptions['crawler']
  hooks: Hookable<HookMap>
  logger: LoggerLike | undefined
  userSignal?: AbortSignal
  overrides?: UnlighthouseCoreRunOverrides
}

function createSession(deps: SessionDeps): CrawlSession {
  const { storage, auditor, seeds, crawler, hooks, logger, userSignal, overrides } = deps

  const scanId = generateScanId()
  const startedAt = nowIso()
  const startedAtMs = Date.now()

  // AbortController + fan-in with user signal.
  const internal = new AbortController()
  const signal: AbortSignal = userSignal
    ? AbortSignal.any([userSignal, internal.signal])
    : internal.signal

  // ── HookEvent fan-out ──────────────────────────────────────────────────
  //
  // Internal queue + iterator that resolves either a buffered event or the
  // next emit. Keeping a single queue means hook subscribers and iter
  // consumers stay in sync: every stable event is pushed exactly once.
  const queue: HookEvent[] = []
  let resolveNext: ((v: IteratorResult<HookEvent>) => void) | null = null
  let iterDone = false
  const handlers = new Set<(event: HookEvent) => void>()

  // In-memory ring buffer (cap 10k) for `events.subscribe.replay`.
  const RING_CAP = 10_000
  const ringBuffer: HookEvent[] = []

  function pushIter(event: HookEvent): void {
    // Buffer first so replay reflects every emitted event, then fan out.
    ringBuffer.push(event)
    if (ringBuffer.length > RING_CAP)
      ringBuffer.shift()
    for (const h of handlers) {
      try {
        h(event)
      }
      catch {
        // subscriber errors must not break orchestration
      }
    }
    if (iterDone)
      return
    if (resolveNext) {
      const r = resolveNext
      resolveNext = null
      r({ value: event, done: false })
    }
    else {
      queue.push(event)
    }
  }

  function closeIter(): void {
    iterDone = true
    if (resolveNext) {
      const r = resolveNext
      resolveNext = null
      r({ value: undefined as unknown as HookEvent, done: true })
    }
  }

  const events: AsyncIterable<HookEvent> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<HookEvent>> {
          if (queue.length)
            return Promise.resolve({ value: queue.shift()!, done: false })
          if (iterDone)
            return Promise.resolve({ value: undefined as unknown as HookEvent, done: true })
          return new Promise((r) => {
            resolveNext = r
          })
        },
      }
    },
  }

  function subscribe(handler: (event: HookEvent) => void): () => void {
    handlers.add(handler)
    return () => handlers.delete(handler)
  }

  function replay(n: number): HookEvent[] {
    if (n <= 0)
      return []
    const take = Math.min(n, ringBuffer.length)
    return ringBuffer.slice(ringBuffer.length - take)
  }

  // ── Stats / state ──────────────────────────────────────────────────────
  const stats: CrawlStats = { discovered: 0, scanned: 0, failed: 0, total: 0 }
  let status: ScanStatus = 'starting'
  const discoveredUrls = new Set<string>()

  function setStatus(next: ScanStatus): void {
    status = next
  }

  // ── Event persistence (events.jsonl.gz on terminal) ────────────────────
  const persister = persistStableEvents(storage, scanId)

  /** Emit on the hook bus AND push into the iter queue AND buffer for persistence. */
  async function emit<K extends keyof HookMap>(
    event: K,
    payload: Parameters<HookMap[K]>[0],
  ): Promise<void> {
    const wire = { event, payload } as unknown as HookEvent
    persister.push(wire)
    pushIter(wire)
    try {
      await (hooks.callHook as (e: K, p: Parameters<HookMap[K]>[0]) => unknown)(event, payload)
    }
    catch {}
  }

  // ── done deferred ──────────────────────────────────────────────────────
  const { promise: donePromise, resolve: resolveDone, reject: rejectDone }
    = Promise.withResolvers<{ scanId: ScanId, summary: ScanSummary }>()

  // ── Orchestration ──────────────────────────────────────────────────────
  async function orchestrate(): Promise<void> {
    const site = (deps.config.site ?? '') as string
    const scannerDevice = deps.config.scanner?.device
    const device: 'mobile' | 'desktop'
      = scannerDevice === 'mobile' || scannerDevice === 'desktop' ? scannerDevice : 'mobile'

    await storage.scans.create({
      scanId,
      site: site as never,
      device,
      status: 'starting',
      startedAt,
      completedAt: null,
      ciBranch: overrides?.ciBuild?.branch ?? null,
      ciCommit: overrides?.ciBuild?.hash ?? null,
      ciCommitMessage: overrides?.ciBuild?.message ?? null,
    })

    await emit('scan:created', { scanId, site: site as never, startedAt })
    await emit('scan:started', { scanId })

    setStatus('discovering')
    await emit('scan:discovering', { scanId })

    let firstUrlSeen = false

    async function auditWrapper(url: string): Promise<void> {
      const auditStart = Date.now()
      await emit('audit:before', { scanId, url: url as never, auditor: 'auditor' })
      try {
        const report = await auditor.audit(url, undefined, { signal })
        // Auditor returns LH report + attached `extracted` (CWV/scores/etc.)
        // + `lhrGzip` (raw LHR in LHCI-format, gzipped). Route the extracted
        // metrics to the row store; the LHR blob to the blob store under the
        // contract-derived `lhrBlobKey`.
        const extracted = (report as unknown as { extracted?: unknown }).extracted
        const lhrGzip = (report as unknown as { lhrGzip?: Uint8Array }).lhrGzip
        const metrics = (extracted ?? {
          url,
          path: new URL(url).pathname,
          routeName: null,
          scorePerformance: null,
          scoreAccessibility: null,
          scoreSeo: null,
          scoreBestPractices: null,
          lcp: null,
          cls: null,
          inp: null,
          fcp: null,
          ttfb: null,
          tbt: null,
          si: null,
          lighthouseVersion: (report as { lighthouseVersion?: string }).lighthouseVersion ?? 'unknown',
          capturedAt: nowIso(),
        }) as never

        await storage.routes.putBatch(scanId, [metrics])

        if (lhrGzip) {
          // Mirror `routes.ts:blobKeyFor` derivation so the blob lines up
          // with the `lhrBlobKey` + `reportBlobKey` columns the row got.
          const hash = (await import('node:crypto')).createHash('sha1').update(url).digest('hex').slice(0, 16)
          const lhrKey = `scans/${scanId}/lhr/${hash}.json.gz`
          const reportKey = `scans/${scanId}/reports/${hash}.json`
          await storage.blobs.put(lhrKey, lhrGzip).catch(() => {})

          // Reconciled per-route report — UI-shaped, decoupled from LHR shape.
          // Uses the auditor's reconciled output if present (faster);
          // otherwise gunzips + reconciles here as a fallback.
          const reconciled = (report as unknown as { reconciled?: unknown }).reconciled
          let payload: unknown = reconciled
          if (!payload) {
            try {
              const { reconcileRoute } = await import('./report/extract')
              const { gunzipSync } = await import('node:zlib')
              const lhr = JSON.parse(gunzipSync(lhrGzip).toString())
              payload = reconcileRoute({
                url,
                path: (metrics as { path?: string }).path ?? new URL(url).pathname,
                routeName: (metrics as { routeName?: string | null }).routeName ?? null,
                reportBlobKey: reportKey,
                lhr,
              })
            }
            catch { /* best-effort; UI falls back to LHR blob */ }
          }
          if (payload) {
            const bytes = new TextEncoder().encode(JSON.stringify(payload))
            await storage.blobs.put(reportKey, bytes).catch(() => {})
          }
        }

        stats.scanned++
        await emit('scan:route-complete', { scanId, url: url as never, metrics })
        await emit('audit:after', {
          scanId,
          url: url as never,
          auditor: 'auditor',
          durationMs: Date.now() - auditStart,
          ok: true,
        })
      }
      catch (err) {
        stats.failed++
        const structured = toStructuredError(err)
        logger?.error?.('[unlighthouse] route audit failed', { url, error: structured })
        await emit('scan:route-failed', { scanId, url: url as never, error: structured as never })
        await emit('audit:after', {
          scanId,
          url: url as never,
          auditor: 'auditor',
          durationMs: Date.now() - auditStart,
          ok: false,
        })
      }
    }

    const crawlEvents = crawler.run({
      seeds,
      audit: (url: string) => auditWrapper(url),
      signal,
    })

    for await (const e of crawlEvents as AsyncIterable<CrawlEvent>) {
      if (signal.aborted)
        break
      switch (e.type) {
        case 'url-discovered': {
          if (!discoveredUrls.has(e.url)) {
            discoveredUrls.add(e.url)
            stats.discovered++
            stats.total = stats.discovered
            if (!firstUrlSeen) {
              firstUrlSeen = true
              setStatus('scanning')
              await emit('scan:scanning', { scanId, discovered: stats.discovered })
            }
            else {
              await emit('scan:progress', {
                scanId,
                discovered: stats.discovered,
                scanned: stats.scanned,
                failed: stats.failed,
                total: stats.total,
              })
            }
          }
          break
        }
        case 'url-started':
        case 'url-completed':
        case 'url-failed':
        case 'idle':
          // url-completed/failed: handled by auditWrapper. url-started/idle: no stable bridge.
          break
      }
    }

    if (signal.aborted) {
      setStatus('cancelled')
      const reason = internal.signal.aborted
        ? (internal.signal.reason as string | undefined)
        : 'aborted'
      await emit('scan:cancelled', { scanId, reason: typeof reason === 'string' ? reason : undefined })
      await storage.scans.update(scanId, { status: 'cancelled', completedAt: nowIso() })
      throw new UnlighthouseError({ code: 'SCAN_CANCELLED', message: 'Scan cancelled.' })
    }

    // Aggregate scores across completed routes. Contract says scoreAverage is
    // `null` until at least one route has scored — for a non-empty scan it
    // should always be populated. `compare.run` and the dashboard summary
    // tile both read these; leaving them null was a v0→v1 regression where
    // the aggregation logic got lost mid-port.
    const scoredRoutes = stats.scanned > 0
      ? (await storage.routes.listForScan(scanId, { page: 1, pageSize: 10_000 })).items
      : []
    const summary: ScanSummary = {
      routes: stats.discovered,
      completed: stats.scanned,
      failed: stats.failed,
      ...aggregateScores(scoredRoutes),
      durationMs: Date.now() - startedAtMs,
    }

    setStatus('complete')
    await storage.scans.update(scanId, {
      status: 'complete',
      completedAt: nowIso(),
      summary,
    })
    await emit('scan:complete', { scanId, summary })
    resolveDone({ scanId, summary })
  }

  // Kick off orchestration; settle with terminal persistence + iter close.
  ;(async () => {
    try {
      await orchestrate()
    }
    catch (err) {
      const structured = toStructuredError(err)
      if (structured.code === 'SCAN_CANCELLED') {
        // already emitted cancelled; resolve done with stub summary so callers
        // awaiting can branch on state() instead of catching here. But D-017
        // contract has done resolving on complete only — reject for cancel/err.
        rejectDone(err)
      }
      else {
        setStatus('error')
        await emit('scan:error', { scanId, error: structured as never })
        await storage.scans
          .update(scanId, { status: 'error', completedAt: nowIso() })
          .catch(() => {})
        logger?.error?.('[unlighthouse] scan errored', structured)
        rejectDone(err)
      }
    }
    finally {
      await persister.flush().catch(() => {})
      closeIter()
    }
  })()

  const capabilities = { pausable: typeof crawler.pause === 'function' && typeof crawler.resume === 'function' }

  async function pause(): Promise<void> {
    if (!crawler.pause) {
      throw new UnlighthouseError({
        code: 'NOT_SUPPORTED',
        message: 'The active crawler does not support pause/resume.',
      })
    }
    await crawler.pause()
    setStatus('paused')
    await emit('scan:paused', { scanId })
  }

  async function resume(): Promise<void> {
    if (!crawler.resume) {
      throw new UnlighthouseError({
        code: 'NOT_SUPPORTED',
        message: 'The active crawler does not support pause/resume.',
      })
    }
    await crawler.resume()
    setStatus('scanning')
    await emit('scan:resumed', { scanId })
  }

  async function cancel(reason?: string): Promise<void> {
    internal.abort(reason)
  }

  // The placeholder `HookEvent` shape on `ports/core` (TODO: tighten) differs
  // structurally from the real `HookEvent` union in `contracts/hooks`. Cast
  // through unknown at the boundary; once ports/core consumes the real type
  // (separate agent owns that file), this cast disappears.
  return {
    scanId,
    events,
    subscribe,
    replay,
    capabilities,
    pause,
    resume,
    cancel,
    state: () => status,
    stats: () => ({ ...stats }),
    done: donePromise,
  } as unknown as CrawlSession
}
