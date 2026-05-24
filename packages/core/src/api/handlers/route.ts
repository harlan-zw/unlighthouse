// route.* handlers.

import type { CommandOutput, ExtractedMetrics, RouteRescan } from '@unlighthouse/contracts'
import type { Handler } from './types'
import { UnlighthouseError } from '@unlighthouse/contracts'

export const routeRescan: Handler<typeof RouteRescan> = {
  command: {} as typeof RouteRescan,
  async run(input, ctx) {
    const scan = await ctx.storage.scans.get(input.scanId)
    if (!scan)
      throw new UnlighthouseError({ code: 'SCAN_NOT_FOUND', message: `scanId=${input.scanId}` })
    // D-029: explicit device, then scan's primary. Auditor emulation profile
    // is threaded through opts.device so the re-audit produces numbers
    // consistent with the original device's row.
    const device = input.device ?? scan.device
    const report = await ctx.auditor.audit(input.url, undefined, { device })
    const extracted = (report as unknown as { extracted?: ExtractedMetrics }).extracted
    const metrics: ExtractedMetrics = extracted ?? {
      url: input.url,
      path: new URL(input.url).pathname,
      routeName: null,
      scorePerformance: null,
      scoreAccessibility: null,
      scoreSeo: null,
      scoreBestPractices: null,
      lcp: null,
      cls: null,
      inp: null,
      fcp: null,
      ttfb: null,
      tbt: null,
      si: null,
      lighthouseVersion: (report as { lighthouseVersion?: string }).lighthouseVersion ?? 'unknown',
      capturedAt: new Date().toISOString(),
    } as ExtractedMetrics
    await ctx.storage.routes.upsert(input.scanId, device, metrics)
    return { scanId: input.scanId, url: input.url, metrics } as CommandOutput<typeof RouteRescan>
  },
}
