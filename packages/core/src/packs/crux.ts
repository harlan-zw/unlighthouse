// `crux` pack — bridge to Chrome User Experience Report field data.
//
// Phase 11 / issue #349 — scope:
//   - Per-route p75 LCP / CLS / INP from CrUX next to the lab numbers
//   - Origin-level fallback when a URL has no per-URL CrUX coverage
//   - Severity bucketed against the Google p75 thresholds (good/ni/poor)
//   - "Lab vs field" gap detector: per (url, device) joins the LAB verdict
//     (Lighthouse-extracted metrics on the ScanRoute) with the FIELD verdict
//     (CrUX p75 for the same metric) and partitions into three buckets:
//       * goodLabPoorField — lab passed but real users hit it (most damning)
//       * poorLabGoodField — lab pessimistic, real users fine (tuning hint)
//       * aligned          — lab and field agree on verdict
//     This is the wedge against single-URL competitors: lab-only scores miss
//     real-world variance (slow networks, low-end devices) and field-only
//     hides actionable fixes; we surface both, joined.
//
// Deferred to follow-up PRs (see #349):
//   - UI surfacing in `packages/ui/` (results pages, dashboard widgets).
//
// Why a Pack and not just the existing CrUX auditor:
//   - The auditor (`packages/core/src/auditors/crux.ts`) synthesises a full
//     LHR shaped row from CrUX history — it REPLACES a lab audit when used
//     as a provider.
//   - This pack runs ALONGSIDE any auditor (local, psi, …). It enriches
//     existing ScanRoutes with field p75 numbers so a lab scan can ship
//     "here's the lab metric AND the CrUX p75 for the same URL" without
//     having to swap auditors.
//
// Network: uses `globalThis.fetch` (Node 20+, undici). No new HTTP deps.
// Tests stub `globalThis.fetch` to avoid hitting the live API.
//
// API key resolution (matches the `psi.apiKey` style — see
// `packages/contracts/src/config/index.ts` AuditorProvider discriminator
// where `crux` already declares `apiKey?: string`):
//   1. Explicit config: `auditor.cruxApiKey` (zod-validated string)
//   2. Fallback: `process.env.CRUX_API_KEY`
// If neither is set, the pack short-circuits — the report is still
// emitted but every finding has `source: 'none'`. This means the pack
// is safe to register globally; users without a key just see "no
// field data" instead of a hard failure.

import type { Device, Pack, PackReconcileCtx, ScanRoute } from '@unlighthouse/contracts'
import { z } from 'zod'

// ── Thresholds ──────────────────────────────────────────────────────────────
// web.dev/articles/vitals — kept in sync with the cwv pack's THRESHOLDS table
// and the CrUX auditor's CWV_THRESHOLDS so a CrUX-sourced row scores the same
// way the lab row would on the same number.

const THRESHOLDS = {
  lcp: { good: 2500, poor: 4000 },
  cls: { good: 0.1, poor: 0.25 },
  inp: { good: 200, poor: 500 },
} as const

type MetricKey = keyof typeof THRESHOLDS

// ── Wire-format ─────────────────────────────────────────────────────────────

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
const MetricKeySchema = z.enum(['lcp', 'cls', 'inp'])
const GapVerdictSchema = z.enum(['good', 'needsImprovement', 'poor'])

