// query.routes handler — cross-scan route query.

import type { CommandOutput, QueryRoutes } from '@unlighthouse/contracts/commands'
import type { ScanRoute } from '@unlighthouse/contracts/types/atoms'
import type { Handler } from './types'
import {
  applyRouteFilter,
  applyRouteRegexFallback,
  applyRouteSort,
  projectRoute,
  routeFilterForStorage,
} from './route-results'

// INTERNAL: not used by the UI; kept for power users and test coverage (d029).
export const queryRoutes: Handler<typeof QueryRoutes> = {
  command: {} as typeof QueryRoutes,
  async run(input, ctx) {
    // Single-scan path: push the filter / sort / pagination straight to
    // storage. The drizzle adapter emits real SQL — a 10k-route scan
    // filtered to 50 reads 50 rows from disk, not 10k.
    if (input.scanId) {
      const filterForStorage = routeFilterForStorage(input.filter, input.urlPattern)

      const page = await ctx.storage.routes.listForScan(input.scanId, {
        page: input.page,
        pageSize: input.pageSize,
        device: input.device,
        filter: filterForStorage,
        sort: input.sort,
      })

      let items = applyRouteRegexFallback(page.items, input.urlPattern, filterForStorage)
      if (input.projection?.length)
        items = items.map(route => projectRoute(route, input.projection!))
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
    const filterForStorage = routeFilterForStorage(input.filter, input.urlPattern)
    for (const scan of scans.items) {
      const res = await ctx.storage.routes.listForScan(scan.scanId, {
        page: 1,
        pageSize: 10_000,
        device: input.device,
        filter: filterForStorage,
      })
      pool.push(...res.items)
    }

    pool = applyRouteRegexFallback(pool, input.urlPattern, filterForStorage)

    let filtered = applyRouteSort(applyRouteFilter(pool, input.filter), input.sort)

    if (input.projection?.length)
      filtered = filtered.map(route => projectRoute(route, input.projection!))

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
