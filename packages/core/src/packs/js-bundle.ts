// `js-bundle` pack — D-028. Bundle ergonomics: which scripts/stylesheets
// to defer, split, or remove. Sitewide.
//
// Reads six Lighthouse audits/insights:
//   - unused-javascript            — bytes shipped but never executed
//   - unused-css-rules             — bytes shipped but never matched
//   - render-blocking-insight      — scripts/styles that delay FCP
//   - third-parties-insight        — third-party entities + their cost
//   - legacy-javascript-insight    — ES5 polyfills shipped to modern browsers
//   - duplicated-javascript-insight — the same module bundled twice
//
// Cross-route join: keyed on resource URL. A vendor bundle that appears
// on every page becomes ONE finding with `routeCount: 18`. Byte savings
// are MAX-per-URL across routes, not sum — the same script can't be
// unloaded multiple times. Render-blocking ms is MAX per-URL too.

import type { Pack, PackReconcileCtx } from '@unlighthouse/contracts'
import { z } from 'zod'

// ── Report shape ────────────────────────────────────────────────────────────

const FindingKindSchema = z.enum([
  'unused-js',
  'unused-css',
  'render-blocking',
  'third-party',
  'legacy-js',
  'duplicated-js',
])
const SeveritySchema = z.enum(['critical', 'serious', 'moderate', 'minor'])

