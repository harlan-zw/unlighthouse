// route.* handlers.

import type { CommandOutput, ExtractedMetrics, RouteGet, RouteRescan } from '@unlighthouse/contracts'
import type { Handler } from './types'
import { UnlighthouseError } from '@unlighthouse/contracts'

export const routeGet: Handler<typeof RouteGet> = {
  command: {} as typeof RouteGet,
  async run(input, ctx) {
    const scan = await ctx.storage.scans.get(input.scanId)
    if (!scan)
      throw new UnlighthouseError({ code: 'SCAN_NOT_FOUND', message: `scanId=${input.scanId}` })
    // D-029: routes are PK'd on (scanId, url, device). Single-device scans
    // pull the lone row by using the scan's own device. Multi-device support
    // on this command is the next PR's job (input grows a `device` field).
    const route = await ctx.storage.routes.get(input.scanId, input.url, scan.device)
    if (!route)
      throw new UnlighthouseError({ code: 'ROUTE_NOT_FOUND', message: `${input.scanId}/${input.url}` })
    let lhr: unknown = null
    if (route.lhrBlobKey) {
      const blob = await ctx.storage.blobs.get(route.lhrBlobKey)
      if (blob)
        lhr = JSON.parse(new TextDecoder('utf-8').decode(blob))
    }
    return { route, lhr } as CommandOutput<typeof RouteGet>
  },
}

export const routeRescan: Handler<typeof RouteRescan> = {
  command: {} as typeof RouteRescan,
  async run(input, ctx) {
    const scan = await ctx.storage.scans.get(input.scanId)
    if (!scan)
      throw new UnlighthouseError({ code: 'SCAN_NOT_FOUND', message: `scanId=${input.scanId}` })
    // Direct auditor call, bypassing the crawler. Mirrors core.ts:auditWrapper extraction shape.
    const report = await ctx.auditor.audit(input.url, undefined, {})
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
    // D-029: re-audit lands under the scan's primary device for now. Future
    // route.rescan input will accept an explicit device.
    await ctx.storage.routes.upsert(input.scanId, scan.device, metrics)
    return { scanId: input.scanId, url: input.url, metrics } as CommandOutput<typeof RouteRescan>
  },
}