const GapEntrySchema = z.object({
  url: z.string(),
  // CrUX-style form factor for joinability with the rest of the report.
  formFactor: FormFactorSchema,
  metric: MetricKeySchema,
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

const CruxReportSchema = z.object({
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

// ── CrUX API client ─────────────────────────────────────────────────────────

const CRUX_ENDPOINT = 'https://chromeuxreport.googleapis.com/v1/records:queryRecord'

// Raw CrUX response shape — only the fields we read. See:
// https://developer.chrome.com/docs/crux/api/#queryrecord
interface CruxApiRecord {
  key: {
    formFactor?: 'PHONE' | 'DESKTOP' | 'TABLET'
    origin?: string
    url?: string
  }
  metrics?: {
    largest_contentful_paint?: { percentiles?: { p75?: number | string } }
    cumulative_layout_shift?: { percentiles?: { p75?: number | string } }
    interaction_to_next_paint?: { percentiles?: { p75?: number | string } }
  }
}

interface CruxApiEnvelope {
  record?: CruxApiRecord
  error?: { code?: number, message?: string, status?: string }
}

export interface CruxQueryResult {
  source: CruxSource
  lcp_p75: number | null
  cls_p75: number | null
  inp_p75: number | null
}

function originOf(url: string): string {
  const parsed = new URL(url)
  return `${parsed.protocol}//${parsed.host}`
}

function readP75(metric: { percentiles?: { p75?: number | string } } | undefined): number | null {
  const raw = metric?.percentiles?.p75
  if (raw == null)
    return null
  const num = typeof raw === 'string' ? Number.parseFloat(raw) : raw
  return Number.isFinite(num) ? num : null
}

function metricsFromRecord(record: CruxApiRecord | undefined): {
  lcp_p75: number | null
  cls_p75: number | null
  inp_p75: number | null
} {
  return {
    lcp_p75: readP75(record?.metrics?.largest_contentful_paint),
    cls_p75: readP75(record?.metrics?.cumulative_layout_shift),
    inp_p75: readP75(record?.metrics?.interaction_to_next_paint),
  }
}

async function postCrux(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<{ ok: true, record?: CruxApiRecord } | { ok: false, status: number }> {
  const res = await fetch(`${CRUX_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.status === 404)
    return { ok: false, status: 404 }
  if (!res.ok) {
    // 400 from CrUX usually means "no data" (e.g. origin not in dataset).
    // Treat as a soft miss so the pack continues with origin fallback / none.
    if (res.status === 400)
      return { ok: false, status: 400 }
    const body = await res.text().catch(() => '')
    throw new Error(`CrUX API ${res.status}: ${body.slice(0, 200)}`)
  }
  const json = (await res.json()) as CruxApiEnvelope
  return { ok: true, record: json.record }
}

/**
 * Query the CrUX REST API for a single URL. Returns p75 values plus
 * a `source` tag indicating which lookup hit:
 *  - `'url'`    — per-URL record matched
 *  - `'origin'` — per-URL missed (404 / 400), origin-level fallback hit
 *  - `'none'`   — both missed, or the response carried no metric payload
 *
 * Throws only on unexpected (non-400/404) HTTP errors; per-route misses
 * are normal and represented in the return value.
 */
export async function queryCrux(
  url: string,
  formFactor: CruxFormFactor,
  apiKey: string,
): Promise<CruxQueryResult> {
  const formFactorBody = formFactor === 'ALL_FORM_FACTORS' ? {} : { formFactor }

  // 1) Try per-URL record.
  const urlAttempt = await postCrux(apiKey, { url, ...formFactorBody })
  if (urlAttempt.ok && urlAttempt.record) {
    const metrics = metricsFromRecord(urlAttempt.record)
    if (metrics.lcp_p75 != null || metrics.cls_p75 != null || metrics.inp_p75 != null)
      return { source: 'url', ...metrics }
  }

  // 2) Per-URL missed → origin-level fallback.
  const originAttempt = await postCrux(apiKey, { origin: originOf(url), ...formFactorBody })
  if (originAttempt.ok && originAttempt.record) {
    const metrics = metricsFromRecord(originAttempt.record)
    if (metrics.lcp_p75 != null || metrics.cls_p75 != null || metrics.inp_p75 != null)
      return { source: 'origin', ...metrics }
  }

  return { source: 'none', lcp_p75: null, cls_p75: null, inp_p75: null }
}

// ── Severity ────────────────────────────────────────────────────────────────

function verdictFor(metric: MetricKey, value: number | null): 'good' | 'needsImprovement' | 'poor' | null {
  if (value == null)
    return null
  const t = THRESHOLDS[metric]
  if (value <= t.good)
    return 'good'
  if (value <= t.poor)
    return 'needsImprovement'
  return 'poor'
}

// Severity rank — bigger is worse. The route-level severity is the worst
// across the three metrics we have data for.
const SEVERITY_RANK = { good: 0, needsImprovement: 1, poor: 2, unknown: 3 } as const

function worstSeverity(metrics: {
  lcp_p75: number | null
  cls_p75: number | null
  inp_p75: number | null
}): CruxFinding['severity'] {
  const verdicts = [
    verdictFor('lcp', metrics.lcp_p75),
    verdictFor('cls', metrics.cls_p75),
    verdictFor('inp', metrics.inp_p75),
  ].filter((v): v is 'good' | 'needsImprovement' | 'poor' => v != null)

  if (!verdicts.length)
    return 'unknown'
  return verdicts.reduce<'good' | 'needsImprovement' | 'poor'>((acc, v) => {
    return SEVERITY_RANK[v] > SEVERITY_RANK[acc] ? v : acc
  }, 'good')
}

// ── Lab vs field gap detector ───────────────────────────────────────────────

// CrUX speaks PHONE/DESKTOP/TABLET; the rest of the scan stack speaks
// 'mobile'/'desktop'. TABLET is intentionally dropped — we never schedule
// tablet lab runs, so there's nothing to join against.
function deviceFromFormFactor(formFactor: CruxFormFactor): Device | null {
  if (formFactor === 'PHONE')
    return 'mobile'
  if (formFactor === 'DESKTOP')
    return 'desktop'
  // TABLET / ALL_FORM_FACTORS have no lab counterpart in this codebase.
  return null
}

// The three CrUX metrics on a finding mapped to their lab ScanRoute columns.
// Keep this aligned with the THRESHOLDS table at the top of the file — both
// lab and field verdicts use the same Google p75 thresholds, which is the
// whole reason an apples-to-apples comparison is meaningful.
const COMPARABLE_METRICS = [
  { metric: 'lcp', field: 'lcp_p75', lab: 'lcp' },
  { metric: 'cls', field: 'cls_p75', lab: 'cls' },
  { metric: 'inp', field: 'inp_p75', lab: 'inp' },
] as const

/**
 * Join lab metrics (per `(url, device)` on ScanRoute) with CrUX findings
 * (per `(url, formFactor)`) and partition into three buckets by verdict
 * agreement. Routes / metrics with missing data on either side are skipped
 * silently — they're not "aligned", they're just "unknown" and don't
 * belong in any bucket.
 *
 * Exported for unit testing — the reconciler is the production caller.
 */
export function analyzeLabVsField(
  routes: ReadonlyArray<ScanRoute>,
  findings: ReadonlyArray<CruxFinding>,
): GapAnalysis {
  const result: GapAnalysis = {
    goodLabPoorField: [],
    poorLabGoodField: [],
    aligned: [],
  }

  // Index lab routes by `(device, url)` so the inner loop over findings is
  // O(1) per lookup. Field findings are the natural outer loop because
  // they're the data we conditionally have — lab is always present.
  const labIndex = new Map<string, ScanRoute>()
  for (const route of routes) {
    labIndex.set(`${route.device}|${route.url}`, route)
  }

  for (const finding of findings) {
    // No field data → no comparison possible.
    if (finding.source === 'none')
      continue
    const device = deviceFromFormFactor(finding.formFactor)
    if (!device)
      continue
    const route = labIndex.get(`${device}|${finding.url}`)
    if (!route)
      continue

    for (const { metric, field, lab } of COMPARABLE_METRICS) {
      const fieldValue = finding[field]
      const labValueRaw = (route as Record<string, unknown>)[lab]
      const labValue = typeof labValueRaw === 'number' ? labValueRaw : null
      if (fieldValue == null || labValue == null)
        continue

      const labVerdict = verdictFor(metric, labValue)
      const fieldVerdict = verdictFor(metric, fieldValue)
      if (!labVerdict || !fieldVerdict)
        continue

      const entry: GapEntry = {
        url: finding.url,
        formFactor: finding.formFactor,
        metric,
        labVerdict,
        fieldVerdict,
        labValue,
        fieldValue,
      }

      if (labVerdict === 'good' && fieldVerdict === 'poor')
        result.goodLabPoorField.push(entry)
      else if (labVerdict === 'poor' && fieldVerdict === 'good')
        result.poorLabGoodField.push(entry)
      else if (labVerdict === fieldVerdict)
        result.aligned.push(entry)
      // Other combinations (e.g. good/ni, poor/ni, ni/good) are real but not
      // in the headline buckets — leave them out rather than invent a fourth
      // bin nobody asked for. We can extend the schema later if needed.
    }
  }

  return result
}

// ── Pack config ─────────────────────────────────────────────────────────────

export interface CruxPackOptions {
  apiKey?: string
  formFactor?: CruxFormFactor
}

// Pulled out so tests can override the key resolution path without
// fiddling with `process.env`.
function resolveApiKey(opts: CruxPackOptions, ctx: PackReconcileCtx): string | null {
  // `(ctx as any).config?.auditor?.cruxApiKey` would be the long-term path
  // once the reconcile ctx carries the full UnlighthouseOptions blob. For
  // now the auditor config drops into the pack via the explicit `apiKey`
  // option (host wiring sets it from `auditor.cruxApiKey` / the `crux`
  // provider). Environment is the user-facing escape hatch.
  void ctx
  if (opts.apiKey)
    return opts.apiKey
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  return env?.CRUX_API_KEY ?? null
}

// ── Reconciler ──────────────────────────────────────────────────────────────

function buildPack(options: CruxPackOptions = {}): Pack<CruxReport> {
  async function reconcile(ctx: PackReconcileCtx): Promise<CruxReport> {
    const formFactor: CruxFormFactor = options.formFactor ?? 'PHONE'
    const apiKey = resolveApiKey(options, ctx)
    const routes = ctx.routes
    const findings: CruxFinding[] = []
    const severityCounts = { good: 0, needsImprovement: 0, poor: 0, unknown: 0 }
    let hasOriginFallback = false
    let totalRoutesQueried = 0

    // No key → emit a stub report so consumers see "pack ran, no data".
    if (!apiKey) {
      for (const r of routes) {
        findings.push({
          url: r.url,
          formFactor,
          lcp_p75: null,
          cls_p75: null,
          inp_p75: null,
          source: 'none',
          severity: 'unknown',
        })
        severityCounts.unknown++
      }
      return {
        scanId: ctx.scanId,
        routesAnalysed: routes.length,
        totalRoutesQueried: 0,
        hasOriginFallback: false,
        severityCounts,
        findings,
        // No field data → no gaps to detect. Empty buckets keep the wire
        // shape stable for downstream consumers.
        gapAnalysis: { goodLabPoorField: [], poorLabGoodField: [], aligned: [] },
      }
    }

    // Sequential — keeps us under the CrUX free-tier 150 QPM ceiling in
    // common cases. A future PR can add bounded parallelism via Promise
    // pool once we wire CrUX into compare/run.
    for (const route of routes as ScanRoute[]) {
      totalRoutesQueried++
      try {
        const result = await queryCrux(route.url, formFactor, apiKey)
        if (result.source === 'origin')
          hasOriginFallback = true
        const severity = result.source === 'none'
          ? 'unknown'
          : worstSeverity(result)
        severityCounts[severity]++
        findings.push({
          url: route.url,
          formFactor,
          lcp_p75: result.lcp_p75,
          cls_p75: result.cls_p75,
          inp_p75: result.inp_p75,
          source: result.source,
          severity,
        })
      }
      catch (e) {
        ctx.logger?.warn?.(`crux pack: query failed for ${route.url}: ${(e as Error).message}`)
        findings.push({
          url: route.url,
          formFactor,
          lcp_p75: null,
          cls_p75: null,
          inp_p75: null,
          source: 'none',
          severity: 'unknown',
        })
        severityCounts.unknown++
      }
    }

    return {
      scanId: ctx.scanId,
      routesAnalysed: routes.length,
      totalRoutesQueried,
      hasOriginFallback,
      severityCounts,
      findings,
      // Always compute — `analyzeLabVsField` short-circuits when there's no
      // overlap, returning empty buckets. The caller can then decide whether
      // to surface "0 gaps detected" or hide the section entirely.
      gapAnalysis: analyzeLabVsField(routes as ScanRoute[], findings),
    }
  }

  return {
    name: 'crux',
    description: 'Per-route p75 LCP/CLS/INP from the Chrome User Experience Report. Falls back to origin-level data when per-URL coverage is unavailable.',
    version: '0.1.0',
    // No auditor requirements — the pack queries CrUX directly during
    // reconcile and doesn't depend on any LH audit being present.
    auditors: [],
    reconciler: reconcile,
    reportSchema: CruxReportSchema,
  }
}

/**
 * Default registered pack instance. Host wiring (CLI / server) can call
 * `createCruxPack({ apiKey })` to override the key from auditor config.
 */
export const cruxPack: Pack<CruxReport> = buildPack()

/**
 * Factory for hosts that want to pass an explicit API key / formFactor
 * (e.g. CLI reads `auditor.cruxApiKey` from the resolved config).
 */
export function createCruxPack(options: CruxPackOptions = {}): Pack<CruxReport> {
  return buildPack(options)
}
