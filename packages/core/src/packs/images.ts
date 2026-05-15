// `images` pack — D-028 wedge example. Joins image-related audits across the
// raw Lighthouse reports of every route in a scan and produces an opinionated
// fix list with byte savings, severity, and LCP impact.
//
// The pack reads Lighthouse 12+ "insight"-shaped audits:
//   - image-delivery-insight  → compression / modern-format / quality fixes
//   - lcp-discovery-insight   → LCP image preload + fetchpriority
//   - unsized-images          → CLS-impacting explicit width/height
//   - image-alt               → a11y (cross-categorical example)
//
// Cross-route join: the same image URL on multiple routes becomes one finding
// with `routes` listing every page that ships it. Byte savings count once per
// image (not per route).

import type { Pack, PackReconcileCtx } from '@unlighthouse/contracts'
import { z } from 'zod'

// ── Report shape ────────────────────────────────────────────────────────────

const SeveritySchema = z.enum(['critical', 'serious', 'moderate', 'minor'])
const FindingKindSchema = z.enum([
  'unoptimized',
  'lcp-blocking',
  'unsized',
  'missing-alt',
])

const ImageFindingSchema = z.object({
  kind: FindingKindSchema,
  imageUrl: z.string(),
  severity: SeveritySchema,
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

const ImagesReportSchema = z.object({
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

// ── Helpers ─────────────────────────────────────────────────────────────────

type LhrLike = {
  audits?: Record<string, {
    score?: number | null
    metricSavings?: { LCP?: number, FCP?: number, CLS?: number }
    details?: {
      type?: string
      items?: Array<Record<string, unknown>>
    }
  }>
}

interface RawFinding {
  kind: ImageFinding['kind']
  imageUrl: string
  totalBytes: number | null
  wastedBytes: number | null
  reason: string | null
  lcpImpactMs: number | null
  routes: Set<string>
}

function severityFor(f: RawFinding): ImageFinding['severity'] {
  if (f.kind === 'lcp-blocking')
    return 'critical'
  if (f.kind === 'missing-alt')
    return 'serious'
  if (f.wastedBytes != null) {
    if (f.wastedBytes >= 100_000)
      return 'serious'
    if (f.wastedBytes >= 10_000)
      return 'moderate'
    return 'minor'
  }
  return 'moderate'
}

// Best-effort URL normalisation. CDNs add query strings that vary per route
// (DPR, width, format-auto). We strip everything after `?` so the same hero
// image at different widths collapses to one finding. Imperfect — keeps the
// origin path which is the meaningful identifier.
function normaliseImageUrl(url: string): string {
  try {
    const u = new URL(url)
    return `${u.origin}${u.pathname}`
  }
  catch {
    return url.split('?')[0]
  }
}

function readNumber(v: unknown): number | null {
  if (typeof v === 'number')
    return v
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function readString(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

// ── Per-route extractors ────────────────────────────────────────────────────

function extractImageDelivery(routeUrl: string, lhr: LhrLike, sink: Map<string, RawFinding>) {
  const audit = lhr.audits?.['image-delivery-insight']
  if (!audit || audit.score === 1)
    return
  for (const it of audit.details?.items ?? []) {
    const url = readString(it.url)
    if (!url)
      continue
    const key = `unoptimized|${normaliseImageUrl(url)}`
    const existing = sink.get(key)
    const subItems = (it.subItems as { items?: Array<{ reason?: string }> } | undefined)?.items ?? []
    const reason = subItems[0]?.reason ?? null
    const wastedBytes = readNumber(it.wastedBytes)
    const totalBytes = readNumber(it.totalBytes)
    if (existing) {
      existing.routes.add(routeUrl)
      // Keep the worst-savings instance — same image at different widths
      // can have different waste. Don't sum (would double-count).
      if (wastedBytes != null && (existing.wastedBytes == null || wastedBytes > existing.wastedBytes)) {
        existing.wastedBytes = wastedBytes
        existing.totalBytes = totalBytes
        existing.reason = reason
      }
    }
    else {
      sink.set(key, {
        kind: 'unoptimized',
        imageUrl: normaliseImageUrl(url),
        totalBytes,
        wastedBytes,
        reason,
        lcpImpactMs: null,
        routes: new Set([routeUrl]),
      })
    }
  }
}

function extractLcpDiscovery(routeUrl: string, lhr: LhrLike, sink: Map<string, RawFinding>) {
  const audit = lhr.audits?.['lcp-discovery-insight']
  // score === 1 means LCP is well-discovered already; nothing to flag.
  if (!audit || audit.score === 1)
    return
  const lcpImpactMs = audit.metricSavings?.LCP ?? null
  for (const it of audit.details?.items ?? []) {
    // The LHR emits two item shapes: a checklist (skip) and a node (the
    // actual LCP element). Pull the node's snippet src as the image url.
    if ((it as { type?: string }).type !== 'node')
      continue
    const snippet = readString((it as { snippet?: unknown }).snippet) ?? ''
    const m = snippet.match(/src=["']([^"']+)["']/)
    const url = m?.[1]
    if (!url)
      continue
    const key = `lcp-blocking|${normaliseImageUrl(url)}`
    const existing = sink.get(key)
    if (existing) {
      existing.routes.add(routeUrl)
      if (lcpImpactMs != null && (existing.lcpImpactMs == null || lcpImpactMs > existing.lcpImpactMs))
        existing.lcpImpactMs = lcpImpactMs
    }
    else {
      sink.set(key, {
        kind: 'lcp-blocking',
        imageUrl: normaliseImageUrl(url),
        totalBytes: null,
        wastedBytes: null,
        reason: 'Add fetchpriority="high" or preload the LCP image.',
        lcpImpactMs,
        routes: new Set([routeUrl]),
      })
    }
  }
}

function extractUnsized(routeUrl: string, lhr: LhrLike, sink: Map<string, RawFinding>) {
  const audit = lhr.audits?.['unsized-images']
  if (!audit || audit.score === 1)
    return
  for (const it of audit.details?.items ?? []) {
    const url = readString(it.url)
    if (!url)
      continue
    const key = `unsized|${normaliseImageUrl(url)}`
    const existing = sink.get(key)
    if (existing) {
      existing.routes.add(routeUrl)
    }
    else {
      sink.set(key, {
        kind: 'unsized',
        imageUrl: normaliseImageUrl(url),
        totalBytes: null,
        wastedBytes: null,
        reason: 'Add explicit width and height attributes to prevent layout shift.',
        lcpImpactMs: null,
        routes: new Set([routeUrl]),
      })
    }
  }
}

function extractMissingAlt(routeUrl: string, lhr: LhrLike, sink: Map<string, RawFinding>) {
  const audit = lhr.audits?.['image-alt']
  if (!audit || audit.score == null || audit.score === 1)
    return
  for (const it of audit.details?.items ?? []) {
    // image-alt items wrap each violating node. URL isn't always populated;
    // fall back to a path-keyed bucket when missing so the count is honest.
    const node = it.node as { snippet?: string } | undefined
    const snippet = node?.snippet ?? readString(it.url) ?? '(no url)'
    const m = snippet.match(/src=["']([^"']+)["']/)
    const url = m?.[1] ?? snippet
    const key = `missing-alt|${normaliseImageUrl(url)}`
    const existing = sink.get(key)
    if (existing) {
      existing.routes.add(routeUrl)
    }
    else {
      sink.set(key, {
        kind: 'missing-alt',
        imageUrl: normaliseImageUrl(url),
        totalBytes: null,
        wastedBytes: null,
        reason: 'Image is missing an alt attribute. Screen readers will skip it.',
        lcpImpactMs: null,
        routes: new Set([routeUrl]),
      })
    }
  }
}

// ── Reconciler ──────────────────────────────────────────────────────────────

async function reconcile(ctx: PackReconcileCtx): Promise<ImagesReport> {
  if (!ctx.getLhr) {
    throw new Error('images pack requires a getLhr fetcher (PackReconcileCtx.getLhr is undefined).')
  }

  const sink = new Map<string, RawFinding>()
  let routesAnalysed = 0

  for (const row of ctx.routes) {
    const lhr = await ctx.getLhr(row.url, 'mobile').catch(() => null) as LhrLike | null
    if (!lhr)
      continue
    routesAnalysed++
    extractImageDelivery(row.url, lhr, sink)
    extractLcpDiscovery(row.url, lhr, sink)
    extractUnsized(row.url, lhr, sink)
    extractMissingAlt(row.url, lhr, sink)
  }

  // Materialise + prioritise. Severity-then-byte-savings ordering surfaces
  // the actionable critical/serious issues first.
  const findings: ImageFinding[] = [...sink.values()].map((f) => {
    const severity = severityFor(f)
    const routesArr = [...f.routes]
    return {
      kind: f.kind,
      imageUrl: f.imageUrl,
      severity,
      totalBytes: f.totalBytes,
      wastedBytes: f.wastedBytes,
      reason: f.reason,
      lcpImpactMs: f.lcpImpactMs,
      routes: routesArr.slice(0, 5),
      routeCount: routesArr.length,
    }
  })

  const severityRank: Record<ImageFinding['severity'], number> = {
    critical: 0,
    serious: 1,
    moderate: 2,
    minor: 3,
  }
  findings.sort((a, b) => {
    if (severityRank[a.severity] !== severityRank[b.severity])
      return severityRank[a.severity] - severityRank[b.severity]
    return (b.wastedBytes ?? 0) - (a.wastedBytes ?? 0)
  })

  const totalBytesSavable = findings
    .filter(f => f.kind === 'unoptimized' && typeof f.wastedBytes === 'number')
    .reduce((sum, f) => sum + (f.wastedBytes ?? 0), 0)

  const severityCounts = { critical: 0, serious: 0, moderate: 0, minor: 0 }
  for (const f of findings)
    severityCounts[f.severity]++

  return {
    scanId: ctx.scanId,
    routesAnalysed,
    totalBytesSavable,
    severityCounts,
    findings,
  }
}

// ── Pack definition ─────────────────────────────────────────────────────────

export const imagesPack: Pack<ImagesReport> = {
  name: 'images',
  description: 'Image-optimisation fix list: compression, modern formats, LCP image preload, explicit sizing, missing alt. Sitewide.',
  version: '1.0.0',
  auditors: [
    { kind: 'lh-audit', id: 'image-delivery-insight', required: false },
    { kind: 'lh-audit', id: 'lcp-discovery-insight', required: false },
    { kind: 'lh-audit', id: 'unsized-images', required: false },
    { kind: 'lh-audit', id: 'image-alt', required: false },
  ],
  reconciler: reconcile,
  reportSchema: ImagesReportSchema,
}
