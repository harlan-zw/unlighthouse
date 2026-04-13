import type { ExtractedRoute, LighthouseResult } from './types'
import { gzipSync } from 'node:zlib'

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
  const { gunzipSync } = require('node:zlib')
  return JSON.parse(gunzipSync(gzipped).toString())
}
