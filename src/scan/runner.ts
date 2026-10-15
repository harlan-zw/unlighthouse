import { availableParallelism } from 'node:os'
import { captureLogin, staticAuth } from '../audit/auth.ts'
import { flowJobFor, runFlow as defaultRunFlow } from '../audit/flow.ts'
import type { AuditPoolOptions } from '../audit/pool.ts'
import { checkAuditSetup, createAuditPool } from '../audit/pool.ts'
import type { RendererOptions } from '../audit/render.ts'
import { createRenderer } from '../audit/render.ts'
import type { Config, ConfigInput } from '../config.ts'
import { defaultConcurrency, mergeConfig, parseConfig } from '../config.ts'
import type { AuditJob, AuditPool, AuthState, Discover, DiscoveredPage, Renderer, RunFlow, Store } from '../contracts.ts'
import { discover as defaultDiscover } from '../discover/crawl.ts'
import type { CruxOptions } from '../field/crux.ts'
import { collectField } from '../field/crux.ts'
import { sampleByTemplate } from '../discover/templates.ts'
import { UnlighthouseError } from '../errors.ts'
import type { EventBus } from '../events.ts'
import type { Device, Page, PageStatus, Scan, ScanStats, ScanStatus } from '../types.ts'
import type { ProcessLock } from './lock.ts'
import { createProcessLock } from './lock.ts'

export type ScanInput = ConfigInput & { label?: string, branch?: string, commit?: string }

export interface ScannerOptions {
  store: Store
  bus: EventBus
  config?: ConfigInput
  createPool?: (options: AuditPoolOptions) => AuditPool
  discover?: Discover
  runFlow?: RunFlow
  createRenderer?: (options: RendererOptions) => Renderer
  captureLogin?: (config: Config, signal?: AbortSignal) => Promise<AuthState>
  preflight?: (config: Config) => void
  cpus?: number
  lockPath?: string
  lockRetryMs?: number
  cancelPollMs?: number
  env?: Record<string, string | undefined>
  crux?: Partial<Pick<CruxOptions, 'baseUrl' | 'fetch' | 'backoffMs' | 'maxRetries'>>
}

export interface Scanner {
  start(input: ScanInput): Scan
  cancel(scanId: string): Promise<Scan>
  rescanPage(scanId: string, url: string, device: Device): Page
  wait(scanId: string, timeoutMs: number, signal?: AbortSignal): Promise<Scan>
  recover(): string[]
  active(): string | null
  idle(): Promise<void>
  close(): Promise<void>
}

type Job =
  | { kind: 'scan', scanId: string, config: Config, resume: boolean }
  | { kind: 'rescan', scanId: string, config: Config, url: string, device: Device, previous: PageStatus }

interface Running {
  job: Job
  controller: AbortController
  finished: Promise<void>
}

const TERMINAL: ScanStatus[] = ['done', 'failed', 'cancelled']
const INTERRUPTED = 'Interrupted: the Unlighthouse process running this scan stopped before it finished'
const INTERRUPTED_RESCAN = 'Interrupted: the Unlighthouse process stopped while re-auditing this page'
const PROGRESS_INTERVAL_MS = 250

export function isFinished(scan: Pick<Scan, 'status'>): boolean {
  return TERMINAL.includes(scan.status)
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function cancelledError(): Error {
  return new DOMException('The scan was cancelled', 'AbortError')
}

function bounded<T>(promise: Promise<T>, signal: AbortSignal, timeoutMs: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(cancelledError())
      return
    }
    const timer = setTimeout(() => reject(new UnlighthouseError('AUDIT_FAILED', `${what} did not finish within ${timeoutMs} ms`)), timeoutMs)
    const onAbort = () => reject(cancelledError())
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
    })
  })
}

export function countStats(pages: Page[]): ScanStats {
  const stats: ScanStats = { discovered: new Set(pages.map(page => page.url)).size, queued: 0, done: 0, failed: 0, skipped: 0 }
  for (const page of pages) {
    if (page.status === 'queued' || page.status === 'running')
      stats.queued++
    else
      stats[page.status]++
  }
  return stats
}

