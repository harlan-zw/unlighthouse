// scan.* handlers — wired to UnlighthouseCore session + Storage.

import type {
  CommandInput,
  CommandOutput,
  ScanCancel,
  ScanCurrent,
  ScanDelete,
  ScanMetaCmd,
  ScanPause,
  ScanRescanAll,
  ScanResults,
  ScanResume,
  ScanRoute,
  ScanStart,
  ScanStatusCmd,
  ScanSummaryCmd,
} from '@unlighthouse/contracts'
import type { Handler } from './types'
import { UnlighthouseError } from '@unlighthouse/contracts'
import { overviewPack } from '../../packs/overview'
import { readGitMeta } from '../../util/git-meta'

function notFound(scanId: string): never {
  throw new UnlighthouseError({
    code: 'SCAN_NOT_FOUND',
    message: `No scan found for scanId=${scanId}`,
  })
}

export const scanStart: Handler<typeof ScanStart> = {
  command: {} as typeof ScanStart,
  async run(input, ctx) {
    if (ctx.core.session())
      throw new UnlighthouseError({ code: 'ACTIVE_SCAN_CONFLICT', message: 'A scan is already in flight' })
    // Auto-fill ciBuild from the local git checkout when the caller didn't
    // pass one. Without this, every local CLI / MCP scan persists ciBranch
    // = null, and compare.run can't tell a re-run on the same commit apart
    // from a regression on a new commit. Real CI environments pass an
    // explicit `ciBuild` block and bypass this entirely.
    const ciBuild = input.ciBuild ?? deriveCiBuild()
    const session = ctx.core.run({
      overrides: {
        site: input.site,
        device: input.device,
        sampleSize: input.sampleSize,
        categories: input.categories,
        auditor: input.auditor,
        ciBuild,
      },
    })
    return {
      scanId: session.scanId,
      site: input.site,
      startedAt: new Date().toISOString(),
    } as CommandOutput<typeof ScanStart>
  },
}

function deriveCiBuild(): { branch?: string, hash?: string, message?: string } | undefined {
  const meta = readGitMeta()
  if (meta.branch == null && meta.commit == null && meta.message == null)
    return undefined
  return {
    ...(meta.branch ? { branch: meta.branch } : {}),
    ...(meta.commit ? { hash: meta.commit } : {}),
    ...(meta.message ? { message: meta.message } : {}),
  }
}

export const scanStatus: Handler<typeof ScanStatusCmd> = {
  command: {} as typeof ScanStatusCmd,
  async run(input, ctx) {
    const session = ctx.core.session()
    if (session && session.scanId === input.scanId) {
      const stats = session.stats()
      const scan = await ctx.storage.scans.get(input.scanId)
      return {
        scanId: input.scanId,
        status: session.state(),
        discovered: stats.discovered,
        scanned: stats.scanned,
        failed: stats.failed,
        total: stats.total,
        startedAt: scan?.startedAt ?? new Date().toISOString(),
        completedAt: scan?.completedAt ?? null,
      } as CommandOutput<typeof ScanStatusCmd>
    }
    const scan = await ctx.storage.scans.get(input.scanId)
    if (!scan)
      notFound(input.scanId)
    const summary = scan.summary
    return {
      scanId: scan.scanId,
      status: scan.status,
      discovered: summary?.routes ?? 0,
      scanned: summary?.completed ?? 0,
      failed: summary?.failed ?? 0,
      total: summary?.routes ?? 0,
      startedAt: scan.startedAt,
      completedAt: scan.completedAt,
    } as CommandOutput<typeof ScanStatusCmd>
  },
}

export const scanCancel: Handler<typeof ScanCancel> = {
  command: {} as typeof ScanCancel,
  async run(input, ctx) {
    const session = ctx.core.session()
    if (!session || session.scanId !== input.scanId)
      notFound(input.scanId)
    await session.cancel(input.reason)
    return {
      scanId: input.scanId,
      status: session.state(),
      cancelledAt: new Date().toISOString(),
    } as CommandOutput<typeof ScanCancel>
  },
}

export const scanPause: Handler<typeof ScanPause> = {
  command: {} as typeof ScanPause,
  async run(input, ctx) {
    const session = ctx.core.session()
    if (!session || session.scanId !== input.scanId)
      notFound(input.scanId)
    if (!session.capabilities.pausable)
      throw new UnlighthouseError({ code: 'NOT_SUPPORTED', message: 'Active crawler is not pausable' })
    await session.pause()
    return { scanId: input.scanId, status: session.state() } as CommandOutput<typeof ScanPause>
  },
}

export const scanResume: Handler<typeof ScanResume> = {
  command: {} as typeof ScanResume,
  async run(input, ctx) {
    const session = ctx.core.session()
    if (!session || session.scanId !== input.scanId)
      notFound(input.scanId)
    if (!session.capabilities.pausable)
      throw new UnlighthouseError({ code: 'NOT_SUPPORTED', message: 'Active crawler is not pausable' })
    await session.resume()
    return { scanId: input.scanId, status: session.state() } as CommandOutput<typeof ScanResume>
  },
}

export const scanDelete: Handler<typeof ScanDelete> = {
  command: {} as typeof ScanDelete,
  async run(input, ctx) {
    const existing = await ctx.storage.scans.get(input.scanId)
    if (!existing)
      notFound(input.scanId)
    await ctx.storage.scans.delete(input.scanId)
    return { scanId: input.scanId, deleted: true } as CommandOutput<typeof ScanDelete>
  },
}

