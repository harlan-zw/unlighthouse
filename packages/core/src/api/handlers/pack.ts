// pack.* handlers — D-028.
//
// `pack.run` resolves a pack by name from the host's registry (built-in plus
// any third-party packs the host has wired up), pulls the scan's routes from
// storage, and hands them to the pack's reconciler. Output is validated
// against the pack's own reportSchema before going over the wire — packs
// can't lie about their report shape.

import type { CommandOutput, PackList, PackRunCmd } from '@unlighthouse/contracts'
import { UnlighthouseError } from '@unlighthouse/contracts'
import type { Handler } from './types'
import { builtInPacks, getPack } from '../../packs/index'

export const packRun: Handler<typeof PackRunCmd> = {
  command: {} as typeof PackRunCmd,
  async run(input, ctx) {
    const pack = getPack(input.pack)
    if (!pack) {
      throw new UnlighthouseError({
        code: 'PACK_NOT_FOUND',
        message: `Pack \`${input.pack}\` is not registered on this host. Run \`pack.list\` for available packs.`,
      })
    }

    const scan = await ctx.storage.scans.get(input.scanId)
    if (!scan) {
      throw new UnlighthouseError({
        code: 'SCAN_NOT_FOUND',
        message: `No scan found for scanId=${input.scanId}`,
      })
    }

    const startedAt = new Date().toISOString()

    // Pull all routes for the scan. Pack reconcilers iterate rows in memory;
    // a 1k-route scan at ~200B/row is well under any reasonable cap. If a
    // future pack needs streaming, the storage port already supports it via
    // cursors — bridge it then.
    const routes = await ctx.storage.routes.listForScan(input.scanId, { page: 1, pageSize: 10_000 })

    const report = await pack.reconciler({
      scanId: input.scanId,
      routes: routes.items,
      logger: undefined,
    })

    // Validate before serialisation. A pack misreporting its own schema is
    // a bug in the pack, not a runtime contract; surface it loudly.
    const parsed = pack.reportSchema.safeParse(report)
    if (!parsed.success) {
      throw new UnlighthouseError({
        code: 'PACK_REPORT_INVALID',
        message: `Pack \`${pack.name}\` produced a report that doesn't match its own reportSchema.`,
        cause: parsed.error,
      })
    }

    const completedAt = new Date().toISOString()

    return {
      scanId: input.scanId,
      packName: pack.name,
      packVersion: pack.version,
      startedAt,
      completedAt,
      report: parsed.data,
    } as CommandOutput<typeof PackRunCmd>
  },
}

export const packList: Handler<typeof PackList> = {
  command: {} as typeof PackList,
  async run(_input, _ctx) {
    const packs = Object.values(builtInPacks).map(p => ({
      name: p.name,
      description: p.description,
      version: p.version,
      auditorCount: p.auditors?.length ?? 0,
    }))
    return { packs } as CommandOutput<typeof PackList>
  },
}
