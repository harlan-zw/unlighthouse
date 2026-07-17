import type {
  CrawlStats,
  DeviceMatrix,
  Logger,
  ScanId,
  ScanMode,
  ScanStatus,
  ScanSummary,
  Storage,
} from '@unlighthouse/contracts'
import type { UnlighthouseConfig } from '@unlighthouse/contracts/config'
import type { PackRegistry } from '../packs/index'
import type { EmitFn } from './route-audit'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { parseUrl } from '@unlighthouse/contracts/types/atoms'
import { deriveSiteId, deriveSiteName, siteOrigin } from '../util/site'
import { finalizeScan, nowIso, toStructuredError } from './route-audit'

export interface ScanLifecycleContext {
  scanId: ScanId
  site: string
  devices: DeviceMatrix
  mode: ScanMode
  startedAt: string
  startedAtMs: number
  ciBuild?: {
    branch?: string
    hash?: string
    message?: string
  }
}

export interface CreateScanLifecycleOptions {
  storage: Storage
  config: UnlighthouseConfig
  emit: EmitFn
  scan: ScanLifecycleContext
  logger?: Logger
  packs?: PackRegistry
}

export interface ScanLifecycle {
  /** Create the site/scan rows and emit the initial lifecycle events. Idempotent by scanId. */
  create: () => Promise<void>
  discovering: () => Promise<void>
  scanning: (discovered: number) => Promise<void>
  progress: (stats: CrawlStats, status?: 'scanning' | 'paused') => Promise<ScanSummary>
  pause: () => Promise<void>
  resume: () => Promise<void>
  cancel: (reason?: string) => Promise<void>
  routeFailed: (url: string, error: unknown) => Promise<void>
  complete: (stats: Pick<CrawlStats, 'discovered' | 'scanned' | 'failed'>) => Promise<ScanSummary>
  fail: (error: unknown) => Promise<void>
}

const TERMINAL_STATUSES = new Set<ScanStatus>(['complete', 'cancelled', 'error'])

/**
 * Own the runtime-neutral scan lifecycle shared by the local crawler and
 * durable schedulers. Crawling, audit delegation, and scheduling stay with the
 * caller; scan/site rows and lifecycle hook emissions stay consistent here.
 */
export function createScanLifecycle(options: CreateScanLifecycleOptions): ScanLifecycle {
  const { storage, emit, logger, scan } = options
  const { scanId, devices, startedAtMs } = scan

  async function currentStatus(): Promise<ScanStatus | null> {
    return (await storage.scans.get(scanId))?.status ?? null
  }

  async function setStatusIfActive(status: ScanStatus): Promise<boolean> {
    const current = await currentStatus()
    if (!current || current === status || TERMINAL_STATUSES.has(current))
      return false
    await storage.scans.update(scanId, { status })
    return true
  }

  async function create(): Promise<void> {
    if (await storage.scans.get(scanId))
      return

    const siteUrl = parseUrl(scan.site)
    let siteId: string | null = null
    try {
      siteId = deriveSiteId(scan.site)
      if (!await storage.sites.get(siteId)) {
        try {
          await storage.sites.create({
            id: siteId,
            name: deriveSiteName(scan.site),
            url: siteOrigin(scan.site),
            group: null,
            createdAt: nowIso(),
          })
        }
        catch (error) {
          logOperationalWarn('scan.site_create_failed', error, { scanId, siteId, site: scan.site }, logger)
          siteId = null
        }
      }
    }
    catch (error) {
      logOperationalWarn('scan.site_association_failed', error, { scanId, site: scan.site }, logger)
      siteId = null
    }

    await storage.scans.create({
      scanId,
      siteId,
      site: siteUrl,
      mode: scan.mode,
      device: devices[0],
      status: 'starting',
      startedAt: scan.startedAt,
      completedAt: null,
      ciBranch: scan.ciBuild?.branch ?? null,
      ciCommit: scan.ciBuild?.hash ?? null,
      ciCommitMessage: scan.ciBuild?.message ?? null,
    })
    await emit('scan:created', { scanId, site: siteUrl, startedAt: scan.startedAt })
    await emit('scan:started', { scanId })
  }

  async function discovering(): Promise<void> {
    if (await setStatusIfActive('discovering'))
      await emit('scan:discovering', { scanId })
  }

  async function scanning(discovered: number): Promise<void> {
    if (await setStatusIfActive('scanning'))
      await emit('scan:scanning', { scanId, discovered })
  }

  async function progress(
    stats: CrawlStats,
    status: 'scanning' | 'paused' = 'scanning',
  ): Promise<ScanSummary> {
    const summary: ScanSummary = {
      routes: stats.discovered,
      completed: stats.scanned,
      failed: stats.failed,
      scoreAverage: null,
      scoresByCategory: {},
      durationMs: Date.now() - startedAtMs,
      devices,
    }
    await storage.scans.update(scanId, { status, summary })
    await emit('scan:progress', {
      scanId,
      discovered: stats.discovered,
      scanned: stats.scanned,
      failed: stats.failed,
      total: stats.total,
    })
    return summary
  }

  async function pause(): Promise<void> {
    if (await setStatusIfActive('paused'))
      await emit('scan:paused', { scanId })
  }

  async function resume(): Promise<void> {
    if (await currentStatus() !== 'paused')
      return
    await storage.scans.update(scanId, { status: 'scanning' })
    await emit('scan:resumed', { scanId })
  }

  async function cancel(reason?: string): Promise<void> {
    const current = await currentStatus()
    if (!current || TERMINAL_STATUSES.has(current))
      return
    await storage.scans.update(scanId, { status: 'cancelled', completedAt: nowIso() })
    await emit('scan:cancelled', { scanId, reason })
  }

  async function routeFailed(url: string, error: unknown): Promise<void> {
    await emit('scan:route-failed', {
      scanId,
      url: parseUrl(url),
      error: toStructuredError(error),
    })
  }

  async function complete(
    stats: Pick<CrawlStats, 'discovered' | 'scanned' | 'failed'>,
  ): Promise<ScanSummary> {
    return finalizeScan(
      {
        storage,
        config: options.config,
        logger,
        emit,
        packs: options.packs,
      },
      { scanId, devices, startedAtMs, stats },
    )
  }

  async function fail(error: unknown): Promise<void> {
    const current = await currentStatus().catch((probeError) => {
      logOperationalWarn('scan.lifecycle_probe_failed', probeError, { scanId }, logger)
      return null
    })
    if (current && TERMINAL_STATUSES.has(current))
      return
    await storage.scans.update(scanId, {
      status: 'error',
      completedAt: nowIso(),
    }).catch((updateError) => {
      logOperationalWarn('scan.lifecycle_error_persist_failed', updateError, { scanId }, logger)
    })
    await emit('scan:error', { scanId, error: toStructuredError(error) })
  }

  return {
    create,
    discovering,
    scanning,
    progress,
    pause,
    resume,
    cancel,
    routeFailed,
    complete,
    fail,
  }
}
