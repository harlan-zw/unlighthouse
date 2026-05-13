// query.routes handler — cross-scan route query.

import type { CommandOutput, QueryRoutes, ScanRoute } from '@unlighthouse/contracts'
import type { Handler } from './types'
import { applyRouteFilter, applyRouteSort } from './scan'

export const queryRoutes: Handler<typeof QueryRoutes> = {
  command: {} as typeof QueryRoutes,
  async run(input, ctx) {
    // TODO: push filter/sort/projection down to storage when adapters support it.
    let pool: ScanRoute[] = []
    if (input.scanId) {
      const res = await ctx.storage.routes.listForScan(input.scanId, { page: 1, pageSize: 10_000 })
      pool = res.items
    }
    else {
      const scans = await ctx.storage.scans.list({
        site: input.site,
        device: input.device,
        branch: input.branch,
        pageSize: 500,
      })
      for (const scan of scans.items) {
        const res = await ctx.storage.routes.listForScan(scan.scanId, { page: 1, pageSize: 10_000 })
        pool.push(...res.items)
      }
    }

    if (input.urlPattern) {
      const re = new RegExp(input.urlPattern)
      pool = pool.filter(r => re.test(r.url))
    }

    let filtered = applyRouteSort(applyRouteFilter(pool, input.filter), input.sort)

    if (input.projection?.length) {
      const keep = new Set<string>(input.projection)
      filtered = filtered.map((r) => {
        const out: Record<string, unknown> = { url: r.url, path: r.path, scanId: r.scanId, lhrBlobKey: r.lhrBlobKey, capturedAt: r.capturedAt, lighthouseVersion: r.lighthouseVersion, routeName: r.routeName }
        for (const m of ['lcp', 'cls', 'inp', 'fcp', 'ttfb', 'tbt', 'si']) {
          out[m] = keep.has(m) ? (r as unknown as Record<string, number | null>)[m] : null
        }
        out.scorePerformance = r.scorePerformance
        out.scoreAccessibility = r.scoreAccessibility
        out.scoreSeo = r.scoreSeo
        out.scoreBestPractices = r.scoreBestPractices
        return out as unknown as ScanRoute
      })
    }

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
