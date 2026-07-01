// Single source of truth for all pack report schemas.
// Moved verbatim from packages/core/src/packs/*.ts — no schema logic altered.
// Name collisions resolved by prefixing:
//   MetricKeySchema  → CwvMetricKeySchema (cwv) / CruxMetricKeySchema (crux)
//   SeveritySchema   → ImagesSeveritySchema / A11ySeveritySchema /
//                      BundleSeveritySchema / SeoSeveritySchema
//                      (crux's distinct-valued SeveritySchema keeps its name)
//   FindingKindSchema → ImagesFindingKindSchema / BundleFindingKindSchema

import { z } from 'zod'
import { CategorySchema, DeviceSchema } from '../types/atoms'

// ── overview ─────────────────────────────────────────────────────────────────

export const OverviewReportSchema = z.object({
  scanId: z.string(),
  device: z.enum(['mobile', 'desktop']),
  routesScanned: z.number().int().nonnegative(),
  avgScore: z.number().nullable(),
  categoryAverages: z.partialRecord(CategorySchema, z.number().nullable()),
  categoryScoreDisplayModes: z.partialRecord(CategorySchema, z.enum(['gauge', 'fraction'])),
  distribution: z.object({
    passing: z.number().int().nonnegative(),
    needsWork: z.number().int().nonnegative(),
    poor: z.number().int().nonnegative(),
  }),
  worstRoutes: z.array(z.object({
    url: z.url(),
    score: z.number().nullable(),
    category: CategorySchema.nullable(),
    // Device dimension on the worst-row so a mobile regression and a
    // desktop regression of the same URL surface as distinct rows.
    device: DeviceSchema.nullable(),
  })).max(5),
  templateGroups: z.array(z.object({
    routeName: z.string().nullable(),
    routes: z.number().int().nonnegative(),
    avgScore: z.number().nullable(),
  })).max(5),
})

export type OverviewReport = z.infer<typeof OverviewReportSchema>

// ── cwv ──────────────────────────────────────────────────────────────────────
// MetricKeySchema renamed CwvMetricKeySchema (collision with crux's MetricKeySchema)

const CwvMetricKeySchema = z.enum(['lcp', 'cls', 'inp', 'fcp', 'ttfb', 'tbt', 'si'])
const VerdictSchema = z.enum(['good', 'needsImprovement', 'poor'])

const MetricSnapshotSchema = z.object({
  metric: CwvMetricKeySchema,
  p75: z.number().nullable(),
  verdict: VerdictSchema.nullable(),
  distribution: z.object({
    good: z.number().int().nonnegative(),
    needsImprovement: z.number().int().nonnegative(),
    poor: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
  }),
  // Up to 3 worst-scoring routes for the metric. URL kept short.
  worstRoutes: z.array(z.object({
    url: z.string(),
    value: z.number(),
  })).max(3),
})

const CwvFixSchema = z.object({
  insight: z.string(), // e.g. 'render-blocking-insight'
  title: z.string(),
  // Largest single-route impact reported by the LHR (we don't sum across
  // routes because impacts aren't additive — fixing render-blocking on
  // /blog doesn't shave time off /about).
  maxImpactMs: z.number(),
  metric: CwvMetricKeySchema,
  // Routes that flagged this insight with non-zero savings, capped at 5.
  routes: z.array(z.string()).max(5),
  routeCount: z.number().int().nonnegative(),
})

export const CwvReportSchema = z.object({
  scanId: z.string(),
  routesAnalysed: z.number().int().nonnegative(),
  metrics: z.array(MetricSnapshotSchema),
  // Site-wide pass: every Core Web Vital (LCP, CLS, INP) p75 in `good`.
  // Mirrors the CrUX "Site passes" rule on PageSpeed Insights.
  passesCoreWebVitals: z.boolean(),
  // Top-N fix suggestions by impact. Capped at 10 for the wire payload.
  topFixes: z.array(CwvFixSchema).max(10),
})

export type MetricSnapshot = z.infer<typeof MetricSnapshotSchema>
export type CwvFix = z.infer<typeof CwvFixSchema>
export type CwvReport = z.infer<typeof CwvReportSchema>

