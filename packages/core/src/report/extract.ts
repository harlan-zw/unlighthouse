import type { Buffer } from 'node:buffer'
import type { ExtractedRoute, LighthouseResult } from './types'
import { gunzipSync, gzipSync } from 'node:zlib'

// Per-LH-major-version audit id remap. Lookup is `AUDIT_MAP[version][canonical]`
// — when the canonical metric audit id has moved or been replaced in a given
// LH version, list the replacement here. Returns the canonical id unchanged
// when the version isn't pinned or the canonical id is still current.
//
// LH 13 audit removals (release notes 2025-10-10) — none of these touch the
// canonical perf metrics we map below (LCP / CLS / TBT / FCP / SI / TTFB /
// INP all kept their ids), but other consumers should be aware:
//   - removed: font-size, offscreen-images, preload-fonts, uses-rel-preload,
//     first-meaningful-paint, no-document-write, third-party-facades,
//     uses-passive-event-listeners
//   - deferred to insight equivalents: server-response-time still emits but
//     defers numericValue to Document Latency insight. lcp-breakdown emits
//     but defers to trace engine.
//
// Keeping the map empty for v12/v13 is the right behaviour — the canonical
// ids resolve directly. This scaffolding is here so a future v14 rename
// (the next likely break) only needs a row added, not a code change.
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

// D-030 reconciler — produces the `ReconciledReport` atom shape from a raw
// LHR. Distinct from `reconcileRoute` above (which still serves the UI's
// per-route view); this one is the substrate packs read from. Kept small and
// flat so we don't grow it past the LH features Packs actually depend on —
// `opportunities` / `diagnostics` / `fullPageScreenshot` deliberately omitted,
// callers that need them fetch the raw LHR.
//
// `severity` is derived once at ingest so packs don't reinvent the rule:
//   - manual / notApplicable / informative → 'pass' (these never fail a scan)
//   - score >= 0.9 → 'pass'
//   - score >= 0.5 → 'warn'
//   - score <  0.5 → 'fail'
//   - score null on a numeric/binary audit → 'fail' (treats "couldn't run" as
//     pessimistic so packs surface it)
interface ContractAuditFinding {
  id: string
  score: number | null
  scoreDisplayMode: 'numeric' | 'binary' | 'informative' | 'manual' | 'notApplicable'
  displayValue: string | null
  title: string | null
  description: string | null
  severity: 'pass' | 'warn' | 'fail'
  metricSavings: { LCP?: number, FCP?: number, INP?: number, CLS?: number, TBT?: number } | null
}

export function reconcileToContract(args: {
  scanId: string
  url: string
  device: 'mobile' | 'desktop'
  lhr: LighthouseResult
}): {
    scanId: string
    url: string
    device: 'mobile' | 'desktop'
    metrics: {
      scorePerformance: number | null
      scoreAccessibility: number | null
      scoreSeo: number | null
      scoreBestPractices: number | null
      lcp: number | null
      cls: number | null
      inp: number | null
      fcp: number | null
      ttfb: number | null
      tbt: number | null
      si: number | null
    }
    categories: Record<string, { score: number | null, auditRefs: Array<{ id: string, weight: number }> }>
    audits: Record<string, ContractAuditFinding>
    provenance: { lighthouseVersion: string, userAgent: string | null, capturedAt: string }
  } {
  const { scanId, url, device, lhr } = args
  const ext = extractRouteData(lhr)

  const categories: Record<string, { score: number | null, auditRefs: Array<{ id: string, weight: number }> }> = {}
  for (const [key, c] of Object.entries(lhr.categories ?? {})) {
    const cat = c as { score?: number | null, auditRefs?: Array<{ id: string, weight?: number }> }
    categories[key] = {
      score: cat?.score ?? null,
      auditRefs: (cat?.auditRefs ?? []).map(r => ({
        id: r.id,
        // LHR usually carries a weight on every auditRef. Defensive default of
        // 0 — a non-existent weight shouldn't crash pack severity rules; they
        // already cap at "minor" when weight rounds down to 0.
        weight: typeof r.weight === 'number' ? r.weight : 0,
      })),
    }
  }

  const audits: Record<string, ContractAuditFinding> = {}
  for (const [id, a] of Object.entries(lhr.audits ?? {})) {
    const aa = a as {
      score?: number | null
      scoreDisplayMode?: string
      displayValue?: string
      title?: string
      description?: string
      metricSavings?: { LCP?: number, FCP?: number, INP?: number, CLS?: number, TBT?: number }
    }
    const mode = (['numeric', 'binary', 'informative', 'manual', 'notApplicable'].includes(aa?.scoreDisplayMode ?? '')
      ? aa.scoreDisplayMode
      : 'informative') as 'numeric' | 'binary' | 'informative' | 'manual' | 'notApplicable'
    // Only project metricSavings when at least one field is present + numeric;
    // an empty object would round-trip as truthy and confuse pack guards.
    let metricSavings: ContractAuditFinding['metricSavings'] = null
    if (aa?.metricSavings && typeof aa.metricSavings === 'object') {
      const out: NonNullable<ContractAuditFinding['metricSavings']> = {}
      for (const k of ['LCP', 'FCP', 'INP', 'CLS', 'TBT'] as const) {
        const v = aa.metricSavings[k]
        if (typeof v === 'number')
          out[k] = v
      }
      if (Object.keys(out).length > 0)
        metricSavings = out
    }
    audits[id] = {
      id,
      score: aa?.score ?? null,
      scoreDisplayMode: mode,
      displayValue: aa?.displayValue ?? null,
      title: typeof aa?.title === 'string' ? aa.title : null,
      description: typeof aa?.description === 'string' ? aa.description : null,
      severity: deriveSeverity(aa?.score ?? null, mode),
      metricSavings,
    }
  }

  return {
    scanId,
    url,
    device,
    metrics: {
      scorePerformance: ext.scores.performance,
      scoreAccessibility: ext.scores.accessibility,
      scoreSeo: ext.scores.seo,
      scoreBestPractices: ext.scores.bestPractices,
      lcp: ext.lcp,
      cls: ext.cls,
      inp: ext.inp,
      fcp: ext.fcp,
      ttfb: ext.ttfb,
      tbt: ext.tbt,
      si: ext.si,
    },
    categories,
    audits,
    provenance: {
      lighthouseVersion: lhr.lighthouseVersion,
      userAgent: (lhr as { userAgent?: string }).userAgent ?? null,
      capturedAt: new Date().toISOString(),
    },
  }
}

function deriveSeverity(
  score: number | null,
  mode: 'numeric' | 'binary' | 'informative' | 'manual' | 'notApplicable',
): 'pass' | 'warn' | 'fail' {
  if (mode === 'manual' || mode === 'notApplicable' || mode === 'informative')
    return 'pass'
  if (score == null)
    return 'fail'
  if (score >= 0.9)
    return 'pass'
  if (score >= 0.5)
    return 'warn'
  return 'fail'
}