const BundleFindingSchema = z.object({
  kind: FindingKindSchema,
  // Either a resource URL (most kinds) or an entity name (third-party).
  // Display as a URL when possible; the UI sniffs `http(s)://`.
  resource: z.string(),
  severity: SeveritySchema,
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

const BundleReportSchema = z.object({
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

// ── Helpers ─────────────────────────────────────────────────────────────────

interface LhrLike {
  audits?: Record<string, {
    score?: number | null
    details?: {
      items?: Array<Record<string, unknown>>
    }
  }>
}

interface RawFinding {
  kind: BundleFinding['kind']
  resource: string
  totalBytes: number | null
  wastedBytes: number | null
  wastedPercent: number | null
  wastedMs: number | null
  mainThreadMs: number | null
  blockingMs: number | null
  routes: Set<string>
}

function readNum(v: unknown): number | null {
  if (typeof v === 'number')
    return v
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function readStr(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

// CDN-served bundles often carry a content hash in the path; we don't
// normalise that out (different hashes = different bundles, intentionally).
// We DO drop the query string so cache-busting `?v=…` collapses correctly.
function normaliseUrl(u: string): string {
  try {
    const p = new URL(u)
    return `${p.origin}${p.pathname}`
  }
  catch {
    return u.split('?')[0]
  }
}

const FIX_HINTS: Record<BundleFinding['kind'], string> = {
  'unused-js': 'Code-split this bundle and load it on demand, or remove the unused dead-code path.',
  'unused-css': 'Inline the critical-path CSS and defer the rest, or purge unused selectors at build time.',
  'render-blocking': 'Add `defer` (scripts) or `media`-conditional + `preload` swap (CSS). Or inline what\'s under 5KB.',
  'third-party': 'Audit whether the script is essential. Self-host where licensing permits, or load it after `idle`.',
  'legacy-js': 'Target modern browsers in your build config (Vite/webpack `target: "esnext"` or `babel.targets`).',
  'duplicated-js': 'Dedupe the module: tighten package.json `resolutions`, or use a single shared dependency version.',
}

// ── Extractors ──────────────────────────────────────────────────────────────

function bumpOrInsert(
  sink: Map<string, RawFinding>,
  routeUrl: string,
  key: string,
  factory: () => RawFinding,
  bump?: (existing: RawFinding) => void,
) {
  const existing = sink.get(key)
  if (existing) {
    existing.routes.add(routeUrl)
    bump?.(existing)
  }
  else {
    sink.set(key, factory())
  }
}

function extractUnusedJs(routeUrl: string, lhr: LhrLike, sink: Map<string, RawFinding>) {
  const a = lhr.audits?.['unused-javascript']
  if (!a || a.score === 1)
    return
  for (const it of a.details?.items ?? []) {
    const url = readStr(it.url)
    if (!url)
      continue
    const norm = normaliseUrl(url)
    const wasted = readNum(it.wastedBytes)
    const total = readNum(it.totalBytes)
    const pct = readNum(it.wastedPercent)
    bumpOrInsert(sink, routeUrl, `unused-js|${norm}`, () => ({
      kind: 'unused-js',
      resource: norm,
      totalBytes: total,
      wastedBytes: wasted,
      wastedPercent: pct,
      wastedMs: null,
      mainThreadMs: null,
      blockingMs: null,
      routes: new Set([routeUrl]),
    }), (e) => {
      if (wasted != null && (e.wastedBytes == null || wasted > e.wastedBytes)) {
        e.wastedBytes = wasted
        e.totalBytes = total
        e.wastedPercent = pct
      }
    })
  }
}

function extractUnusedCss(routeUrl: string, lhr: LhrLike, sink: Map<string, RawFinding>) {
  const a = lhr.audits?.['unused-css-rules']
  if (!a || a.score === 1)
    return
  for (const it of a.details?.items ?? []) {
    const url = readStr(it.url)
    if (!url)
      continue
    const norm = normaliseUrl(url)
    const wasted = readNum(it.wastedBytes)
    const total = readNum(it.totalBytes)
    const pct = readNum(it.wastedPercent)
    bumpOrInsert(sink, routeUrl, `unused-css|${norm}`, () => ({
      kind: 'unused-css',
      resource: norm,
      totalBytes: total,
      wastedBytes: wasted,
      wastedPercent: pct,
      wastedMs: null,
      mainThreadMs: null,
      blockingMs: null,
      routes: new Set([routeUrl]),
    }), (e) => {
      if (wasted != null && (e.wastedBytes == null || wasted > e.wastedBytes)) {
        e.wastedBytes = wasted
        e.totalBytes = total
        e.wastedPercent = pct
      }
    })
  }
}

function extractRenderBlocking(routeUrl: string, lhr: LhrLike, sink: Map<string, RawFinding>) {
  const a = lhr.audits?.['render-blocking-insight']
  if (!a || a.score === 1)
    return
  for (const it of a.details?.items ?? []) {
    const url = readStr(it.url)
    if (!url)
      continue
    const norm = normaliseUrl(url)
    const ms = readNum(it.wastedMs)
    const total = readNum(it.totalBytes)
    bumpOrInsert(sink, routeUrl, `render-blocking|${norm}`, () => ({
      kind: 'render-blocking',
      resource: norm,
      totalBytes: total,
      wastedBytes: null,
      wastedPercent: null,
      wastedMs: ms,
      mainThreadMs: null,
      blockingMs: null,
      routes: new Set([routeUrl]),
    }), (e) => {
      if (ms != null && (e.wastedMs == null || ms > e.wastedMs))
        e.wastedMs = ms
    })
  }
}

function extractThirdParty(routeUrl: string, lhr: LhrLike, sink: Map<string, RawFinding>) {
  const a = lhr.audits?.['third-parties-insight']
  if (!a || a.score === 1)
    return
  for (const it of a.details?.items ?? []) {
    // LHR puts the entity name on the top-level row; sub-items break it
    // down per origin. We aggregate at the entity level — that's what the
    // agent / human cares about ("Google Tag Manager: 1.2s blocking").
    const entity = readStr((it as { entity?: unknown }).entity)
      ?? readStr((it.entity as { text?: unknown })?.text)
      ?? readStr(it.url)
    if (!entity)
      continue
    const mt = readNum(it.mainThreadTime)
    const bt = readNum(it.blockingTime)
    const total = readNum(it.transferSize)
    bumpOrInsert(sink, routeUrl, `third-party|${entity}`, () => ({
      kind: 'third-party',
      resource: entity,
      totalBytes: total,
      wastedBytes: null,
      wastedPercent: null,
      wastedMs: null,
      mainThreadMs: mt,
      blockingMs: bt,
      routes: new Set([routeUrl]),
    }), (e) => {
      if (bt != null && (e.blockingMs == null || bt > e.blockingMs))
        e.blockingMs = bt
      if (mt != null && (e.mainThreadMs == null || mt > e.mainThreadMs))
        e.mainThreadMs = mt
    })
  }
}

function extractLegacyOrDup(
  routeUrl: string,
  lhr: LhrLike,
  sink: Map<string, RawFinding>,
  auditId: 'legacy-javascript-insight' | 'duplicated-javascript-insight',
  kind: 'legacy-js' | 'duplicated-js',
) {
  const a = lhr.audits?.[auditId]
  if (!a || a.score === 1)
    return
  for (const it of a.details?.items ?? []) {
    const url = readStr(it.url) ?? readStr((it as { source?: unknown }).source)
    if (!url)
      continue
    const norm = normaliseUrl(url)
    const wasted = readNum(it.wastedBytes)
    const total = readNum(it.totalBytes)
    bumpOrInsert(sink, routeUrl, `${kind}|${norm}`, () => ({
      kind,
      resource: norm,
      totalBytes: total,
      wastedBytes: wasted,
      wastedPercent: null,
      wastedMs: null,
      mainThreadMs: null,
      blockingMs: null,
      routes: new Set([routeUrl]),
    }), (e) => {
      if (wasted != null && (e.wastedBytes == null || wasted > e.wastedBytes)) {
        e.wastedBytes = wasted
        e.totalBytes = total
      }
    })
  }
}

// ── Severity ────────────────────────────────────────────────────────────────

function severityFor(f: RawFinding): BundleFinding['severity'] {
  if (f.kind === 'render-blocking') {
    if ((f.wastedMs ?? 0) >= 500)
      return 'critical'
    if ((f.wastedMs ?? 0) >= 200)
      return 'serious'
    if ((f.wastedMs ?? 0) >= 50)
      return 'moderate'
    return 'minor'
  }
  if (f.kind === 'third-party') {
    if ((f.blockingMs ?? 0) >= 500)
      return 'critical'
    if ((f.blockingMs ?? 0) >= 250)
      return 'serious'
    if ((f.blockingMs ?? 0) >= 50)
      return 'moderate'
    return 'minor'
  }
  // Byte-based findings (unused-js, unused-css, legacy-js, duplicated-js).
  const w = f.wastedBytes ?? 0
  if (w >= 250_000)
    return 'critical'
  if (w >= 50_000)
    return 'serious'
  if (w >= 10_000)
    return 'moderate'
  return 'minor'
}

// ── Reconciler ──────────────────────────────────────────────────────────────

async function reconcile(ctx: PackReconcileCtx): Promise<BundleReport> {
  if (!ctx.getLhr)
    throw new Error('js-bundle pack requires a getLhr fetcher.')

  const sink = new Map<string, RawFinding>()
  let routesAnalysed = 0

  for (const row of ctx.routes) {
    const lhr = await ctx.getLhr(row.url, 'mobile').catch(() => null) as LhrLike | null
    if (!lhr)
      continue
    routesAnalysed++
    extractUnusedJs(row.url, lhr, sink)
    extractUnusedCss(row.url, lhr, sink)
    extractRenderBlocking(row.url, lhr, sink)
    extractThirdParty(row.url, lhr, sink)
    extractLegacyOrDup(row.url, lhr, sink, 'legacy-javascript-insight', 'legacy-js')
    extractLegacyOrDup(row.url, lhr, sink, 'duplicated-javascript-insight', 'duplicated-js')
  }

  // Materialise + prioritise.
  const findings: BundleFinding[] = [...sink.values()].map((f) => {
    const severity = severityFor(f)
    const routesArr = [...f.routes]
    return {
      kind: f.kind,
      resource: f.resource,
      severity,
      totalBytes: f.totalBytes,
      wastedBytes: f.wastedBytes,
      wastedPercent: f.wastedPercent,
      wastedMs: f.wastedMs,
      mainThreadMs: f.mainThreadMs,
      blockingMs: f.blockingMs,
      fixHint: FIX_HINTS[f.kind],
      routes: routesArr.slice(0, 5),
      routeCount: routesArr.length,
    }
  })

  const severityRank: Record<BundleFinding['severity'], number> = {
    critical: 0,
    serious: 1,
    moderate: 2,
    minor: 3,
  }
  // Sort by severity, then by impact within the kind family.
  findings.sort((a, b) => {
    if (severityRank[a.severity] !== severityRank[b.severity])
      return severityRank[a.severity] - severityRank[b.severity]
    const aImpact = a.wastedBytes ?? a.wastedMs ?? a.blockingMs ?? 0
    const bImpact = b.wastedBytes ?? b.wastedMs ?? b.blockingMs ?? 0
    return bImpact - aImpact
  })

  // Totals: count once per finding (already deduped by URL/entity).
  const totalBytesSavable = findings
    .filter(f => ['unused-js', 'unused-css', 'legacy-js', 'duplicated-js'].includes(f.kind))
    .reduce((sum, f) => sum + (f.wastedBytes ?? 0), 0)
  const totalRenderBlockingMs = findings
    .filter(f => f.kind === 'render-blocking')
    .reduce((sum, f) => sum + (f.wastedMs ?? 0), 0)

  const severityCounts = { critical: 0, serious: 0, moderate: 0, minor: 0 }
  for (const f of findings)
    severityCounts[f.severity]++

  return {
    scanId: ctx.scanId,
    routesAnalysed,
    totalBytesSavable,
    totalRenderBlockingMs,
    severityCounts,
    findings,
  }
}

// ── Pack definition ─────────────────────────────────────────────────────────

export const jsBundlePack: Pack<BundleReport> = {
  name: 'js-bundle',
  description: 'Bundle ergonomics: unused JS/CSS, render-blocking resources, third-party cost, legacy / duplicated JS. Defer / split / remove recipe per resource.',
  version: '1.0.0',
  auditors: [
    { kind: 'lh-audit', id: 'unused-javascript', required: false },
    { kind: 'lh-audit', id: 'unused-css-rules', required: false },
    { kind: 'lh-audit', id: 'render-blocking-insight', required: false },
    { kind: 'lh-audit', id: 'third-parties-insight', required: false },
    { kind: 'lh-audit', id: 'legacy-javascript-insight', required: false },
    { kind: 'lh-audit', id: 'duplicated-javascript-insight', required: false },
  ],
  reconciler: reconcile,
  reportSchema: BundleReportSchema,
}