// ── crux ─────────────────────────────────────────────────────────────────────
// MetricKeySchema renamed CruxMetricKeySchema (collision with cwv's MetricKeySchema)
// SeveritySchema keeps its name here (different values from images/a11y/js-bundle/seo)

const FormFactorSchema = z.enum(['PHONE', 'DESKTOP', 'TABLET', 'ALL_FORM_FACTORS'])
const SourceSchema = z.enum(['url', 'origin', 'none'])
const SeveritySchema = z.enum(['good', 'needsImprovement', 'poor', 'unknown'])

const CruxFindingSchema = z.object({
  url: z.string(),
  formFactor: FormFactorSchema,
  // CrUX CLS is a raw float (e.g. 0.05) — NOT scaled like lab CLS-units * 1000.
  // Keep them separate in the report so consumers don't have to guess the unit.
  lcp_p75: z.number().nullable(),
  cls_p75: z.number().nullable(),
  inp_p75: z.number().nullable(),
  // Which CrUX endpoint produced the row:
  //   'url'    — per-URL record matched
  //   'origin' — per-URL missed, origin-level fallback hit
  //   'none'   — both missed (new site, low traffic) or no API key
  source: SourceSchema,
  // Worst severity across the three core metrics. 'unknown' when source='none'.
  severity: SeveritySchema,
})

const SeverityCountsSchema = z.object({
  good: z.number().int().nonnegative(),
  needsImprovement: z.number().int().nonnegative(),
  poor: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative(),
})

// Lab-vs-field gap analysis. We restrict the comparison to a verdict — not a
// raw value — because the units differ (lab numbers come from a single
// throttled run, field p75 from real users). What matters operationally is:
// "did Lighthouse say this is fine while real users disagree?".
const CruxMetricKeySchema = z.enum(['lcp', 'cls', 'inp'])
const GapVerdictSchema = z.enum(['good', 'needsImprovement', 'poor'])

const GapEntrySchema = z.object({
  url: z.string(),
  // CrUX-style form factor for joinability with the rest of the report.
  formFactor: FormFactorSchema,
  metric: CruxMetricKeySchema,
  labVerdict: GapVerdictSchema,
  fieldVerdict: GapVerdictSchema,
  labValue: z.number().nullable(),
  fieldValue: z.number().nullable(),
})

const GapAnalysisSchema = z.object({
  // Lab said `good`, field says `poor`. The damning gap — lab passed but real
  // users feel it.
  goodLabPoorField: z.array(GapEntrySchema),
  // Lab said `poor`, field says `good`. Lab was pessimistic — useful for
  // tuning thresholds or recognising over-conservative single-run noise.
  poorLabGoodField: z.array(GapEntrySchema),
  // Both substrates agree on the verdict. Aligned rows are still useful for
  // confidence — if `good` lab + `good` field, you can trust the result.
  aligned: z.array(GapEntrySchema),
})

export const CruxReportSchema = z.object({
  scanId: z.string(),
  routesAnalysed: z.number().int().nonnegative(),
  // How many CrUX queries we issued total. routesAnalysed * formFactors in
  // the simple case; mostly here so consumers can spot "is the pack even
  // doing anything?" vs "we queried but got nothing back".
  totalRoutesQueried: z.number().int().nonnegative(),
  // True iff at least one route fell back to the origin-level record.
  hasOriginFallback: z.boolean(),
  severityCounts: SeverityCountsSchema,
  findings: z.array(CruxFindingSchema),
  // Populated whenever we have BOTH lab values (on the ScanRoute) and field
  // findings (CrUX source !== 'none') to compare. When nothing lines up,
  // every bucket is the empty array — `null` would be ambiguous with
  // "feature off" vs "ran but found nothing aligned".
  gapAnalysis: GapAnalysisSchema,
})

export type CruxFinding = z.infer<typeof CruxFindingSchema>
export type CruxReport = z.infer<typeof CruxReportSchema>
export type CruxFormFactor = z.infer<typeof FormFactorSchema>
export type CruxSource = z.infer<typeof SourceSchema>
export type GapEntry = z.infer<typeof GapEntrySchema>
export type GapAnalysis = z.infer<typeof GapAnalysisSchema>

