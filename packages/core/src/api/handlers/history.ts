// history.* handlers.

import type {
  CommandOutput,
  HistoryDelete,
  HistoryGet,
  HistoryList,
  HistoryRescan,
  ScanId,
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

export const historyGet: Handler<typeof HistoryGet> = {
  command: {} as typeof HistoryGet,
  async run(input, ctx) {
    const scan = await ctx.storage.scans.get(input.scanId)
    if (!scan) {
      throw new UnlighthouseError({
        code: 'SCAN_NOT_FOUND',
        message: `No scan found for scanId=${input.scanId}`,
      })
    }
    const routes = await ctx.storage.routes.listForScan(input.scanId, { page: 1, pageSize: 500 })
    return { ...scan, routes: routes.items } as CommandOutput<typeof HistoryGet>
  },
}

export const historyDelete: Handler<typeof HistoryDelete> = {
  command: {} as typeof HistoryDelete,
  async run(input, ctx) {
    if ('scanIds' in input) {
      const deleted: ScanId[] = []
      for (const id of input.scanIds) {
        await ctx.storage.scans.delete(id)
        deleted.push(id)
      }
      return { deleted } as CommandOutput<typeof HistoryDelete>
    }
    // site + keep + olderThan form.
    const list = await ctx.storage.scans.list({ site: input.site, pageSize: 500 })
    const sorted = [...list.items].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    let candidates = sorted
    if (typeof input.keep === 'number')
      candidates = candidates.slice(input.keep)
    if (input.olderThan) {
      const cutoff = input.olderThan
      candidates = candidates.filter(s => s.startedAt < cutoff)
    }
    const deleted: ScanId[] = []
    for (const s of candidates) {
      await ctx.storage.scans.delete(s.scanId)
      deleted.push(s.scanId)
    }
    return { deleted } as CommandOutput<typeof HistoryDelete>
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
