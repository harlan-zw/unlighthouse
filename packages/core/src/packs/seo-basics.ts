// `seo-basics` pack — D-028. Per-route SEO health-check + sitewide
// indexability score.
//
// Reads every audit under the Lighthouse `seo` category (same source-of-
// truth pattern as a11y-quick-wins). Failing audits land in `findings`,
// keyed by audit id, with the routes that flagged them and a copy-paste
// fix hint.
//
// Indexability score is a derived metric: % of routes that pass the
// crawlability triad (is-crawlable + http-status-code + robots-txt). It's
// the headline number for an agent or a human auditing whether their site
// will actually rank.

import type { Pack, PackReconcileCtx, ReconciledReport } from '@unlighthouse/contracts'
import { z } from 'zod'

// ── Report shape ────────────────────────────────────────────────────────────

const SeveritySchema = z.enum(['critical', 'serious', 'moderate', 'minor'])

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
  severity: SeveritySchema,
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

const SeoReportSchema = z.object({
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

// ── Helpers ─────────────────────────────────────────────────────────────────

interface LhrLike {
  categories?: {
    seo?: {
      auditRefs?: Array<{ id: string, weight: number }>
    }
  }
  audits?: Record<string, {
    id?: string
    title?: string
    description?: string
    score?: number | null
    scoreDisplayMode?: string
    details?: {
      items?: Array<{
        node?: { selector?: string, snippet?: string, nodeLabel?: string }
      }>
    }
  }>
}

// is-crawlable is the load-bearing audit — a non-crawlable route is invisible
// to search engines regardless of how good its meta tags are. Weight comes
// out around 4 in the LHR. Everything else is weight 1.
function severityFromWeight(weight: number): SeoFinding['severity'] {
  if (weight >= 3)
    return 'critical'
  if (weight >= 1)
    return 'serious'
  if (weight > 0)
    return 'moderate'
  return 'minor'
}

// Hand-written fix hints. Falls back to the audit's `description` field
// when an audit id isn't covered.
const FIX_HINTS: Record<string, string> = {
  'is-crawlable': 'Remove `<meta name="robots" content="noindex">` and ensure robots.txt doesn\'t disallow this path.',
  'document-title': 'Add a unique, descriptive `<title>` tag. Lead with the page name, end with the brand.',
  'meta-description': 'Add a `<meta name="description">` between 50-160 characters. Summarise the page in one sentence.',
  'http-status-code': 'Return a 2xx status. 3xx redirects bleed link equity; 4xx/5xx blocks indexing entirely.',
  'link-text': 'Replace generic anchor text ("click here", "read more") with text describing the destination.',
  'crawlable-anchors': 'Make sure `<a href="…">` uses a real URL, not `javascript:` or empty. Search engines won\'t follow JS.',
  'robots-txt': 'Add a valid `robots.txt` at the site root. Even a minimal `User-agent: *` is better than nothing.',
  'hreflang': 'Ensure every `<link rel="alternate" hreflang="…">` uses a valid BCP 47 language code and self-references.',
  'canonical': 'Add `<link rel="canonical" href="…">` pointing at the preferred URL for this page.',
  'image-alt': 'Add `alt` attributes — search engines use them as a fallback when image content can\'t be parsed.',
  'structured-data': 'Add JSON-LD `schema.org` markup (Article, BreadcrumbList, Organization). Test with Google\'s Rich Results tool.',
  // Note: `font-size` was removed in Lighthouse 13 (2025-10). Hint kept for
  // pre-13 LHRs that still surface it; LH 13+ scans iterate the SEO category
  // and won't include this id, so the hint table just won't be consulted.
  'font-size': 'Use a base font-size of at least 12px; 16px is the modern default. Tiny text hurts mobile rankings.',
  'viewport': 'Add `<meta name="viewport" content="width=device-width, initial-scale=1">` — required for mobile-friendliness.',
  'plugins': 'Remove `<embed>` / `<object>` / `<applet>` references. Flash and Java applets aren\'t crawled.',
}

// The crawlability triad — the headline indexability number ignores
// content-quality audits (link-text, font-size) and focuses on whether
// search engines can actually fetch and index this URL.
const CRAWL_AUDITS = ['is-crawlable', 'http-status-code', 'robots-txt'] as const

interface RawFinding {
  auditId: string
  title: string
  description: string | null
  weight: number
  routes: Set<string>
  sampleElements: Array<{
    selector: string | null
    snippet: string | null
    nodeLabel: string | null
  }>
}

// Per-route view of just the SEO bits seo-basics needs. Sourced from the
// reconciled blob first (LH-version stable), with raw LHR as fallback for
// older scans + as the only source of `details.items` (the reconciled blob
// deliberately doesn't carry element-level data — too big).
interface RouteView {
  audits: Record<string, { score: number | null, title: string | null, description: string | null }>
  auditWeights: Map<string, number>
  // Only populated when the raw LHR is available, used for sampleElements.
  rawLhr: LhrLike | null
}

async function loadRouteView(url: string, ctx: PackReconcileCtx): Promise<RouteView | null> {
  const reconciled = ctx.getReconciled
    ? await ctx.getReconciled(url, 'mobile').catch(() => null) as ReconciledReport | null
    : null
  const lhr = ctx.getLhr
    ? await ctx.getLhr(url, 'mobile').catch(() => null) as LhrLike | null
    : null

  if (!reconciled && !lhr)
    return null

  const audits: RouteView['audits'] = {}
  const auditWeights = new Map<string, number>()

  if (reconciled) {
    for (const ref of reconciled.categories.seo?.auditRefs ?? [])
      auditWeights.set(ref.id, ref.weight)
    for (const [id, a] of Object.entries(reconciled.audits)) {
      audits[id] = { score: a.score, title: a.title, description: a.description }
    }
  }
  else if (lhr) {
    for (const ref of lhr.categories?.seo?.auditRefs ?? [])
      auditWeights.set(ref.id, ref.weight)
    for (const [id, a] of Object.entries(lhr.audits ?? {})) {
      audits[id] = {
        score: a.score ?? null,
        title: a.title ?? null,
        description: a.description ?? null,
      }
    }
  }

  return { audits, auditWeights, rawLhr: lhr }
}

// ── Reconciler ──────────────────────────────────────────────────────────────

async function reconcile(ctx: PackReconcileCtx): Promise<SeoReport> {
  if (!ctx.getReconciled && !ctx.getLhr) {
    throw new Error('seo-basics pack requires getReconciled or getLhr (both PackReconcileCtx fetchers were undefined).')
  }

  const findings = new Map<string, RawFinding>()
  const routeChecks: SeoRouteCheck[] = []
  let routesAnalysed = 0
  let indexableRoutes = 0

  for (const row of ctx.routes) {
    const view = await loadRouteView(row.url, ctx)
    if (!view || view.auditWeights.size === 0)
      continue
    routesAnalysed++

    let passes = 0
    let fails = 0
    let indexable = true

    for (const [auditId, weight] of view.auditWeights) {
      const audit = view.audits[auditId]
      if (!audit)
        continue
      const score = audit.score
      if (score == null)
        continue // notApplicable / manual — neither pass nor fail
      if (score === 1) {
        passes++
        continue
      }
      // Failing audit. Track per-route count, accumulate the cross-route
      // finding, and mark indexable=false if it's in the crawl triad.
      fails++
      if (CRAWL_AUDITS.includes(auditId as (typeof CRAWL_AUDITS)[number]))
        indexable = false

      let finding = findings.get(auditId)
      if (!finding) {
        finding = {
          auditId,
          title: audit.title ?? auditId,
          description: audit.description,
          weight,
          routes: new Set(),
          sampleElements: [],
        }
        findings.set(auditId, finding)
      }
      finding.routes.add(row.url)

      // Element samples can only come from the raw LHR (reconciled blob
      // intentionally drops details.items to stay lean). When the LHR is
      // unavailable, sampleElements just stays empty for that finding —
      // the cross-route counts still rank correctly.
      const rawAudit = view.rawLhr?.audits?.[auditId]
      for (const it of rawAudit?.details?.items ?? []) {
        const node = it.node
        if (!node || finding.sampleElements.length >= 3)
          break
        const sel = node.selector ?? null
        if (finding.sampleElements.some(e => e.selector === sel))
          continue
        finding.sampleElements.push({
          selector: sel,
          snippet: node.snippet ?? null,
          nodeLabel: node.nodeLabel ?? null,
        })
      }
    }

    if (indexable)
      indexableRoutes++

    routeChecks.push({ url: row.url, passes, fails, indexable })
  }

  // Sort route checks: unindexable first (so the UI leads with them), then
  // by fail count desc.
  routeChecks.sort((a, b) => {
    if (a.indexable !== b.indexable)
      return a.indexable ? 1 : -1
    return b.fails - a.fails
  })

  const result: SeoFinding[] = [...findings.values()].map((f) => {
    const routesArr = [...f.routes]
    return {
      auditId: f.auditId,
      title: f.title,
      description: f.description,
      severity: severityFromWeight(f.weight),
      weight: f.weight,
      routeCount: routesArr.length,
      routes: routesArr.slice(0, 5),
      sampleElements: f.sampleElements,
      fixHint: FIX_HINTS[f.auditId] ?? f.description ?? 'See the Lighthouse audit description for details.',
    }
  })

  const severityRank: Record<SeoFinding['severity'], number> = {
    critical: 0,
    serious: 1,
    moderate: 2,
    minor: 3,
  }
  result.sort((a, b) => {
    if (severityRank[a.severity] !== severityRank[b.severity])
      return severityRank[a.severity] - severityRank[b.severity]
    return b.routeCount - a.routeCount
  })

  const severityCounts = { critical: 0, serious: 0, moderate: 0, minor: 0 }
  for (const f of result)
    severityCounts[f.severity]++

  const indexabilityPercent = routesAnalysed > 0
    ? Math.round((indexableRoutes / routesAnalysed) * 1000) / 10
    : 0

  return {
    scanId: ctx.scanId,
    routesAnalysed,
    indexabilityPercent,
    indexableRoutes,
    unindexableRoutes: routesAnalysed - indexableRoutes,
    routeChecks: routeChecks.slice(0, 50),
    severityCounts,
    findings: result,
  }
}

// ── Pack definition ─────────────────────────────────────────────────────────

export const seoBasicsPack: Pack<SeoReport> = {
  name: 'seo-basics',
  description: 'Per-route SEO checklist + sitewide indexability score. Surfaces missing titles, meta descriptions, canonicals, hreflang, robots, link-text issues.',
  version: '1.0.0',
  auditors: [
    { kind: 'lh-category', id: 'seo', required: true },
  ],
  reconciler: reconcile,
  reportSchema: SeoReportSchema,
}
