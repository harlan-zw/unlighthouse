import type {
  CrawlEvent,
  CrawlSession,
  CrawlStats,
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
import type { UnlighthouseConfig } from '@unlighthouse/contracts/config'
import type { HookEvent, HookMap } from '@unlighthouse/contracts/hooks'
import type { Hookable } from 'hookable'
import type { PackRegistry } from './packs/index'
import { UnlighthouseConfigSchema } from '@unlighthouse/contracts/config'
import { UnlighthouseError } from '@unlighthouse/contracts/errors'
import { createHookEvent } from '@unlighthouse/contracts/hooks'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { normaliseDeviceMatrix, parseScanId, parseUrl } from '@unlighthouse/contracts/types/atoms'
import { createHooks } from 'hookable'
import { createTaggedLogger } from './logger'
import { createPackRegistry } from './packs/index'
import { persistStableEvents } from './persist-events'
import { auditRoute, finalizeScan, nowIso, toStructuredError } from './scan/route-audit'
import { createFilter } from './util/filter'
import { deriveSiteId, deriveSiteName, siteOrigin } from './util/site'

const log = createTaggedLogger('core')

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

function generateScanId(): ScanId {
  return parseScanId(globalThis.crypto.randomUUID())
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
  // D-029: device may be Device | DeviceMatrix. `scanner.device` carries the
  // primary device (first element of the matrix) for back-compat with
  // adapters/UI reading config.scanner.device directly. The full matrix is
  // surfaced separately to orchestrate() via `normaliseDeviceMatrix`.
  const primaryDevice = overrides.device ? normaliseDeviceMatrix(overrides.device)[0] : undefined
  if (primaryDevice || overrides.sampleSize != null || overrides.mode) {
    next.scanner = {
      ...(base.scanner ?? {}),
      ...(primaryDevice ? { device: primaryDevice } : {}),
      ...(overrides.sampleSize != null ? { samples: overrides.sampleSize } : {}),
      ...(overrides.mode ? { mode: overrides.mode } : {}),
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
      try {
        await storage.scans.update(scan.scanId, {
          status: 'error',
          completedAt: nowIso(),
        })
        reaped++
      }
      catch (err) {
        logOperationalWarn('core.stale_scan_reap_failed', err, { scanId: scan.scanId, status }, logger)
      }
    }
  }
  if (reaped > 0)
    (logger as { warn?: (msg: string) => void } | undefined)?.warn?.(`[core] reaped ${reaped} stale scan${reaped === 1 ? '' : 's'} from prior process`)
  return reaped
}

export function createUnlighthouseCore(opts: UnlighthouseCoreOptions): UnlighthouseCore {
  // 1. Validate config via Zod; throw CONFIG_INVALID on failure.
  const parsed = UnlighthouseConfigSchema.safeParse(opts.config)
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

  // Built-in packs plus any host-supplied third-party packs, resolved once.
  const packs = createPackRegistry(opts.packs)

  let currentSession: CrawlSession | null = null

  function run(runOpts?: UnlighthouseCoreRunOptions): CrawlSession {
    if (currentSession) {
      throw new UnlighthouseError({
        code: 'ACTIVE_SCAN_CONFLICT',
        message: 'A scan is already in flight on this Core instance.',
      })
    }

    const mergedConfig = mergeOverrides(config, runOpts?.overrides)
    log.debug(`core.run() — site: ${mergedConfig.site}, overrides: ${JSON.stringify(runOpts?.overrides ?? {})}`)
    const session = createSession({
      config: mergedConfig,
      storage: opts.storage,
      auditor: opts.auditor,
      seeds: opts.seeds,
      routeMatcher: opts.routeMatcher,
      crawler: opts.crawler,
      packs,
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
    }).catch((err) => {
      logOperationalWarn('core.session_cleanup_rejection', err, { scanId: session.scanId }, logger)
    })

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
  routeMatcher?: UnlighthouseCoreOptions['routeMatcher']
  crawler: UnlighthouseCoreOptions['crawler']
  hooks: Hookable<HookMap>
  logger: LoggerLike | undefined
  userSignal?: AbortSignal
  overrides?: UnlighthouseCoreRunOverrides
  packs: PackRegistry
}

function createSession(deps: SessionDeps): CrawlSession {
  const { storage, auditor, seeds, routeMatcher, crawler, hooks, userSignal, overrides } = deps

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
  // Every stable event fans out to all registered `handlers` (multicast). Both
  // WS broadcast and each `events` async-iterator consumer register here, so a
  // second consumer (a second dashboard tab, a CLI tail) sees the full stream
  // instead of stealing events from the first — the iterator is per-consumer,
  // not a single shared queue.
  const handlers = new Set<(event: HookEvent) => void>()
  // Live `events` iterators, closed when the scan ends so their `for await`
  // loops terminate.
  const iterClosers = new Set<() => void>()

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
      catch (err) {
        logOperationalWarn('core.scan_event_subscriber_failed', err, { scanId }, deps.logger)
      }
    }
  }

  function closeIter(): void {
    for (const close of [...iterClosers])
      close()
  }

  const events: AsyncIterable<HookEvent> = {
    [Symbol.asyncIterator](): AsyncIterator<HookEvent> {
      // Per-consumer buffer + waiter, fed by its own subscription. Cleaned up
      // on scan end (iterClosers) or when the consumer stops (`return()` — the
      // HTTP layer calls it on client disconnect so an abandoned tail unsubs
      // and stops holding a slot).
      const localQueue: HookEvent[] = []
      let localResolve: ((v: IteratorResult<HookEvent>) => void) | null = null
      let done = false

      const unsub = subscribe((event) => {
        if (done)
          return
        if (localResolve) {
          const r = localResolve
          localResolve = null
          r({ value: event, done: false })
        }
        else {
          localQueue.push(event)
        }
      })

      function finish(): void {
        if (done)
          return
        done = true
        unsub()
        iterClosers.delete(finish)
        if (localResolve) {
          const r = localResolve
          localResolve = null
          r({ value: undefined, done: true })
        }
      }
      iterClosers.add(finish)

      return {
        next(): Promise<IteratorResult<HookEvent>> {
          if (localQueue.length)
            return Promise.resolve({ value: localQueue.shift()!, done: false })
          if (done)
            return Promise.resolve({ value: undefined, done: true })
          return new Promise((r) => {
            localResolve = r
          })
        },
        return(): Promise<IteratorResult<HookEvent>> {
          finish()
          return Promise.resolve({ value: undefined, done: true })
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
    const wire = createHookEvent(event, payload)
    persister.push(wire)
    pushIter(wire)
    try {
      await (hooks.callHook as (e: K, p: Parameters<HookMap[K]>[0]) => unknown)(event, payload)
    }
    catch (err) {
      logOperationalWarn('core.hook_failed', err, { scanId, event: String(event) }, deps.logger)
    }
  }

  // ── done deferred ──────────────────────────────────────────────────────
  const { promise: donePromise, resolve: resolveDone, reject: rejectDone }
    = Promise.withResolvers<{ scanId: ScanId, summary: ScanSummary }>()

  // ── Orchestration ──────────────────────────────────────────────────────
  async function orchestrate(): Promise<void> {
    log.info(`Orchestrating scan ${scanId}`)
    const site = (deps.config.site ?? '') as string
    const siteUrl = parseUrl(site)
    const scannerDevice = deps.config.scanner?.device
    const validScannerDevice
      = scannerDevice === 'mobile' || scannerDevice === 'desktop' ? scannerDevice : undefined
    // D-029: resolve the per-scan device matrix once at orchestrate time.
    // `primaryDevice` keeps the scans row's `device` column meaningful for
    // back-compat (UIs that only render a single column still see a sane
    // value); the full list drives the per-URL fan-out below.
    const devices = normaliseDeviceMatrix(overrides?.device ?? validScannerDevice)
    const primaryDevice = devices[0]

    // Per-scan `mode` override (dashboard's single-page toggle) wins over the
    // host config default; falls back to config when omitted.
    const scanMode = (overrides?.mode ?? deps.config.scanner?.mode) === 'page' ? 'page' as const : 'site' as const
    // Page mode — and an explicit `urls` list, which the CLI documents as
    // disabling the crawler — audit only the seeded URLs; don't follow links.
    const noFollow = scanMode === 'page'
      || (Array.isArray((deps.config as { urls?: unknown[] }).urls) && ((deps.config as { urls?: unknown[] }).urls?.length ?? 0) > 0)

    // Associate every scan with a domain-level site (keyed by origin),
    // creating it on first scan of that origin. This is what groups all scans
    // of a domain together in history/sites — dashboard scans previously got
    // siteId=null (the old getByUrl matched the full path, never the origin),
    // while CLI scans created an origin site. Now both behave the same. Upsert
    // before scans.create — siteId is a set-null FK to the sites row.
    let siteId: string | null = null
    try {
      siteId = deriveSiteId(site)
      const existingSite = await storage.sites.get(siteId)
      if (!existingSite) {
        await storage.sites.create({
          id: siteId,
          name: deriveSiteName(site),
          url: siteOrigin(site),
          group: null,
          createdAt: new Date().toISOString(),
        }).catch((err) => {
          logOperationalWarn('scan.site_create_failed', err, { scanId, siteId, site }, deps.logger)
        })
      }
    }
    catch (err) {
      // Malformed/placeholder site URL — leave the scan unassociated.
      logOperationalWarn('scan.site_association_failed', err, { scanId, site }, deps.logger)
      siteId = null
    }

    await storage.scans.create({
      scanId,
      siteId,
      site: siteUrl,
      mode: scanMode,
      device: primaryDevice,
      status: 'starting',
      startedAt,
      completedAt: null,
      ciBranch: overrides?.ciBuild?.branch ?? null,
      ciCommit: overrides?.ciBuild?.hash ?? null,
      ciCommitMessage: overrides?.ciBuild?.message ?? null,
    })

    log.debug(`Scan ${scanId} created — site: ${site}, device: ${devices.join(',')}`)
    await emit('scan:created', { scanId, site: siteUrl, startedAt })
    await emit('scan:started', { scanId })

    setStatus('discovering')
    log.debug('Status: discovering')
    await emit('scan:discovering', { scanId })

    let firstUrlSeen = false

    // Audit one URL on one device via the shared `auditRoute` (same code the
    // Cloudflare ScanRunnerDO drives per alarm tick), then fold the result into
    // the in-memory stats the crawl loop reports.
    async function auditOnDevice(url: string, device: 'mobile' | 'desktop'): Promise<void> {
      const { ok } = await auditRoute(
        { auditor, storage, config: deps.config, logger: log, emit, routeMatcher },
        { scanId, url, device, signal },
      )
      if (ok)
        stats.scanned++
      else
        stats.failed++
    }

    // `scanner.include` / `scanner.exclude` scope the audit set. createFilter
    // returns `() => true` when neither is set, so the default scan is
    // unchanged. The predicate runs on the URL pathname (the form users write
    // include/exclude rules against, e.g. `/products/**`).
    const routeFilter = createFilter({
      include: deps.config.scanner?.include,
      exclude: deps.config.scanner?.exclude,
    })
    const allows = (url: string): boolean => {
      try {
        return routeFilter(new URL(url).pathname)
      }
      catch (_err) {
        // Non-absolute route strings fall back to direct path matching.
        return routeFilter(url)
      }
    }

    // D-029: per-URL fan-out across the device matrix. Devices run
    // sequentially per URL so we don't double up on the auditor's
    // concurrency limit (each adapter typically pins to one browser context);
    // crawler-level concurrency still parallelises URLs. A single device
    // matrix is the common case and degrades to one inner call.
    async function auditWrapper(url: string): Promise<void> {
      // Gate the audit (not just enqueue) so include/exclude also narrow
      // sitemap-seeded URLs, which bypass the crawler's link-discovery
      // `allows` hook. Non-matching URLs are still crawled for link discovery
      // — only their audit is skipped.
      if (!allows(url))
        return
      for (const dev of devices) {
        if (signal.aborted)
          return
        await auditOnDevice(url, dev)
      }
    }

    // If site was overridden (e.g. scan.start from dashboard mode), inject it
    // as the primary seed URL so the crawler starts from the right origin.
    const effectiveSeeds = overrides?.site
      ? {
          async* seeds() {
            yield { url: site, source: 'override' } as { url: string, source: string }
            yield* seeds.seeds()
          },
        }
      : seeds

    const crawlEvents = crawler.run({
      seeds: effectiveSeeds,
      audit: (url: string) => auditWrapper(url),
      // Gate discovered-link enqueue so the crawler doesn't follow into
      // excluded sections of the site (the designed `allows` hook that was
      // never wired — `scanner.include`/`exclude` were silently ignored).
      allows,
      // Page mode / explicit urls: audit only the seeds, don't follow links.
      noFollow,
      // Skip auditing localized (x-default alternate) duplicates. Defaults true.
      ignoreI18nPages: deps.config.scanner?.ignoreI18nPages ?? true,
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

    // Aggregate scores, run built-in packs, write the terminal `complete` row,
    // and emit scan:complete — all via the shared `finalizeScan` (same code the
    // Cloudflare ScanRunnerDO calls when its queue drains).
    const summary = await finalizeScan(
      { storage, config: deps.config, logger: log, emit, packs: deps.packs },
      { scanId, devices, startedAtMs, stats },
    )
    setStatus('complete')
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
        await emit('scan:error', { scanId, error: structured })
        await storage.scans
          .update(scanId, { status: 'error', completedAt: nowIso() })
          .catch((updateErr) => {
            logOperationalWarn('core.scan_error_persist_failed', updateErr, { scanId, status: 'error' }, log)
          })
        log.error(`Scan ${scanId} errored: ${structured.message || structured.code}`)
        rejectDone(err)
      }
    }
    finally {
      await persister.flush().catch((err) => {
        logOperationalWarn('core.event_persist_flush_failed', err, { scanId }, log)
      })
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
  }
}
