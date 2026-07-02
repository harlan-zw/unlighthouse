// history.* handlers.

import type {
  CommandOutput,
  HistoryList,
  HistoryPrune,
  HistoryRescan,
} from '@unlighthouse/contracts/commands'
import type { Handler } from './types'
import { UnlighthouseError } from '@unlighthouse/contracts/errors'
import { pruneScans } from '../../scan/prune'

export const historyList: Handler<typeof HistoryList> = {
  command: {} as typeof HistoryList,
  async run(input, ctx) {
    const res = await ctx.storage.scans.list({
      site: input.site,
      device: input.device,
      branch: input.branch,
      page: input.page,
      pageSize: input.pageSize,
    })
    return res as CommandOutput<typeof HistoryList>
  },
}

export const historyRescan: Handler<typeof HistoryRescan> = {
  command: {} as typeof HistoryRescan,
  async run(input, ctx) {
    const source = await ctx.storage.scans.get(input.scanId)
    if (!source)
      throw new UnlighthouseError({ code: 'SCAN_NOT_FOUND', message: `scanId=${input.scanId}` })
    if (ctx.core.session())
      throw new UnlighthouseError({ code: 'ACTIVE_SCAN_CONFLICT', message: 'A scan is already in flight' })
    const site = input.overrideSite ?? source.site
    const session = ctx.core.run({
      overrides: {
        site,
        device: source.device ? [source.device as 'mobile' | 'desktop'] : undefined,
      },
    })
    return {
      scanId: session.scanId,
      site,
      startedAt: new Date().toISOString(),
      sourceScanId: input.scanId,
    } as CommandOutput<typeof HistoryRescan>
  },
}

// D-044: enforce retention. Merges `ctx.config.retention` with per-call
// overrides (input wins where present) and runs `pruneScans` over the Storage
// port. Dry-run reports what would be deleted without mutating.
export const historyPrune: Handler<typeof HistoryPrune> = {
  command: {} as typeof HistoryPrune,
  async run(input, ctx) {
    const base = ctx.config.retention ?? {}
    const retention = {
      maxScansPerSite: input.maxScansPerSite ?? base.maxScansPerSite,
      maxAgeDays: input.maxAgeDays ?? base.maxAgeDays,
      keepCiBaselines: input.keepCiBaselines ?? base.keepCiBaselines,
    }
    const result = await pruneScans(ctx.storage, retention, { dryRun: input.dryRun })
    return result as CommandOutput<typeof HistoryPrune>
  },
}