// ── images ───────────────────────────────────────────────────────────────────
// SeveritySchema renamed ImagesSeveritySchema (collision with a11y/js-bundle/seo)
// FindingKindSchema renamed ImagesFindingKindSchema (collision with js-bundle)

const ImagesSeveritySchema = z.enum(['critical', 'serious', 'moderate', 'minor'])
const ImagesFindingKindSchema = z.enum([
  'unoptimized',
  'lcp-blocking',
  'unsized',
  'missing-alt',
])

const ImageFindingSchema = z.object({
  kind: ImagesFindingKindSchema,
  imageUrl: z.string(),
  severity: ImagesSeveritySchema,
  // Byte savings — only meaningful for `unoptimized` findings; null otherwise.
  // Counted ONCE per image even if shared across routes.
  totalBytes: z.number().int().nullable(),
  wastedBytes: z.number().int().nullable(),
  // Human-readable reason from the LHR (e.g. "Use modern image formats").
  reason: z.string().nullable(),
  // LCP impact in milliseconds. Sourced from `metricSavings.LCP` on the
  // contributing audit; only set on `lcp-blocking` findings today.
  lcpImpactMs: z.number().nullable(),
  // Every route URL that ships this image. Dropped to 5 for brevity in the
  // wire payload; the count is still accurate.
  routes: z.array(z.string()).max(5),
  routeCount: z.number().int().nonnegative(),
})

export const ImagesReportSchema = z.object({
  scanId: z.string(),
  routesAnalysed: z.number().int().nonnegative(),
  // Aggregate byte savings if every `unoptimized` fix is applied. Counted
  // once per unique image URL — the agent doesn't get to multiply this by
  // routes.
  totalBytesSavable: z.number().int().nonnegative(),
  // Bucketed severity counts so the agent / UI can lead with "X critical".
  severityCounts: z.object({
    critical: z.number().int().nonnegative(),
    serious: z.number().int().nonnegative(),
    moderate: z.number().int().nonnegative(),
    minor: z.number().int().nonnegative(),
  }),
  findings: z.array(ImageFindingSchema),
})

export type ImageFinding = z.infer<typeof ImageFindingSchema>
export type ImagesReport = z.infer<typeof ImagesReportSchema>

// ── a11y-quick-wins ──────────────────────────────────────────────────────────
// SeveritySchema renamed A11ySeveritySchema (collision with images/js-bundle/seo)

const A11ySeveritySchema = z.enum(['critical', 'serious', 'moderate', 'minor'])

const AffectedElementSchema = z.object({
  selector: z.string(),
  snippet: z.string().nullable(),
  nodeLabel: z.string().nullable(),
  // The first route URL on which this element was seen. Useful for the
  // "view in context" affordance later.
  firstSeenOn: z.string(),
})

const A11yFindingSchema = z.object({
  auditId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  severity: A11ySeveritySchema,
  // Lighthouse a11y category weight (the source of severity).
  weight: z.number().int().nonnegative(),
  // Number of unique elements (selector) that violate this rule, across
  // the whole site. NOT the same as routeCount — one route can have
  // multiple violating elements.
  elementCount: z.number().int().nonnegative(),
  // Unique routes that flagged this rule.
  routeCount: z.number().int().nonnegative(),
  routes: z.array(z.string()).max(5),
  // Top 3 affected elements for orientation. The agent / UI drills into
  // raw LHR if it needs the full list.
  topElements: z.array(AffectedElementSchema).max(3),
  // One-line copy-paste hint for the fix. Audit-keyed; falls back to the
  // audit's own description when we don't have a hand-written tip.
  fixHint: z.string().nullable(),
})

export const A11yReportSchema = z.object({
  scanId: z.string(),
  routesAnalysed: z.number().int().nonnegative(),
  // Total violation instances across the site (sum of routeCount × element
  // hits — gives "X total fails", the agent's headline number).
  totalViolations: z.number().int().nonnegative(),
  severityCounts: z.object({
    critical: z.number().int().nonnegative(),
    serious: z.number().int().nonnegative(),
    moderate: z.number().int().nonnegative(),
    minor: z.number().int().nonnegative(),
  }),
  findings: z.array(A11yFindingSchema),
})

