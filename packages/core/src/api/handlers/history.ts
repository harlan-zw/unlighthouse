// history.* handlers.

import type {
  CommandOutput,
  HistoryList,
  HistoryRescan,
} from '@unlighthouse/contracts'
import type { Handler } from './types'
import { UnlighthouseError } from '@unlighthouse/contracts'

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
    // Single-session host model: Core already holds the resolved config. For multi-site
    // hosts, mutate ctx.config.site before run().
    if (input.overrideSite)
      (ctx.config as { site?: string }).site = input.overrideSite
    const session = ctx.core.run()
    return {
      scanId: session.scanId,
      site: input.overrideSite ?? source.site,
      startedAt: new Date().toISOString(),
      sourceScanId: input.scanId,
    } as CommandOutput<typeof HistoryRescan>
  },
}
