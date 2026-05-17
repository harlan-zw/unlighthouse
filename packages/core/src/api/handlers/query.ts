// query.routes handler — cross-scan route query.

import type { CommandOutput, QueryRoutes, ScanRoute } from '@unlighthouse/contracts'
import type { Handler } from './types'
import { applyRouteFilter, applyRouteSort } from './scan'

// Substring-or-literal check — same heuristic scanResults uses. Anything
// that looks like a plain URL/path goes to SQL `LIKE`; richer regexes
// stay in JS on the final page.
function isLiteralSubstring(pattern: string): boolean {
  return /^[\w./\-:?#]+$/.test(pattern)
}

export const queryRoutes: Handler<typeof QueryRoutes> = {
  command: {} as typeof QueryRoutes,
  async run(input, ctx) {
    // Single-scan path: push the filter / sort / pagination straight to
    // storage. The drizzle adapter emits real SQL — a 10k-route scan
    // filtered to 50 reads 50 rows from disk, not 10k.
    if (input.scanId) {
      const filterForStorage = input.filter
        ? {
            minScore: input.filter.minScore,
            maxMetric: input.filter.maxMetric,
            urlPattern: input.urlPattern && isLiteralSubstring(input.urlPattern)
              ? input.urlPattern
              : undefined,
          }
        : (input.urlPattern && isLiteralSubstring(input.urlPattern)
            ? { urlPattern: input.urlPattern }
            : undefined)

      const page = await ctx.storage.routes.listForScan(input.scanId, {
        page: input.page,
        pageSize: input.pageSize,
        device: input.device,
        filter: filterForStorage,
        sort: input.sort,
      })

      let items = page.items
      // Fall through to JS for regex urlPatterns the SQL push-down skipped.
      if (input.urlPattern && (!filterForStorage || filterForStorage.urlPattern == null)) {
        const re = new RegExp(input.urlPattern)
        items = items.filter(r => re.test(r.url))
      }
      if (input.projection?.length)
        items = items.map(r => projectRow(r, input.projection!))
      return {
        items,
        total: page.total,
        page: input.page,
        pageSize: input.pageSize,
      } as CommandOutput<typeof QueryRoutes>
    }

    // Cross-scan path: aggregate rows from every matching scan, then
    // filter/sort/page in JS. Push-down doesn't help here because the
    // result is a union across scans — SQL would need a UNION ALL
    // query the storage port doesn't expose. The per-scan listForScan
    // calls still get the device + (substring) filter push-down so a
    // 10-scan × 1000-route span doesn't fetch all 10000 just to filter.
    let pool: ScanRoute[] = []
    const scans = await ctx.storage.scans.list({
      site: input.site,
      device: input.device,
      branch: input.branch,
      pageSize: 500,
    })
    const filterForStorage = input.filter
      ? {
          minScore: input.filter.minScore,
          maxMetric: input.filter.maxMetric,
          urlPattern: input.urlPattern && isLiteralSubstring(input.urlPattern)
            ? input.urlPattern
            : undefined,
        }
      : (input.urlPattern && isLiteralSubstring(input.urlPattern)
          ? { urlPattern: input.urlPattern }
          : undefined)
    for (const scan of scans.items) {
      const res = await ctx.storage.routes.listForScan(scan.scanId, {
        page: 1,
        pageSize: 10_000,
        device: input.device,
        filter: filterForStorage,
      })
      pool.push(...res.items)
    }

    if (input.urlPattern && (!filterForStorage || filterForStorage.urlPattern == null)) {
      const re = new RegExp(input.urlPattern)
      pool = pool.filter(r => re.test(r.url))
    }

    let filtered = applyRouteSort(applyRouteFilter(pool, input.filter), input.sort)

    if (input.projection?.length)
      filtered = filtered.map(r => projectRow(r, input.projection!))

    const start = (input.page - 1) * input.pageSize
    const items = filtered.slice(start, start + input.pageSize)
    return {
      items,
      total: filtered.length,
      page: input.page,
      pageSize: input.pageSize,
    } as CommandOutput<typeof QueryRoutes>
  },
}

// Projection: limit metric columns to those the caller asked for; identity
// columns (url, path, device, scanId, blob keys, capturedAt, version) stay
// regardless because they identify the row. Scores stay too — they're cheap
// and most projection use cases want them alongside metrics.
function projectRow(r: ScanRoute, projection: string[]): ScanRoute {
  const keep = new Set(projection)
  const out: Record<string, unknown> = {
    url: r.url,
    path: r.path,
    scanId: r.scanId,
    device: r.device,
    lhrBlobKey: r.lhrBlobKey,
    capturedAt: r.capturedAt,
    lighthouseVersion: r.lighthouseVersion,
    routeName: r.routeName,
  }
  for (const m of ['lcp', 'cls', 'inp', 'fcp', 'ttfb', 'tbt', 'si'])
    out[m] = keep.has(m) ? (r as unknown as Record<string, number | null>)[m] : null
  out.scorePerformance = r.scorePerformance
  out.scoreAccessibility = r.scoreAccessibility
  out.scoreSeo = r.scoreSeo
  out.scoreBestPractices = r.scoreBestPractices
  return out as unknown as ScanRoute
}