// Helpers shared with query.routes.
export function applyRouteFilter(items: ScanRoute[], filter: CommandInput<typeof ScanResults>['filter']): ScanRoute[] {
  if (!filter)
    return items
  return items.filter((r) => {
    if (filter.urlPattern && !new RegExp(filter.urlPattern).test(r.url))
      return false
    if (filter.minScore) {
      for (const [cat, min] of Object.entries(filter.minScore)) {
        const key = ({
          'performance': 'scorePerformance',
          'accessibility': 'scoreAccessibility',
          'seo': 'scoreSeo',
          'best-practices': 'scoreBestPractices',
        } as const)[cat as keyof typeof filter.minScore]
        const v = (r as unknown as Record<string, number | null>)[key as string]
        if (v == null || v < (min as number))
          return false
      }
    }
    if (filter.maxMetric) {
      for (const [metric, max] of Object.entries(filter.maxMetric)) {
        const v = (r as unknown as Record<string, number | null>)[metric]
        if (v != null && v > (max as number))
          return false
      }
    }
    return true
  })
}

export function applyRouteSort(items: ScanRoute[], sort?: string): ScanRoute[] {
  if (!sort)
    return items
  const copy = [...items]
  copy.sort((a, b) => {
    switch (sort) {
      case 'score-asc': return (a.scorePerformance ?? 0) - (b.scorePerformance ?? 0)
      case 'score-desc': return (b.scorePerformance ?? 0) - (a.scorePerformance ?? 0)
      case 'lcp-asc': return (a.lcp ?? Infinity) - (b.lcp ?? Infinity)
      case 'lcp-desc': return (b.lcp ?? -Infinity) - (a.lcp ?? -Infinity)
      case 'url-asc': return a.url.localeCompare(b.url)
      case 'capturedAt-desc': return b.capturedAt.localeCompare(a.capturedAt)
      default: return 0
    }
  })
  return copy
}

export const scanMeta: Handler<typeof ScanMetaCmd> = {
  command: {} as typeof ScanMetaCmd,
  async run(input, ctx) {
    const scanId = input.scanId ?? ctx.core.session()?.scanId
    if (!scanId)
      notFound(input.scanId ?? '')
    const scan = await ctx.storage.scans.get(scanId)
    if (!scan)
      notFound(scanId)
    return {
      scanId: scan.scanId,
      site: scan.site,
      device: scan.device,
      throttle: ctx.config.scanner?.throttle ?? true,
      startedAt: scan.startedAt,
      summary: scan.summary,
    } as CommandOutput<typeof ScanMetaCmd>
  },
}

export const scanCurrent: Handler<typeof ScanCurrent> = {
  command: {} as typeof ScanCurrent,
  async run(_input, ctx) {
    return { scanId: ctx.core.session()?.scanId ?? null } as CommandOutput<typeof ScanCurrent>
  },
}

export const scanRescanAll: Handler<typeof ScanRescanAll> = {
  command: {} as typeof ScanRescanAll,
  async run(input, ctx) {
    const scan = await ctx.storage.scans.get(input.scanId)
    if (!scan)
      notFound(input.scanId)
    if (ctx.core.session())
      throw new UnlighthouseError({ code: 'ACTIVE_SCAN_CONFLICT', message: 'A scan is already in flight' })
    // Drop all routes for this scan; crawler will re-discover async, consumers poll scan.status.
    await ctx.storage.routes.delete(input.scanId)
    const session = ctx.core.run()
    return { scanId: session.scanId, queued: 0 } as CommandOutput<typeof ScanRescanAll>
  },
}

export const scanResults: Handler<typeof ScanResults> = {
  command: {} as typeof ScanResults,
  async run(input, ctx) {
    const scan = await ctx.storage.scans.get(input.scanId)
    if (!scan)
      notFound(input.scanId)
    // TODO: push filter/sort down to storage when adapters support it.
    const all = await ctx.storage.routes.listForScan(input.scanId, { page: 1, pageSize: 10_000 })
    const filtered = applyRouteSort(applyRouteFilter(all.items, input.filter), input.sort)
    const start = (input.page - 1) * input.pageSize
    const items = filtered.slice(start, start + input.pageSize)
    return {
      items,
      total: filtered.length,
      page: input.page,
      pageSize: input.pageSize,
    } as CommandOutput<typeof ScanResults>
  },
}

// D-028 layered output, tier 1: powered by the built-in `overview` pack.
// Kept thin — all aggregation lives in the pack so third-party tools can
// reproduce or extend it.
export const scanSummary: Handler<typeof ScanSummaryCmd> = {
  command: {} as typeof ScanSummaryCmd,
  async run(input, ctx) {
    const scan = await ctx.storage.scans.get(input.scanId)
    if (!scan)
      notFound(input.scanId)
    const all = await ctx.storage.routes.listForScan(input.scanId, { page: 1, pageSize: 10_000 })

    const report = await overviewPack.reconciler({
      scanId: input.scanId,
      routes: all.items,
      logger: undefined,
    })

    // The wire schema in commands/scan.ts intentionally mirrors OverviewReport
    // plus the scan's site (which isn't on the pack output — packs don't
    // reach into scan metadata). Add it here.
    return {
      ...report,
      site: scan.site,
      device: input.device ?? scan.device,
    } as CommandOutput<typeof ScanSummaryCmd>
  },
}
