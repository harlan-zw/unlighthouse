import type { ExtractedRoute, LighthouseResult } from './types'
import { gunzipToString, gzipSync } from '../util/gzip'

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

interface FullPageScreenshotNode {
  left?: unknown
  top?: unknown
  width?: unknown
  height?: unknown
}

interface LighthouseResultWithScreenshot extends LighthouseResult {
  fullPageScreenshot?: {
    nodes?: Record<string, FullPageScreenshotNode>
  }
}

export function extractRouteData(lhr: LighthouseResult): ExtractedRoute {
  const version = lhr.lighthouseVersion.split('.')[0] ?? ''
  const mapAudit = (id: string) => AUDIT_MAP[version]?.[id] ?? id

  const fpNodes = (lhr as LighthouseResultWithScreenshot).fullPageScreenshot?.nodes
  let screenshotNodes: Record<string, { left: number, top: number, width: number, height: number }> | undefined
  if (fpNodes && typeof fpNodes === 'object') {
    screenshotNodes = {}
    for (const [lhId, node] of Object.entries(fpNodes)) {
      const { left, top, width, height } = node
      if (
        typeof left === 'number'
        && typeof top === 'number'
        && typeof width === 'number'
        && width > 0
        && typeof height === 'number'
        && height > 0
      ) {
        screenshotNodes[lhId] = { left, top, width, height }
      }
    }
    if (Object.keys(screenshotNodes).length === 0)
      screenshotNodes = undefined
  }

  return {
    lcp: getNumeric(lhr, mapAudit('largest-contentful-paint')),
    // CLS is unitless (0–1+). Store it raw — every consumer (cwv pack
    // thresholds {good:0.1,poor:0.25}, route-detail thresholds, UI
    // toFixed(3)) reads it on the 0–1 scale, and none divide. Storing
    // milli-CLS (×1000) made non-zero CLS render 1000× too large and the
    // cwv pack flag every shifting page as "poor".
    cls: getNumeric(lhr, mapAudit('cumulative-layout-shift')),
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
      agenticBrowsing: lhr.categories['agentic-browsing']?.score ?? null,
    },
    audits: lhr.audits,
    lhrGzip: gzipSync(JSON.stringify(lhr)),
    screenshotNodes,
  }
}

export function decompressLhr(gzipped: Uint8Array): LighthouseResult {
  return JSON.parse(gunzipToString(gzipped))
}

export interface ReconciledRouteReport {
  route: { path: string, url: string, routeName: string | null }
  scores: { performance: number | null, accessibility: number | null, seo: number | null, bestPractices: number | null, agenticBrowsing: number | null }
  metrics: { lcp: number | null, cls: number | null, tbt: number | null, fcp: number | null, si: number | null, ttfb: number | null, inp: number | null }
  categories: Array<{ key: string, id: string, title: string, score: number | null, categoryScoreDisplayMode: 'gauge' | 'fraction' | null }>
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