export type A11yFinding = z.infer<typeof A11yFindingSchema>
export type A11yReport = z.infer<typeof A11yReportSchema>

// ── js-bundle ────────────────────────────────────────────────────────────────
// FindingKindSchema renamed BundleFindingKindSchema (collision with images)
// SeveritySchema renamed BundleSeveritySchema (collision with images/a11y/seo)

const BundleFindingKindSchema = z.enum([
  'unused-js',
  'unused-css',
  'render-blocking',
  'third-party',
  'legacy-js',
  'duplicated-js',
])
const BundleSeveritySchema = z.enum(['critical', 'serious', 'moderate', 'minor'])

const BundleFindingSchema = z.object({
  kind: BundleFindingKindSchema,
  // Either a resource URL (most kinds) or an entity name (third-party).
  // Display as a URL when possible; the UI sniffs `http(s)://`.
  resource: z.string(),
  severity: BundleSeveritySchema,
  // Wasted bytes counted once per resource (max across routes).
  totalBytes: z.number().int().nullable(),
  wastedBytes: z.number().int().nullable(),
  // Percent of `totalBytes` unused (from the LHR — only present on
  // unused-* audits).
  wastedPercent: z.number().nullable(),
  // Render-blocking only: estimated FCP improvement in ms.
  wastedMs: z.number().int().nullable(),
  // Third-party only: main-thread + blocking time.
  mainThreadMs: z.number().int().nullable(),
  blockingMs: z.number().int().nullable(),
  // One-line copy-paste hint.
  fixHint: z.string(),
  routes: z.array(z.string()).max(5),
  routeCount: z.number().int().nonnegative(),
})

export const BundleReportSchema = z.object({
  scanId: z.string(),
  routesAnalysed: z.number().int().nonnegative(),
  // Site-wide max savings if every unused-js / unused-css fix lands. Counted
  // once per URL, no double-counting across routes.
  totalBytesSavable: z.number().int().nonnegative(),
  // Site-wide max render-blocking ms savings.
  totalRenderBlockingMs: z.number().int().nonnegative(),
  severityCounts: z.object({
    critical: z.number().int().nonnegative(),
    serious: z.number().int().nonnegative(),
    moderate: z.number().int().nonnegative(),
    minor: z.number().int().nonnegative(),
  }),
  findings: z.array(BundleFindingSchema),
})

export type BundleFinding = z.infer<typeof BundleFindingSchema>
export type BundleReport = z.infer<typeof BundleReportSchema>

// ── seo-basics ───────────────────────────────────────────────────────────────
// SeveritySchema renamed SeoSeveritySchema (collision with images/a11y/js-bundle)

const SeoSeveritySchema = z.enum(['critical', 'serious', 'moderate', 'minor'])

const RouteCheckSchema = z.object({
  url: z.string(),
  passes: z.number().int().nonnegative(),
  fails: z.number().int().nonnegative(),
  indexable: z.boolean(),
})

const SeoFindingSchema = z.object({
  auditId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  severity: SeoSeveritySchema,
  weight: z.number().nonnegative(),
  // Route count where this audit failed.
  routeCount: z.number().int().nonnegative(),
  routes: z.array(z.string()).max(5),
  // For array-items audits (link-text, hreflang) — sample affected elements.
  sampleElements: z.array(z.object({
    selector: z.string().nullable(),
    snippet: z.string().nullable(),
    nodeLabel: z.string().nullable(),
  })).max(3),
  fixHint: z.string(),
})

export const SeoReportSchema = z.object({
  scanId: z.string(),
  routesAnalysed: z.number().int().nonnegative(),
  // Headline: % of routes that pass the crawlability triad.
  indexabilityPercent: z.number().min(0).max(100),
  // The same number split out, for the UI.
  indexableRoutes: z.number().int().nonnegative(),
  unindexableRoutes: z.number().int().nonnegative(),
  // Per-route summary (top 50, sorted unindexable-first then by fail count).
  routeChecks: z.array(RouteCheckSchema).max(50),
  severityCounts: z.object({
    critical: z.number().int().nonnegative(),
    serious: z.number().int().nonnegative(),
    moderate: z.number().int().nonnegative(),
    minor: z.number().int().nonnegative(),
  }),
  findings: z.array(SeoFindingSchema),
})

