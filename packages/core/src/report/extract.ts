import type { Buffer } from 'node:buffer'
import type { ExtractedRoute, LighthouseResult } from './types'
import { gunzipSync, gzipSync } from 'node:zlib'

// Audit ID mapping for LH version changes
const AUDIT_MAP: Record<string, Record<string, string>> = {
  12: {},
  13: {},
}

function getNumeric(lhr: LighthouseResult, auditId: string): number | null {
  return lhr.audits[auditId]?.numericValue ?? null
}

export function extractRouteData(lhr: LighthouseResult): ExtractedRoute {
  const version = lhr.lighthouseVersion.split('.')[0]
  const mapAudit = (id: string) => AUDIT_MAP[version]?.[id] ?? id

  // Extract fullPageScreenshot node bounding rects (coordinates only, not the image)
  const fpNodes = (lhr as any).fullPageScreenshot?.nodes
  let screenshotNodes: Record<string, { left: number, top: number, width: number, height: number }> | undefined
  if (fpNodes && typeof fpNodes === 'object') {
    screenshotNodes = {}
    for (const [lhId, node] of Object.entries(fpNodes)) {
      const n = node as any
      if (n?.left != null && n?.top != null && n?.width > 0 && n?.height > 0) {
        screenshotNodes[lhId] = { left: n.left, top: n.top, width: n.width, height: n.height }
      }
    }
    if (Object.keys(screenshotNodes).length === 0)
      screenshotNodes = undefined
  }

  return {
    lcp: getNumeric(lhr, mapAudit('largest-contentful-paint')),
    cls: Math.round((getNumeric(lhr, mapAudit('cumulative-layout-shift')) ?? 0) * 1000),
    tbt: getNumeric(lhr, mapAudit('total-blocking-time')),
    fcp: getNumeric(lhr, mapAudit('first-contentful-paint')),
    si: getNumeric(lhr, mapAudit('speed-index')),
    ttfb: getNumeric(lhr, mapAudit('server-response-time')),
    inp: getNumeric(lhr, mapAudit('interaction-to-next-paint')),
    scores: {
      performance: lhr.categories.performance?.score ?? null,
      accessibility: lhr.categories.accessibility?.score ?? null,
      bestPractices: lhr.categories['best-practices']?.score ?? null,
      seo: lhr.categories.seo?.score ?? null,
    },
    audits: lhr.audits,
    lhrGzip: gzipSync(JSON.stringify(lhr)),
    screenshotNodes,
  }
}

export function decompressLhr(gzipped: Buffer): LighthouseResult {
  return JSON.parse(gunzipSync(gzipped).toString())
}

export interface ReconciledRouteReport {
  route: { path: string, url: string, routeName: string | null }
  scores: { performance: number | null, accessibility: number | null, seo: number | null, bestPractices: number | null }
  metrics: { lcp: number | null, cls: number | null, tbt: number | null, fcp: number | null, si: number | null, ttfb: number | null, inp: number | null }
  categories: Array<{ key: string, id: string, title: string, score: number | null }>
  audits: Record<string, { score: number | null, numericValue?: number, displayValue?: string, title?: string, description?: string }>
  capturedAt: string
  lighthouseVersion: string
  reportBlobKey: string
}

/**
 * Build the UI-shaped per-route report from an LHR. Decoupled from the LHR
 * structure so dashboard handlers + the static client never see the raw LH JSON.
 *
 * Audits are projected to the small set the UI actually renders to keep the
 * blob payload small; consumers needing the full audit blob can read the
 * companion LHR blob via `lhrBlobKey`.
 */
export function reconcileRoute(args: {
  url: string
  path: string
  routeName: string | null
  reportBlobKey: string
  lhr: LighthouseResult
}): ReconciledRouteReport {
  const { url, path, routeName, reportBlobKey, lhr } = args
  const ext = extractRouteData(lhr)

  const categories = Object.entries(lhr.categories ?? {}).map(([key, c]) => ({
    key,
    id: (c as { id?: string })?.id ?? key,
    title: (c as { title?: string })?.title ?? key,
    score: (c as { score?: number | null })?.score ?? null,
  }))

  const audits: ReconciledRouteReport['audits'] = {}
  for (const [id, a] of Object.entries(lhr.audits ?? {})) {
    const aa = a as { score?: number | null, numericValue?: number, displayValue?: string, title?: string, description?: string }
    audits[id] = {
      score: aa?.score ?? null,
      numericValue: aa?.numericValue,
      displayValue: aa?.displayValue,
      title: aa?.title,
      description: aa?.description,
    }
  }

  return {
    route: { path, url, routeName },
    scores: {
      performance: ext.scores.performance,
      accessibility: ext.scores.accessibility,
      seo: ext.scores.seo,
      bestPractices: ext.scores.bestPractices,
    },
    metrics: {
      lcp: ext.lcp,
      cls: ext.cls,
      tbt: ext.tbt,
      fcp: ext.fcp,
      si: ext.si,
      ttfb: ext.ttfb,
      inp: ext.inp,
    },
    categories,
    audits,
    capturedAt: new Date().toISOString(),
    lighthouseVersion: lhr.lighthouseVersion,
    reportBlobKey,
  }
}