  const categories = Object.entries(lhr.categories ?? {}).map(([key, c]) => {
    const categoryScoreDisplayMode: 'gauge' | 'fraction' = (c as { categoryScoreDisplayMode?: string })?.categoryScoreDisplayMode === 'fraction' ? 'fraction' : 'gauge'
    return {
      key,
      id: (c as { id?: string })?.id ?? key,
      title: (c as { title?: string })?.title ?? key,
      score: (c as { score?: number | null })?.score ?? null,
      categoryScoreDisplayMode,
    }
  })

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
      agenticBrowsing: ext.scores.agenticBrowsing,
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
interface ContractAuditDetailItem {
  url: string | null
  type: string | null
  totalBytes: number | null
  wastedBytes: number | null
  node: { selector: string | null, snippet: string | null, nodeLabel: string | null } | null
  snippet: string | null
  reason: string | null
  entity: string | null
  blockingTime: number | null
  transferSize: number | null
  wastedMs: number | null
}

interface ContractAuditFinding {
  id: string
  score: number | null
  scoreDisplayMode: 'numeric' | 'binary' | 'informative' | 'manual' | 'notApplicable'
  displayValue: string | null
  title: string | null
  description: string | null
  severity: 'pass' | 'warn' | 'fail'
  metricSavings: { LCP?: number, FCP?: number, INP?: number, CLS?: number, TBT?: number } | null
  items: ContractAuditDetailItem[] | null
}

// Audits whose `details.items` we project into the reconciled blob. Adding
// an id here costs ~30 items × 6 fields per route → typically <2KB even on
// the worst-offender pages. Off-list audits stay items: null and the packs
// that need them fall through to getLhr.
//
// Membership chosen by what the built-in packs actually read (a11y-quick-
// wins + images today). Third-party packs can still call getLhr.
// Project details.items for ALL audits that produce actionable item data.
// This eliminates the need to gunzip the 200KB+ raw LHR for most queries.
const PROJECTED_DETAIL_AUDITS = new Set<string>([
  // Performance — Insight audits (LH13)
  'cache-insight',
  'cls-culprits-insight',
  'document-latency-insight',
  'dom-size-insight',
  'duplicated-javascript-insight',
  'font-display-insight',
  'forced-reflow-insight',
  'image-delivery-insight',
  'inp-breakdown-insight',
  'lcp-breakdown-insight',
  'lcp-discovery-insight',
  'legacy-javascript-insight',
  'modern-http-insight',
  'network-dependency-tree-insight',
  'render-blocking-insight',
  'third-parties-insight',
  'viewport-insight',
  // Performance — Diagnostics
  'unminified-css',
  'unminified-javascript',
  'unused-css-rules',
  'unused-javascript',
  'total-byte-weight',
  'bootup-time',
  'mainthread-work-breakdown',
  'long-tasks',
  'non-composited-animations',
  'unsized-images',
  'bf-cache',
  'user-timings',
  // Performance — Hidden but useful
  'network-requests',
  'resource-summary',
  'redirects',
  'server-response-time',
  // Accessibility — all failing audits with element-level data
  'accesskeys',
  'aria-allowed-attr',
  'aria-command-name',
  'aria-conditional-attr',
  'aria-deprecated-role',
  'aria-dialog-name',
  'aria-hidden-body',
  'aria-hidden-focus',
  'aria-input-field-name',
  'aria-meter-name',
  'aria-progressbar-name',
  'aria-prohibited-attr',
  'aria-required-attr',
  'aria-required-children',
  'aria-required-parent',
  'aria-roles',
  'aria-text',
  'aria-toggle-field-name',
  'aria-tooltip-name',
  'aria-treeitem-name',
  'aria-valid-attr-value',
  'aria-valid-attr',
  'button-name',
  'bypass',
  'color-contrast',
  'definition-list',
  'dlitem',
  'document-title',
  'duplicate-id-aria',
  'empty-heading',
  'form-field-multiple-labels',
  'frame-title',
  'heading-order',
  'html-has-lang',
  'html-lang-valid',
  'html-xml-lang-mismatch',
  'identical-links-same-purpose',
  'image-alt',
  'image-redundant-alt',
  'input-button-name',
  'input-image-alt',
  'label-content-name-mismatch',
  'label',
  'landmark-one-main',
  'link-in-text-block',
  'link-name',
  'list',
  'listitem',
  'meta-refresh',
  'meta-viewport',
  'object-alt',
  'select-name',
  'skip-link',
  'tabindex',
  'table-duplicate-name',
  'table-fake-caption',
  'target-size',
  'td-has-header',
  'td-headers-attr',
  'th-has-data-cells',
  'valid-lang',
  'video-caption',
  'autocomplete-valid',
  'presentation-role-conflict',
  'svg-img-alt',
  // Best Practices
  'is-on-https',
  'redirects-http',
  'geolocation-on-start',
  'notification-on-start',
  'csp-xss',
  'has-hsts',
  'origin-isolation',
  'clickjacking-mitigation',
  'trusted-types-xss',
  'paste-preventing-inputs',
  'image-aspect-ratio',
  'image-size-responsive',
  'doctype',
  'charset',
  'deprecations',
  'third-party-cookies',
  'errors-in-console',
  'inspector-issues',
  'js-libraries',
  'valid-source-maps',
  // SEO
  'is-crawlable',
  'meta-description',
  'http-status-code',
  'link-text',
  'crawlable-anchors',
  'robots-txt',
  'hreflang',
  'canonical',
  // Agentic Browsing (LH13)
  'agent-accessibility-tree',
  'webmcp-registered-tools',
  'webmcp-form-coverage',
  'webmcp-schema-validity',
  'llms-txt',
])

const DETAIL_ITEM_CAP = 30

function projectDetailItem(raw: unknown): ContractAuditDetailItem {
  const r = (raw ?? {}) as Record<string, unknown>
  const rawNode = r.node as Record<string, unknown> | undefined
  const node = rawNode
    ? {
        selector: typeof rawNode.selector === 'string' ? rawNode.selector : null,
        snippet: typeof rawNode.snippet === 'string' ? rawNode.snippet : null,
        nodeLabel: typeof rawNode.nodeLabel === 'string' ? rawNode.nodeLabel : null,
      }
    : null
  const subItems = (r.subItems as { items?: Array<{ reason?: unknown }> } | undefined)?.items
  const reason = typeof subItems?.[0]?.reason === 'string' ? subItems[0].reason : null
  return {
    url: typeof r.url === 'string' ? r.url : null,
    type: typeof r.type === 'string' ? r.type : null,
    totalBytes: typeof r.totalBytes === 'number' ? r.totalBytes : null,
    wastedBytes: typeof r.wastedBytes === 'number' ? r.wastedBytes : null,
    node,
    snippet: typeof r.snippet === 'string' ? r.snippet : null,
    reason,
    entity: typeof r.entity === 'string' ? r.entity : null,
    blockingTime: typeof r.blockingTime === 'number' ? r.blockingTime : null,
    transferSize: typeof r.transferSize === 'number' ? r.transferSize : null,
    wastedMs: typeof r.wastedMs === 'number' ? r.wastedMs : null,
  }
}

export function reconcileToContract(args: {
  scanId: string
  url: string
  device: 'mobile' | 'desktop'
  lhr: LighthouseResult
  /** D-040: backend that produced the report (`local` / `psi` / `split` / …). */
  auditor?: string | null
  /** D-041: per-category backend map when a split composer fanned categories. */
  auditors?: Record<string, string> | null
  /** D-042: effective pool concurrency at capture time. */
  concurrency?: number | null
}): {
  scanId: string
  url: string
  device: 'mobile' | 'desktop'
  metrics: {
    scorePerformance: number | null
    scoreAccessibility: number | null
    scoreSeo: number | null
    scoreBestPractices: number | null
    scoreAgenticBrowsing: number | null
    lcp: number | null
    cls: number | null
    inp: number | null
    fcp: number | null
    ttfb: number | null
    tbt: number | null
    si: number | null
  }
  categories: Record<string, { score: number | null, categoryScoreDisplayMode: 'gauge' | 'fraction' | null, auditRefs: Array<{ id: string, weight: number }> }>
  audits: Record<string, ContractAuditFinding>
  provenance: {
    lighthouseVersion: string
    userAgent: string | null
    capturedAt: string
    benchmarkIndex: number | null
    timingTotal: number | null
    warnings: string[]
    runtimeError: { code: string, message: string } | null
    auditor?: string | null
    auditors?: Record<string, string> | null
    concurrency?: number | null
  }
  stackPacks: Array<{ id: string, title: string, iconDataURL: string | null, descriptions: Record<string, string> }> | null
  entities: Array<{ name: string, isFirstParty: boolean, origins: string[] }> | null
} {
  // The function signature spelled out above mirrors the ReconciledReport
  // contract atom 1:1 — adding fields here means adding them in atoms.ts too.
  const { scanId, url, device, lhr } = args
  const ext = extractRouteData(lhr)

  const categories: Record<string, { score: number | null, categoryScoreDisplayMode: 'gauge' | 'fraction' | null, auditRefs: Array<{ id: string, weight: number }> }> = {}
  for (const [key, c] of Object.entries(lhr.categories ?? {})) {
    const cat = c as { score?: number | null, categoryScoreDisplayMode?: string, auditRefs?: Array<{ id: string, weight?: number }> }
    categories[key] = {
      score: cat?.score ?? null,
      categoryScoreDisplayMode: cat?.categoryScoreDisplayMode === 'fraction' ? 'fraction' : 'gauge',
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
      details?: { items?: unknown[] }
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
    // Project details.items only for allowlisted audits and cap the count.
    // Off-list audits + empty arrays stay items: null so the packs can guard
    // on truthiness without worrying about empty-array footguns.
    let items: ContractAuditDetailItem[] | null = null
    if (PROJECTED_DETAIL_AUDITS.has(id)) {
      const raw = aa?.details?.items
      if (Array.isArray(raw) && raw.length > 0)
        items = raw.slice(0, DETAIL_ITEM_CAP).map(projectDetailItem)
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
      items,
    }
  }

  // Extract stackPacks (framework-specific recommendations)
  const rawStackPacks = (lhr as { stackPacks?: Array<{ id: string, title: string, iconDataURL?: string, descriptions?: Record<string, string> }> }).stackPacks
  const stackPacks = rawStackPacks?.length
    ? rawStackPacks.map(sp => ({
        id: sp.id,
        title: typeof sp.title === 'string' ? sp.title : sp.id,
        iconDataURL: sp.iconDataURL ?? null,
        descriptions: sp.descriptions ?? {},
      }))
    : null

  // Extract entities (third-party origins)
  const rawEntities = (lhr as { entities?: Array<{ name: string, isFirstParty?: boolean, origins?: string[] }> }).entities
  const entities = rawEntities?.length
    ? rawEntities.map(e => ({
        name: e.name,
        isFirstParty: e.isFirstParty ?? false,
        origins: e.origins ?? [],
      }))
    : null

  const timing = (lhr as { timing?: { total?: number } }).timing
  const runtimeError = (lhr as { runtimeError?: { code?: string, message?: string } }).runtimeError
  const runWarnings = (lhr as { runWarnings?: string[] }).runWarnings

  return {
    scanId,
    url,
    device,
    metrics: {
      scorePerformance: ext.scores.performance,
      scoreAccessibility: ext.scores.accessibility,
      scoreSeo: ext.scores.seo,
      scoreBestPractices: ext.scores.bestPractices,
      scoreAgenticBrowsing: ext.scores.agenticBrowsing,
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
      benchmarkIndex: (lhr as { environment?: { benchmarkIndex?: number } }).environment?.benchmarkIndex ?? null,
      timingTotal: timing?.total ?? null,
      warnings: Array.isArray(runWarnings) ? runWarnings : [],
      runtimeError: runtimeError?.code ? { code: runtimeError.code, message: runtimeError.message ?? '' } : null,
      auditor: args.auditor ?? null,
      auditors: args.auditors ?? null,
      concurrency: args.concurrency ?? null,
    },
    stackPacks,
    entities,
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
