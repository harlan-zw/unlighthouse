// route.* handlers.

import type { CommandOutput, ExtractedMetrics, RouteGet, RouteRescan } from '@unlighthouse/contracts'
import type { Handler } from './types'
import { gunzipSync } from 'node:zlib'
import { UnlighthouseError } from '@unlighthouse/contracts'

export const routeGet: Handler<typeof RouteGet> = {
  command: {} as typeof RouteGet,
  async run(input, ctx) {
    const scan = await ctx.storage.scans.get(input.scanId)
    if (!scan)
      throw new UnlighthouseError({ code: 'SCAN_NOT_FOUND', message: `scanId=${input.scanId}` })
    // D-029: prefer the caller's explicit device; fall back to the scan's
    // primary device so single-device callers stay unchanged. Matrix scans
    // returning ROUTE_NOT_FOUND on a specific device tells the caller the
    // form-factor wasn't part of the scan — useful signal, don't swallow.
    const device = input.device ?? scan.device
    const route = await ctx.storage.routes.get(input.scanId, input.url, device)
    if (!route)
      throw new UnlighthouseError({ code: 'ROUTE_NOT_FOUND', message: `${input.scanId}/${input.url} (device=${device})` })
    // The LHR blob is gzipped (core.ts ingest writes via gzipSync). Without
    // gunzipping first, JSON.parse barfs on the magic bytes. Pre-D-029 this
    // was latent because no test path hit route.get end-to-end after a real
    // scan; the matrix tests now do.
    let lhr: unknown = null
    if (route.lhrBlobKey) {
      const blob = await ctx.storage.blobs.get(route.lhrBlobKey)
      if (blob)
        lhr = JSON.parse(gunzipSync(blob as never).toString('utf-8'))
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