export function createScanner(options: ScannerOptions): Scanner {
  const { store, bus } = options
  const createPool = options.createPool ?? createAuditPool
  const discover = options.discover ?? defaultDiscover
  const runFlow = options.runFlow ?? defaultRunFlow
  const makeRenderer = options.createRenderer ?? createRenderer
  const login = options.captureLogin ?? ((config: Config, signal?: AbortSignal) => captureLogin(config, undefined, signal))
  const preflight = options.preflight ?? (options.createPool ? null : (config: Config) => void checkAuditSetup(config))
  const cpus = options.cpus ?? availableParallelism()
  const lock: ProcessLock | null = options.lockPath ? createProcessLock(options.lockPath) : null
  const lockRetryMs = options.lockRetryMs ?? 1000
  const cancelPollMs = options.cancelPollMs ?? 2000

  const queue: Job[] = []
  let running: Running | null = null
  let closed = false
  let lockTimer: ReturnType<typeof setTimeout> | null = null
  let lockWarned = false
  let idleWaiters: Array<() => void> = []

  function scanOrThrow(scanId: string): Scan {
    const scan = store.getScan(scanId)
    if (!scan)
      throw new UnlighthouseError('NOT_FOUND', `Scan not found: ${scanId}`)
    return scan
  }

  function setStatus(scanId: string, status: ScanStatus, patch: Parameters<Store['updateScan']>[1] = {}, error?: string): void {
    store.updateScan(scanId, { ...patch, status, ...(error === undefined ? {} : { error }) })
    bus.emit({ type: 'scan:status', scanId, status, ...(error === undefined ? {} : { error }) })
  }

  function emitProgress(scanId: string, stats: ScanStats): void {
    bus.emit({ type: 'scan:progress', scanId, ...stats })
  }

  function settleIdle(): void {
    if (running || queue.length)
      return
    lock?.release()
    const waiters = idleWaiters
    idleWaiters = []
    for (const resolve of waiters)
      resolve()
  }

  function pump(): void {
    if (running || closed || !queue.length) {
      settleIdle()
      return
    }
    if (lock && !lock.acquire()) {
      if (!lockWarned) {
        lockWarned = true
        bus.emit({ type: 'log', scanId: queue[0]!.scanId, level: 'info', message: `Waiting for another Unlighthouse process (pid ${lock.owner()}) to finish its scan; one scan runs at a time so performance numbers stay comparable.` })
      }
      lockTimer ??= setTimeout(() => {
        lockTimer = null
        pump()
      }, lockRetryMs)
      return
    }
    lockWarned = false
    const job = queue.shift()!
    const controller = new AbortController()
    const current: Running = {
      job,
      controller,
      finished: Promise.resolve()
        .then(() => job.kind === 'scan' ? runScan(job, controller) : runRescan(job, controller.signal))
        .catch(error => bus.emit({ type: 'log', scanId: job.scanId, level: 'error', message: message(error) }))
        .finally(() => {
          running = null
          pump()
        }),
    }
    running = current
  }

  function jobFor(config: Config, page: Pick<Page, 'url' | 'device'>, auth: AuthState, concurrency: number): AuditJob {
    return {
      url: page.url,
      device: page.device,
      categories: config.categories,
      throttling: config.throttling,
      samples: config.samples,
      timeoutMs: config.timeoutMs,
      concurrency,
      chromeFlags: config.chromeFlags,
      auth,
      lighthouse: config.lighthouse,
      runner: config.runner,
      ...(config.userAgent ? { userAgent: config.userAgent } : {}),
      ...(config.chromePath ? { chromePath: config.chromePath } : {}),
    }
  }

  async function discoverPages(scan: Scan, config: Config, signal: AbortSignal): Promise<ScanStats> {
    setStatus(scan.id, 'discovering', { startedAt: Date.now() })
    let found = 0
    let lastEmit = 0
    const renderer = config.discover.render
      ? makeRenderer({
          chromeFlags: config.chromeFlags,
          auth: staticAuth(config),
          ...(config.chromePath ? { chromePath: config.chromePath } : {}),
          ...(config.userAgent ? { userAgent: config.userAgent } : {}),
        })
      : null
    let result
    try {
      result = await discover({ ...config, site: config.site! }, {
        signal,
        ...(renderer ? { fetchPage: renderer.fetchPage } : {}),
        onFound: () => {
          found++
          const now = Date.now()
          if (now - lastEmit >= PROGRESS_INTERVAL_MS) {
            lastEmit = now
            emitProgress(scan.id, { discovered: found, queued: 0, done: 0, failed: 0, skipped: 0 })
          }
        },
      })
    }
    finally {
      await renderer?.close()
    }
    signal.throwIfAborted()
    const listed = result.pages.filter(page => page.skipReason === null)
    if (!listed.length) {
      const reason = result.blockedByRobots ? `; ${result.blockedByRobots} URL(s) were blocked by robots.txt` : ''
      throw new UnlighthouseError('AUDIT_FAILED', `No pages found at ${config.site}${reason}. Check that the site responds with HTML, or list pages explicitly with urls.`)
    }
    for (const page of result.pages)
      bus.emit({ type: 'page:discovered', scanId: scan.id, url: page.url, template: page.template })

    const { picked, skipped } = sampleByTemplate(listed, config.sampling.perTemplate, config.sampling.maxAudits)
    const other = result.pages.filter(page => page.skipReason !== null)
    const row = (page: DiscoveredPage) => ({ url: page.url, path: page.path, template: page.template })
    store.insertPages(scan.id, scan.devices.flatMap(device => [
      ...picked.map(page => ({ ...row(page), device, status: 'queued' as const })),
      ...skipped.map(page => ({ ...row(page), device, status: 'skipped' as const })),
      ...other.map(page => ({ ...row(page), device, status: 'skipped' as const, reason: page.skipReason! })),
    ]))
    const stats = countStats(store.allPages(scan.id))
    store.updateScan(scan.id, { stats, brokenLinks: result.broken, hreflangProblems: result.hreflangProblems })
    if (result.broken.length)
      bus.emit({ type: 'log', scanId: scan.id, level: 'warn', message: `${result.broken.length} broken link(s) found during discovery` })
    if (result.hreflangProblems.length)
      bus.emit({ type: 'log', scanId: scan.id, level: 'warn', message: `${result.hreflangProblems.length} hreflang problem(s) found during discovery` })
    return stats
  }

  async function auditPages(scanId: string, config: Config, auth: AuthState, stats: ScanStats, signal: AbortSignal): Promise<void> {
    const pending = store.allPages(scanId).filter(page => page.status === 'queued')
    const pool = createPool({ concurrency: config.concurrency ?? defaultConcurrency(cpus, config.throttling), retries: config.retries })
    let fatal: unknown = null
    let lighthouseVersion: string | null = store.getScan(scanId)?.lighthouseVersion ?? null
    let next = 0
    const worker = async () => {
      while (!signal.aborted && fatal === null) {
        const page = pending[next++]
        if (!page)
          return
        store.setPageStatus(scanId, page.url, page.device, 'running')
        bus.emit({ type: 'page:status', scanId, url: page.url, device: page.device, status: 'running' })
        try {
          const result = await pool.run(jobFor(config, page, auth, pool.size), signal)
          store.savePageResult(scanId, page.url, page.device, result)
          stats.done++
          if (!lighthouseVersion) {
            lighthouseVersion = result.provenance.lighthouseVersion
            store.updateScan(scanId, { lighthouseVersion })
          }
          bus.emit({ type: 'page:status', scanId, url: page.url, device: page.device, status: 'done', score: result.scores.performance })
        }
        catch (error) {
          if (signal.aborted)
            return
          if (error instanceof UnlighthouseError && (error.code === 'CHROME_NOT_FOUND' || error.code === 'INVALID_CONFIG')) {
            fatal = error
            return
          }
          store.setPageStatus(scanId, page.url, page.device, 'failed', message(error))
          stats.failed++
          bus.emit({ type: 'page:status', scanId, url: page.url, device: page.device, status: 'failed', error: message(error) })
        }
        stats.queued--
        store.updateScan(scanId, { stats })
        emitProgress(scanId, stats)
      }
    }
    try {
      await Promise.all(Array.from({ length: pool.size }, worker))
    }
    finally {
      await pool.close()
    }
    if (fatal)
      throw fatal
  }

  async function collectFieldData(scanId: string, config: Config, signal: AbortSignal): Promise<void> {
    if (!config.crux.enabled)
      return
    const apiKey = (options.env ?? process.env)[config.crux.apiKeyEnv]
    if (!apiKey) {
      bus.emit({ type: 'log', scanId, level: 'warn', message: `crux.enabled is set but ${config.crux.apiKeyEnv} is empty; field data was skipped` })
      return
    }
    const scan = store.getScan(scanId)
    if (!scan)
      return
    try {
      const pages = store.allPages(scanId).filter(page => page.status === 'done').map(page => ({ url: page.url, device: page.device }))
      const field = await collectField({ origin: scan.origin, devices: scan.devices, pages, history: config.crux.history }, {
        ...options.crux,
        apiKey,
        store,
        signal,
        onWarn: message => bus.emit({ type: 'log', scanId, level: 'warn', message }),
      })
      store.saveField(scanId, field)
      const withUrl = field.pages.filter(page => page.source === 'url').length
      bus.emit({ type: 'log', scanId, level: 'info', message: `Field data (CrUX): ${withUrl} of ${field.pages.length} page audit(s) have URL-level data` })
    }
    catch (error) {
      if (signal.aborted)
        throw error
      bus.emit({ type: 'log', scanId, level: 'warn', message: `Field data (CrUX) was skipped: ${message(error)}` })
    }
  }

  async function runFlows(scanId: string, config: Config, auth: AuthState, signal: AbortSignal): Promise<void> {
    for (const flow of config.flows) {
      for (const device of flow.devices ?? config.devices) {
        signal.throwIfAborted()
        const started = Date.now()
        let startUrl = flow.url ?? config.site ?? ''
        try {
          const job = flowJobFor(config, flow, device, auth)
          startUrl = job.url
          bus.emit({ type: 'log', scanId, level: 'info', message: `Running flow ${flow.name} (${device})` })
          const result = await runFlow(job, signal)
          store.saveFlowResult(scanId, result)
          bus.emit({ type: 'log', scanId, level: 'info', message: `Flow ${flow.name} (${device}) finished with ${result.steps.length} step(s)` })
        }
        catch (error) {
          const noChrome = error instanceof UnlighthouseError && error.code === 'CHROME_NOT_FOUND'
          if (signal.aborted || (noChrome && config.runner.type === 'local'))
            throw error
          const reason = noChrome ? `User flows run in local Chrome even with the ${config.runner.type} runner: ${message(error)}` : message(error)
          store.saveFlowFailure(scanId, { name: flow.name, device, startUrl, error: reason, durationMs: Date.now() - started })
          bus.emit({ type: 'log', scanId, level: 'warn', message: `Flow ${flow.name} (${device}) failed: ${reason}` })
        }
      }
    }
  }

  function finishCancelled(scanId: string): void {
    for (const page of store.allPages(scanId)) {
      if (page.status === 'queued' || page.status === 'running')
        store.setPageStatus(scanId, page.url, page.device, 'skipped', 'Scan cancelled')
    }
    const stats = countStats(store.allPages(scanId))
    store.updateScan(scanId, { stats })
    emitProgress(scanId, stats)
    setStatus(scanId, 'cancelled', { finishedAt: Date.now() })
  }

  async function runScan(job: Extract<Job, { kind: 'scan' }>, controller: AbortController): Promise<void> {
    const { scanId, config } = job
    const signal = controller.signal
    const scan = store.getScan(scanId)
    if (!scan || scan.status !== (job.resume ? 'auditing' : 'queued'))
      return
    const poll = setInterval(() => {
      const current = store.getScan(scanId)
      if (!current || current.status === 'cancelled')
        controller.abort()
    }, cancelPollMs)
    try {
      preflight?.(config)
      let stats: ScanStats
      if (job.resume) {
        for (const page of store.allPages(scanId)) {
          if (page.status === 'running')
            store.setPageStatus(scanId, page.url, page.device, 'queued')
        }
        stats = countStats(store.allPages(scanId))
        bus.emit({ type: 'log', scanId, level: 'info', message: `Resuming the scan with ${stats.queued} page audit(s) left` })
      }
      else {
        stats = await discoverPages(scan, config, signal)
      }
      const auth = await bounded(login(config, AbortSignal.any([signal, AbortSignal.timeout(config.timeoutMs)])), signal, config.timeoutMs, 'The login script')
      if (!job.resume)
        setStatus(scanId, 'auditing')
      emitProgress(scanId, stats)
      await auditPages(scanId, config, auth, stats, signal)
      signal.throwIfAborted()
      await collectFieldData(scanId, config, signal)
      signal.throwIfAborted()
      await runFlows(scanId, config, auth, signal)
      stats = countStats(store.allPages(scanId))
      store.updateScan(scanId, { stats })
      emitProgress(scanId, stats)
      if (stats.done === 0 && stats.failed > 0) {
        const first = store.allPages(scanId).find(page => page.status === 'failed')
        setStatus(scanId, 'failed', { finishedAt: Date.now() }, `All ${stats.failed} audit(s) failed. First error: ${first?.error ?? 'unknown'}`)
      }
      else {
        setStatus(scanId, 'done', { finishedAt: Date.now() })
      }
    }
    catch (error) {
      if (signal.aborted) {
        finishCancelled(scanId)
        return
      }
      for (const page of store.allPages(scanId)) {
        if (page.status === 'queued' || page.status === 'running')
          store.setPageStatus(scanId, page.url, page.device, 'skipped', 'Scan failed before this page was audited')
      }
      const stats = countStats(store.allPages(scanId))
      store.updateScan(scanId, { stats })
      setStatus(scanId, 'failed', { finishedAt: Date.now() }, message(error))
    }
    finally {
      clearInterval(poll)
    }
  }

  async function runRescan(job: Extract<Job, { kind: 'rescan' }>, signal: AbortSignal): Promise<void> {
    const { scanId, url, device, config } = job
    if (!store.getPage(scanId, url, device))
      return
    store.setPageStatus(scanId, url, device, 'running')
    bus.emit({ type: 'page:status', scanId, url, device, status: 'running' })
    const pool = createPool({ concurrency: 1, retries: config.retries })
    try {
      preflight?.(config)
      const auth = await bounded(login(config, AbortSignal.any([signal, AbortSignal.timeout(config.timeoutMs)])), signal, config.timeoutMs, 'The login script')
      const result = await pool.run(jobFor(config, { url, device }, auth, 1), signal)
      store.savePageResult(scanId, url, device, result)
      bus.emit({ type: 'page:status', scanId, url, device, status: 'done', score: result.scores.performance })
    }
    catch (error) {
      if (signal.aborted) {
        store.setPageStatus(scanId, url, device, job.previous)
        bus.emit({ type: 'page:status', scanId, url, device, status: job.previous })
      }
      else {
        store.setPageStatus(scanId, url, device, 'failed', message(error))
        bus.emit({ type: 'page:status', scanId, url, device, status: 'failed', error: message(error) })
      }
    }
    finally {
      await pool.close()
      const stats = countStats(store.allPages(scanId))
      store.updateScan(scanId, { stats })
      emitProgress(scanId, stats)
    }
  }

  function resolveConfig(input: ConfigInput): Config {
    return parseConfig(mergeConfig(mergeConfig({}, options.config ?? {}), input as Record<string, unknown>))
  }

  function storedConfig(scan: Scan): Config {
    return parseConfig(scan.options)
  }

  function start(input: ScanInput): Scan {
    if (closed)
      throw new UnlighthouseError('SCAN_NOT_RUNNING', 'The scanner is shutting down')
    const { label, branch, commit, ...overrides } = input
    const config = resolveConfig(overrides)
    if (!config.site)
      throw new UnlighthouseError('INVALID_CONFIG', 'site is required: pass the URL to scan')
    const scan = store.createScan({
      origin: new URL(config.site).origin,
      devices: config.devices,
      options: config,
      ...(label ? { label } : {}),
      ...(branch ? { branch } : {}),
      ...(commit ? { commit } : {}),
    })
    bus.emit({ type: 'scan:status', scanId: scan.id, status: 'queued' })
    queue.push({ kind: 'scan', scanId: scan.id, config, resume: false })
    pump()
    return store.getScan(scan.id) ?? scan
  }

  async function cancel(scanId: string): Promise<Scan> {
    const scan = scanOrThrow(scanId)
    let touched = false
    for (let i = queue.length - 1; i >= 0; i--) {
      const job = queue[i]!
      if (job.scanId !== scanId)
        continue
      queue.splice(i, 1)
      touched = true
      if (job.kind === 'rescan') {
        store.setPageStatus(scanId, job.url, job.device, job.previous)
        bus.emit({ type: 'page:status', scanId, url: job.url, device: job.device, status: job.previous })
      }
      else {
        setStatus(scanId, 'cancelled', { finishedAt: Date.now() })
      }
    }
    const current = running
    if (current && current.job.scanId === scanId) {
      current.controller.abort()
      await current.finished
      touched = true
    }
    if (!touched) {
      if (isFinished(scan))
        throw new UnlighthouseError('SCAN_NOT_RUNNING', `Scan ${scanId} is already ${scan.status}`)
      setStatus(scanId, 'cancelled', { finishedAt: Date.now() })
    }
    settleIdle()
    return scanOrThrow(scanId)
  }

  function rescanPage(scanId: string, url: string, device: Device): Page {
    const scan = scanOrThrow(scanId)
    if (!isFinished(scan))
      throw new UnlighthouseError('SCAN_ACTIVE', `Scan ${scanId} is still ${scan.status}; rescan pages after it finishes`)
    const page = store.getPage(scanId, url, device)
    if (!page)
      throw new UnlighthouseError('NOT_FOUND', `Page not found: ${url} (${device}) in scan ${scanId}`)
    if (page.status === 'queued' || page.status === 'running')
      throw new UnlighthouseError('SCAN_ACTIVE', `${url} (${device}) is already ${page.status}`)
    const config = storedConfig(scan)
    const previous = store.queueRescan(scanId, url, device)
    bus.emit({ type: 'page:status', scanId, url, device, status: 'queued' })
    queue.push({ kind: 'rescan', scanId, config, url, device, previous })
    pump()
    return store.getPage(scanId, url, device)!
  }

  async function wait(scanId: string, timeoutMs: number, signal?: AbortSignal): Promise<Scan> {
    const deadline = Date.now() + Math.max(0, timeoutMs)
    for (;;) {
      const scan = scanOrThrow(scanId)
      const remaining = deadline - Date.now()
      if (isFinished(scan) || remaining <= 0 || signal?.aborted)
        return scan
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer)
          off()
          signal?.removeEventListener('abort', done)
          resolve()
        }
        const timer = setTimeout(done, Math.min(1000, remaining))
        const off = bus.on((event) => {
          if (event.type === 'scan:status' && event.scanId === scanId)
            done()
        })
        signal?.addEventListener('abort', done, { once: true })
      })
    }
  }

  function recoverRescans(): void {
    const pending = new Set([...queue, ...(running ? [running.job] : [])]
      .flatMap(job => job.kind === 'rescan' ? [`${job.scanId}\u0000${job.device}\u0000${job.url}`] : []))
    const touched = new Set<string>()
    for (const page of store.interruptedRescans()) {
      if (pending.has(`${page.scanId}\u0000${page.device}\u0000${page.url}`))
        continue
      const status = page.previous ?? 'failed'
      store.setPageStatus(page.scanId, page.url, page.device, status, page.previous ? undefined : INTERRUPTED_RESCAN)
      bus.emit({ type: 'page:status', scanId: page.scanId, url: page.url, device: page.device, status })
      touched.add(page.scanId)
    }
    for (const scanId of touched) {
      const stats = countStats(store.allPages(scanId))
      store.updateScan(scanId, { stats })
      emitProgress(scanId, stats)
    }
  }

  function recover(): string[] {
    if (lock && !lock.acquire())
      return []
    const resumed: string[] = []
    const ours = new Set([...queue.map(job => job.scanId), ...(running ? [running.job.scanId] : [])])
    for (const status of ['auditing', 'discovering', 'queued'] as const) {
      for (const scan of store.listScans({ status, limit: 10_000, offset: 0 }).items) {
        if (ours.has(scan.id))
          continue
        if (status !== 'auditing') {
          setStatus(scan.id, 'failed', { finishedAt: Date.now() }, INTERRUPTED)
          continue
        }
        let config: Config
        try {
          config = storedConfig(scan)
        }
        catch (error) {
          setStatus(scan.id, 'failed', { finishedAt: Date.now() }, `${INTERRUPTED}; its options cannot be resumed: ${message(error)}`)
          continue
        }
        queue.push({ kind: 'scan', scanId: scan.id, config, resume: true })
        resumed.push(scan.id)
      }
    }
    recoverRescans()
    pump()
    return resumed
  }

  function idle(): Promise<void> {
    if (!running && !queue.length)
      return Promise.resolve()
    return new Promise(resolve => idleWaiters.push(resolve))
  }

  async function close(): Promise<void> {
    closed = true
    if (lockTimer)
      clearTimeout(lockTimer)
    lockTimer = null
    for (const job of queue.splice(0)) {
      if (job.kind === 'scan')
        setStatus(job.scanId, 'cancelled', { finishedAt: Date.now() }, 'The Unlighthouse process stopped before this scan started')
      else
        store.setPageStatus(job.scanId, job.url, job.device, job.previous)
    }
    const current = running
    if (current) {
      current.controller.abort()
      await current.finished
    }
    settleIdle()
    lock?.release()
  }

  return {
    start,
    cancel,
    rescanPage,
    wait,
    recover,
    active: () => running?.job.scanId ?? null,
    idle,
    close,
  }
}
