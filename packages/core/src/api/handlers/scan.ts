// scan.* handlers — wired to UnlighthouseCore session + Storage.

import type {
  CommandInput,
  CommandOutput,
  Device,
  ExtractedMetrics,
  ScanCancel,
  ScanCategories,
  ScanCurrent,
  ScanDelete,
  ScanImport,
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
import { Buffer } from 'node:buffer'
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
      mode: input.mode ?? 'site',
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

// scan.import — CI runner ingestion. Writes the pre-computed scan +
// per-route metrics + optional pack runs verbatim into storage. No
// overwrite: existing scanId throws SCAN_ALREADY_EXISTS (call scan.delete
// first if you intend to replace).
export const scanImport: Handler<typeof ScanImport> = {
  command: {} as typeof ScanImport,
  async run(input, ctx) {
    const { scan, routes, packRuns } = input

    const existing = await ctx.storage.scans.get(scan.scanId)
    if (existing) {
      throw new UnlighthouseError({
        code: 'SCAN_ALREADY_EXISTS',
        message: `Scan ${scan.scanId} already exists. Delete it first with scan.delete to replace.`,
      })
    }

    await ctx.storage.scans.create({
      scanId: scan.scanId,
      siteId: scan.siteId,
      site: scan.site,
      mode: scan.mode,
      device: scan.device,
      status: scan.status,
      startedAt: scan.startedAt,
      completedAt: scan.completedAt,
      ciBranch: scan.ciBranch,
      ciCommit: scan.ciCommit,
      ciCommitMessage: scan.ciCommitMessage,
      summary: scan.summary,
    })

    // routes.putBatch is keyed on (scanId, device) — fan out per-device.
    const byDevice = new Map<Device, ExtractedMetrics[]>()
    for (const row of routes) {
      const { device, ...metrics } = row
      const arr = byDevice.get(device) ?? []
      arr.push(metrics)
      byDevice.set(device, arr)
    }
    for (const [device, rows] of byDevice)
      await ctx.storage.routes.putBatch(scan.scanId, device, rows)

    let importedPackRuns = 0
    if (packRuns?.length) {
      for (const run of packRuns) {
        await ctx.storage.packRuns.put(run)
        importedPackRuns++
      }
    }

    return {
      scanId: scan.scanId,
      imported: true,
      routes: routes.length,
      packRuns: importedPackRuns,
    } as CommandOutput<typeof ScanImport>
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
          'agentic-browsing': 'scoreAgenticBrowsing',
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
  const numSort = (key: keyof ScanRoute, asc: boolean) => (a: ScanRoute, b: ScanRoute) => {
    const av = (a[key] as number | null) ?? (asc ? Infinity : -Infinity)
    const bv = (b[key] as number | null) ?? (asc ? Infinity : -Infinity)
    return asc ? av - bv : bv - av
  }
  const sortFn: Record<string, (a: ScanRoute, b: ScanRoute) => number> = {
    'score-asc': numSort('scorePerformance', true),
    'score-desc': numSort('scorePerformance', false),
    'lcp-asc': numSort('lcp', true),
    'lcp-desc': numSort('lcp', false),
    'cls-asc': numSort('cls', true),
    'cls-desc': numSort('cls', false),
    'fcp-asc': numSort('fcp', true),
    'fcp-desc': numSort('fcp', false),
    'tbt-asc': numSort('tbt', true),
    'tbt-desc': numSort('tbt', false),
    'ttfb-asc': numSort('ttfb', true),
    'ttfb-desc': numSort('ttfb', false),
    'si-asc': numSort('si', true),
    'si-desc': numSort('si', false),
    'inp-asc': numSort('inp', true),
    'inp-desc': numSort('inp', false),
    'url-asc': (a, b) => a.url.localeCompare(b.url),
    'capturedAt-desc': (a, b) => b.capturedAt.localeCompare(a.capturedAt),
  }
  const fn = sortFn[sort]
  if (fn) copy.sort(fn)
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
    await ctx.storage.routes.delete(input.scanId)
    const session = ctx.core.run({
      overrides: {
        site: scan.site,
        device: scan.device ? [scan.device as 'mobile' | 'desktop'] : undefined,
      },
    })
    return { scanId: session.scanId, queued: 0 } as CommandOutput<typeof ScanRescanAll>
  },
}

export const scanResults: Handler<typeof ScanResults> = {
  command: {} as typeof ScanResults,
  async run(input, ctx) {
    const scan = await ctx.storage.scans.get(input.scanId)
    if (!scan)
      notFound(input.scanId)
    // Filter / sort / device / pagination all pushed to storage. The drizzle
    // adapter turns these into real SQL (WHERE + ORDER BY + LIMIT + OFFSET),
    // so a 10k-route scan filtered down to 50 returns 50 rows from the db
    // — not 10k rows over the wire followed by a JS filter.
    //
    // The wire field `filter.urlPattern` is documented as a regex source;
    // storage push-down only handles literal substring (LIKE %pattern%).
    // We still apply the RegExp on the returned page for non-literal
    // patterns — see filterRouteRegex below. Same with sorts the adapter
    // doesn't recognise.
    const filterForStorage = input.filter
      ? {
          minScore: input.filter.minScore,
          maxMetric: input.filter.maxMetric,
          // Only pass urlPattern through to storage when it looks like a
          // plain substring (no regex meta-chars). Otherwise let the
          // adapter return the unfiltered row set and we regex it below.
          urlPattern: input.filter.urlPattern && /^[\w./\-:?#]+$/.test(input.filter.urlPattern)
            ? input.filter.urlPattern
            : undefined,
        }
      : undefined

    const page = await ctx.storage.routes.listForScan(input.scanId, {
      page: input.page,
      pageSize: input.pageSize,
      device: input.device,
      filter: filterForStorage,
      sort: input.sort,
    })

    // Apply the regex filter (if any) on the returned page. This still
    // pages correctly because the storage LIMIT/OFFSET respects the
    // substring filter that came with it.
    let items = page.items
    if (input.filter?.urlPattern && filterForStorage?.urlPattern == null) {
      const re = new RegExp(input.filter.urlPattern)
      items = items.filter(r => re.test(r.url))
    }

    return {
      items,
      total: page.total,
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

    // Honor `input.device` when present — without this filter the overview
    // pack reconciles across both devices and mobile/desktop toggles in the
    // dashboard would all render the same numbers. Empty filter result is
    // valid (e.g. caller asked for "desktop" on a mobile-only scan); the
    // pack returns null averages + zero distribution rather than throwing.
    const items = input.device
      ? all.items.filter(r => r.device === input.device)
      : all.items

    const report = await overviewPack.reconciler({
      scanId: input.scanId,
      routes: items,
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

// Aggregate per-route category scores + audit pass/fail across the whole
// scan. Walks the reconciled contract blobs route-by-route rather than the
// raw LHRs so we never pay the gunzip cost on the hot path. Routes without
// a contract blob (e.g. import paths that didn't include LHR data) are
// skipped silently — they contribute 0 audits, not a null mean.
const CATEGORY_TITLES: Record<string, string> = {
  'performance': 'Performance',
  'accessibility': 'Accessibility',
  'seo': 'SEO',
  'best-practices': 'Best Practices',
  'pwa': 'PWA',
  'agentic-browsing': 'Agentic Browsing',
}

function titleForCategory(id: string): string {
  return CATEGORY_TITLES[id] ?? id.split('-').map(w => w[0]?.toUpperCase() + w.slice(1)).join(' ')
}

interface CategoryAgg {
  scoreSum: number
  scoreCount: number
  passingCount: number
  failingCount: number
  auditIds: Set<string>
}

export const scanCategories: Handler<typeof ScanCategories> = {
  command: {} as typeof ScanCategories,
  async run(input, ctx) {
    const scan = await ctx.storage.scans.get(input.scanId)
    if (!scan)
      notFound(input.scanId)

    const { items: routes } = await ctx.storage.routes.listForScan(input.scanId, { page: 1, pageSize: 10_000 })
    const filtered = input.device ? routes.filter(r => r.device === input.device) : routes

    const agg = new Map<string, CategoryAgg>()

    for (const route of filtered) {
      if (!route.reportBlobKey)
        continue
      const key = route.reportBlobKey.replace('.json', '.contract.json')
      const blob = await ctx.storage.blobs.get(key)
      if (!blob)
        continue
      let contract: {
        categories: Record<string, { score: number | null, auditRefs: Array<{ id: string, weight: number }> }>
        audits: Record<string, { severity: 'pass' | 'warn' | 'fail' }>
      }
      try {
        contract = JSON.parse(Buffer.from(blob).toString('utf-8'))
      }
      catch {
        continue
      }

      for (const [id, cat] of Object.entries(contract.categories ?? {})) {
        let bucket = agg.get(id)
        if (!bucket) {
          bucket = { scoreSum: 0, scoreCount: 0, passingCount: 0, failingCount: 0, auditIds: new Set<string>() }
          agg.set(id, bucket)
        }
        if (typeof cat.score === 'number') {
          bucket.scoreSum += cat.score
          bucket.scoreCount++
        }
        for (const ref of cat.auditRefs ?? []) {
          // Dedupe by audit id within a category — total auditCount is the
          // unique set of audits in the category (matches LHR's notion),
          // not the cumulative across routes.
          bucket.auditIds.add(ref.id)
          const a = contract.audits?.[ref.id]
          if (!a)
            continue
          if (a.severity === 'pass')
            bucket.passingCount++
          else
            bucket.failingCount++
        }
      }
    }

    const categories = Array.from(agg.entries()).map(([id, b]) => ({
      id,
      title: titleForCategory(id),
      avgScore: b.scoreCount > 0 ? b.scoreSum / b.scoreCount : null,
      auditCount: b.auditIds.size,
      passingCount: b.passingCount,
      failingCount: b.failingCount,
    }))

    return { categories } as CommandOutput<typeof ScanCategories>
  },
}