export type SeoFinding = z.infer<typeof SeoFindingSchema>
export type SeoRouteCheck = z.infer<typeof RouteCheckSchema>
export type SeoReport = z.infer<typeof SeoReportSchema>

// ── insights ─────────────────────────────────────────────────────────────────

const SavingsSchema = z.object({
  LCP: z.number().optional(),
  FCP: z.number().optional(),
  INP: z.number().optional(),
  CLS: z.number().optional(),
  TBT: z.number().optional(),
})

const InsightFindingSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  routeCount: z.number().int(),
  totalSavings: SavingsSchema,
  maxSingleRouteSavings: SavingsSchema,
  worstRoutes: z.array(z.object({
    url: z.string(),
    savings: SavingsSchema,
  })),
})

export const InsightsReportSchema = z.object({
  scanId: z.string(),
  routesAnalysed: z.number().int(),
  insights: z.array(InsightFindingSchema),
  priorityOrder: z.array(z.string()),
})
export type InsightsReport = z.infer<typeof InsightsReportSchema>

// ── agentic-browsing ─────────────────────────────────────────────────────────

const AuditSummarySchema = z.object({
  auditId: z.string(),
  title: z.string().nullable(),
  severity: z.enum(['pass', 'warn', 'fail']),
  routeCount: z.number().int(),
  passingRouteCount: z.number().int(),
  failingRoutes: z.array(z.string()),
})

export const AgenticBrowsingReportSchema = z.object({
  scanId: z.string(),
  routesAnalysed: z.number().int(),
  avgScore: z.number().nullable(),
  passedChecks: z.number().int().nonnegative().optional(),
  totalChecks: z.number().int().nonnegative().optional(),
  findings: z.array(AuditSummarySchema),
  webmcp: z.object({
    supported: z.boolean().nullable().optional(),
    hasRegisteredTools: z.boolean(),
    formCoverage: z.number().nullable(),
    schemaValid: z.boolean().nullable(),
    routesWithTools: z.number().int(),
    registeredToolCount: z.number().int().nonnegative().optional(),
    missingFormAnnotationCount: z.number().int().nonnegative().optional(),
    routesMissingFormAnnotations: z.number().int().nonnegative().optional(),
    schemaIssueCount: z.number().int().nonnegative().optional(),
  }),
  hasLlmsTxt: z.boolean(),
  llmsTxt: z.object({
    status: z.enum(['present', 'missing', 'invalid', 'fetch-failed', 'unknown']),
    validRoutes: z.number().int().nonnegative(),
    invalidRoutes: z.number().int().nonnegative(),
    missingRoutes: z.number().int().nonnegative(),
    fetchFailedRoutes: z.number().int().nonnegative(),
  }).optional(),
  stability: z.object({
    routeCount: z.number().int().nonnegative(),
    passingCount: z.number().int().nonnegative(),
    maxCls: z.number().nullable(),
  }).optional(),
  agentA11yTree: z.object({
    routeCount: z.number().int(),
    passingCount: z.number().int(),
  }),
})
export type AgenticBrowsingReport = z.infer<typeof AgenticBrowsingReportSchema>

// ── Combined ─────────────────────────────────────────────────────────────────

export const packReportSchemas = {
  'overview': OverviewReportSchema,
  'cwv': CwvReportSchema,
  'crux': CruxReportSchema,
  'images': ImagesReportSchema,
  'a11y-quick-wins': A11yReportSchema,
  'js-bundle': BundleReportSchema,
  'seo-basics': SeoReportSchema,
  'insights': InsightsReportSchema,
  'agentic-browsing': AgenticBrowsingReportSchema,
} as const

export const PackReportSchema = z.union([
  OverviewReportSchema,
  CwvReportSchema,
  CruxReportSchema,
  ImagesReportSchema,
  A11yReportSchema,
  BundleReportSchema,
  SeoReportSchema,
  InsightsReportSchema,
  AgenticBrowsingReportSchema,
])

export type PackReport = z.infer<typeof PackReportSchema>
