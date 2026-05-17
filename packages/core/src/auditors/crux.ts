import type { Logger } from '@unlighthouse/contracts'
import type { AuditOpts, Auditor, AuditorCapabilities, LighthouseReport, Page } from '@unlighthouse/contracts/ports'
import { gzipSync } from 'node:zlib'

export type FormFactor = 'PHONE' | 'DESKTOP' | 'TABLET' | 'ALL_FORM_FACTORS'

export type CwvMetric = 'lcp' | 'inp' | 'cls'

export interface CruxHistoryEntry {
  value: number
  time: number
  good?: number
  ni?: number
  poor?: number
}

export interface CruxMetricSeries {
  lcp: CruxHistoryEntry[]
  inp: CruxHistoryEntry[]
  cls: CruxHistoryEntry[]
}

interface MetricTimeseries {
  histogramTimeseries: Array<{
    start: number | string
    end?: number | string
    densities: (number | string)[]
  }>
  percentilesTimeseries: {
    p75s: (number | string | null)[]
  }
}

interface CrUXHistoryResult {
  key: {
    formFactor: 'PHONE' | 'DESKTOP' | 'TABLET'
    origin?: string
    url?: string
  }
  metrics: {
    cumulative_layout_shift?: MetricTimeseries
    largest_contentful_paint?: MetricTimeseries
    interaction_to_next_paint?: MetricTimeseries
    first_contentful_paint?: MetricTimeseries
    experimental_time_to_first_byte?: MetricTimeseries
  }
  collectionPeriods: Array<{
    firstDate: { year: number, month: number, day: number }
    lastDate: { year: number, month: number, day: number }
  }>
}

interface NormalizedEntry {
  date: string
  lcp75?: number
  inp75?: number
  cls75?: number
  lcpGood?: number
  lcpNi?: number
  lcpPoor?: number
  inpGood?: number
  inpNi?: number
  inpPoor?: number
  clsGood?: number
  clsNi?: number
  clsPoor?: number
}

function normaliseP75(segment: number | string | null): number {
  const value = typeof segment === 'string' ? Number.parseFloat(segment) : (segment || 0)
  return Number.isNaN(value) ? 0 : value
}

function extractHistogram(ts: MetricTimeseries['histogramTimeseries'] | undefined) {
  if (!ts?.length)
    return { good: [], ni: [], poor: [] }
  const clean = (v: number | string) => v === 'NaN' || (typeof v === 'number' && Number.isNaN(v)) ? undefined : Number(v)
  return {
    good: (ts[0]?.densities || []).map(clean),
    ni: (ts[1]?.densities || []).map(clean),
    poor: (ts[2]?.densities || []).map(clean),
  }
}

function normaliseCruxHistory(data: CrUXHistoryResult): NormalizedEntry[] {
  const {
    cumulative_layout_shift,
    largest_contentful_paint,
    interaction_to_next_paint,
  } = data.metrics

  const dates = data.collectionPeriods.map((p) => {
    const d = new Date(p.firstDate.year, p.firstDate.month - 1, p.firstDate.day)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })

  const cls = (cumulative_layout_shift?.percentilesTimeseries?.p75s || []).map(normaliseP75)
  const lcp = (largest_contentful_paint?.percentilesTimeseries?.p75s || []).map(normaliseP75)
  const inp = (interaction_to_next_paint?.percentilesTimeseries?.p75s || []).map(normaliseP75)

  const lcpH = extractHistogram(largest_contentful_paint?.histogramTimeseries)
  const clsH = extractHistogram(cumulative_layout_shift?.histogramTimeseries)
  const inpH = extractHistogram(interaction_to_next_paint?.histogramTimeseries)

  return dates.map((date, i) => ({
    date,
    lcp75: lcp[i],
    inp75: inp[i],
    cls75: cls[i],
    lcpGood: lcpH.good[i],
    lcpNi: lcpH.ni[i],
    lcpPoor: lcpH.poor[i],
    inpGood: inpH.good[i],
    inpNi: inpH.ni[i],
    inpPoor: inpH.poor[i],
    clsGood: clsH.good[i],
    clsNi: clsH.ni[i],
    clsPoor: clsH.poor[i],
  }))
}

function toSeries(
  entries: NormalizedEntry[],
  p75Key: 'lcp75' | 'inp75' | 'cls75',
  goodKey: 'lcpGood' | 'inpGood' | 'clsGood',
  niKey: 'lcpNi' | 'inpNi' | 'clsNi',
  poorKey: 'lcpPoor' | 'inpPoor' | 'clsPoor',
  filterZero: boolean,
): CruxHistoryEntry[] {
  return entries
    .filter(h => h[p75Key] != null && (!filterZero || h[p75Key]! > 0))
    .map(h => ({
      value: h[p75Key]!,
      time: new Date(h.date).getTime(),
      good: typeof h[goodKey] === 'number' ? Math.round(h[goodKey]! * 100) : undefined,
      ni: typeof h[niKey] === 'number' ? Math.round(h[niKey]! * 100) : undefined,
      poor: typeof h[poorKey] === 'number' ? Math.round(h[poorKey]! * 100) : undefined,
    }))
}

const EMPTY_SERIES: CruxMetricSeries = { lcp: [], inp: [], cls: [] }

export async function fetchCruxHistory(opts: {
  apiKey: string
  origin: string
  formFactor?: FormFactor
}): Promise<CruxMetricSeries> {
  const { apiKey, origin, formFactor = 'PHONE' } = opts
  const endpoint = `https://chromeuxreport.googleapis.com/v1/records:queryHistoryRecord?key=${apiKey}`

  const payload: Record<string, unknown> = { origin }
  if (formFactor !== 'ALL_FORM_FACTORS')
    payload.formFactor = formFactor

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (res.status === 404 || res.status === 400)
    return EMPTY_SERIES
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as any
    throw new Error(`CrUX API ${res.status}: ${body?.error?.message || res.statusText}`)
  }

  const data = await res.json() as { record?: CrUXHistoryResult }
  if (!data.record)
    return EMPTY_SERIES

  const history = normaliseCruxHistory(data.record)
  return {
    lcp: toSeries(history, 'lcp75', 'lcpGood', 'lcpNi', 'lcpPoor', true),
    inp: toSeries(history, 'inp75', 'inpGood', 'inpNi', 'inpPoor', true),
    cls: toSeries(history, 'cls75', 'clsGood', 'clsNi', 'clsPoor', false),
  }
}

export function getSiteOrigin(site: string): string {
  const parsed = new URL(site.startsWith('http') ? site : `https://${site}`)
  return `${parsed.protocol}//${parsed.host}`
}

export interface CruxAuditorOptions {
  apiKey: string
  formFactor?: FormFactor
  /** Tagged logger from `createUnlighthouseCore`; absent = silent. */
  logger?: Logger
}

const CRUX_CAPABILITIES: AuditorCapabilities = {
  reliablePerfScores: false,
  reliableFieldData: true,
  supportsThrottling: false,
  categories: ['performance'],
}

// Field-data thresholds mirror web.dev/articles/vitals and the cwv pack's
// THRESHOLDS table. Keeping them in sync means a CrUX-sourced row scores the
// same way a lab row does on the same number, so cross-source comparisons in
// compare.run don't drift.
//
// Score function: piecewise-linear between the three points
//   good  → 1.0
//   poor  → 0.5
//   2×poor (or worse) → 0
// This is intentionally simpler than Lighthouse's log-normal CDF — CrUX
// data is already statistically smoothed (28-day p75), so an additional
// curve would just add noise.
const CWV_THRESHOLDS = {
  lcp: { good: 2500, poor: 4000 },
  cls: { good: 0.1, poor: 0.25 },
  inp: { good: 200, poor: 500 },
  fcp: { good: 1800, poor: 3000 },
  ttfb: { good: 800, poor: 1800 },
} as const

function scoreMetric(metric: keyof typeof CWV_THRESHOLDS, value: number | undefined): number | null {
  if (value == null)
    return null
  const t = CWV_THRESHOLDS[metric]
  if (value <= t.good)
    return 1
  if (value <= t.poor)
    return 0.5
  // Linear fade between poor and 2×poor; clamps at 0.
  const fade = Math.max(0, 0.5 - 0.5 * ((value - t.poor) / t.poor))
  return Math.round(fade * 100) / 100
}

// Build a synthetic LHR shaped close enough to Lighthouse 12 that
// `extractRouteData` + `reconcileToContract` can lift CrUX numbers into
// ScanRoute / ReconciledReport without special-casing the source. Pack
// reconcilers then read the same row shape regardless of whether the
// data came from CrUX or a lab run.
//
// Categories: only `performance` is populated (CrUX has no a11y/seo/
// best-practices field data). The other categories stay null-scored
// so the dashboard renders them as "no data" instead of a misleading 0.
function buildSyntheticLhr(args: {
  url: string
  formFactor: FormFactor | undefined
  latest: NormalizedEntry | undefined
}): Record<string, unknown> {
  const { url, formFactor, latest } = args
  const lcp = latest?.lcp75
  // CrUX serialises CLS as a raw float (e.g. 0.05). No scale conversion.
  const cls = latest?.cls75
  const inp = latest?.inp75

  const audits: Record<string, unknown> = {}
  const auditRefs: Array<{ id: string, weight: number }> = []
  const lcpScore = scoreMetric('lcp', lcp)
  const clsScore = scoreMetric('cls', cls)
  const inpScore = scoreMetric('inp', inp)

  if (lcp != null) {
    audits['largest-contentful-paint'] = {
      id: 'largest-contentful-paint',
      title: 'Largest Contentful Paint',
      description: 'LCP from CrUX field data (28-day p75).',
      score: lcpScore,
      scoreDisplayMode: 'numeric',
      numericValue: lcp,
      displayValue: `${(lcp / 1000).toFixed(2)} s`,
    }
    auditRefs.push({ id: 'largest-contentful-paint', weight: 25 })
  }
  if (cls != null) {
    audits['cumulative-layout-shift'] = {
      id: 'cumulative-layout-shift',
      title: 'Cumulative Layout Shift',
      description: 'CLS from CrUX field data (28-day p75).',
      score: clsScore,
      scoreDisplayMode: 'numeric',
      numericValue: cls,
      displayValue: cls.toFixed(3),
    }
    auditRefs.push({ id: 'cumulative-layout-shift', weight: 25 })
  }
  if (inp != null) {
    audits['interaction-to-next-paint'] = {
      id: 'interaction-to-next-paint',
      title: 'Interaction to Next Paint',
      description: 'INP from CrUX field data (28-day p75).',
      score: inpScore,
      scoreDisplayMode: 'numeric',
      numericValue: inp,
      displayValue: `${Math.round(inp)} ms`,
    }
    auditRefs.push({ id: 'interaction-to-next-paint', weight: 30 })
  }

  // Weighted-average performance score using the auditRef weights above.
  // Missing metrics drop out so a partial dataset scores the metrics it has.
  const scoredRefs = auditRefs
    .map(r => ({ weight: r.weight, score: (audits[r.id] as { score?: number | null } | undefined)?.score }))
    .filter(r => typeof r.score === 'number') as Array<{ weight: number, score: number }>
  const totalWeight = scoredRefs.reduce((a, r) => a + r.weight, 0)
  const perfScore = totalWeight > 0
    ? Math.round((scoredRefs.reduce((a, r) => a + r.weight * r.score, 0) / totalWeight) * 100) / 100
    : null

  return {
    requestedUrl: url,
    finalUrl: url,
    fetchTime: new Date().toISOString(),
    lighthouseVersion: '12.0.0',
    userAgent: `crux/${formFactor ?? 'PHONE'}`,
    categories: {
      performance: { id: 'performance', title: 'Performance', score: perfScore, auditRefs },
    },
    audits,
  }
}

function pickLatestEntry(history: NormalizedEntry[]): NormalizedEntry | undefined {
  if (!history.length)
    return undefined
  // History is chronological — last entry is the most recent 28-day window.
  return history[history.length - 1]
}

export function createCruxAuditor(opts: CruxAuditorOptions): Auditor {
  return {
    capabilities: CRUX_CAPABILITIES,
    async audit(url: string, _page?: Page, _auditOpts?: AuditOpts): Promise<LighthouseReport> {
      const series = await fetchCruxHistory({
        apiKey: opts.apiKey,
        origin: getSiteOrigin(url),
        formFactor: opts.formFactor,
      })
      // Materialise a NormalizedEntry-like view of the latest p75 across
      // all three metrics so the synthetic-LHR builder doesn't have to
      // know about the time-series shape.
      const lcpLast = series.lcp.at(-1)
      const clsLast = series.cls.at(-1)
      const inpLast = series.inp.at(-1)
      const latest: NormalizedEntry | undefined = (lcpLast || clsLast || inpLast)
        ? {
            date: new Date().toISOString(),
            lcp75: lcpLast?.value,
            cls75: clsLast?.value, // already CLS-units * 1000 from normaliseP75
            inp75: inpLast?.value,
          }
        : undefined
      const lhr = buildSyntheticLhr({ url, formFactor: opts.formFactor, latest })
      // Attach `lhrGzip` so core's ingest path writes the LHR blob + the
      // D-030 reconciled report. Without it, CrUX scans would persist row
      // data but no per-route blob, and packs that read getLhr/getReconciled
      // would see nothing.
      ;(lhr as Record<string, unknown>).lhrGzip = gzipSync(JSON.stringify(lhr))
      // Also pre-populate `extracted` so ingest writes real metric columns
      // (the same shape ExtractedMetrics expects). Without this, the row
      // ends up with all-null metric columns.
      ;(lhr as Record<string, unknown>).extracted = {
        url,
        path: new URL(url).pathname,
        routeName: null,
        scorePerformance: lhr.categories.performance.score,
        scoreAccessibility: null,
        scoreSeo: null,
        scoreBestPractices: null,
        lcp: latest?.lcp75 ?? null,
        cls: latest?.cls75 ?? null,
        inp: latest?.inp75 ?? null,
        fcp: null,
        ttfb: null,
        tbt: null,
        si: null,
        lighthouseVersion: '12.0.0',
        capturedAt: new Date().toISOString(),
      }
      // Keep the raw series accessible for dashboards / debug — packs
      // don't read it but the UI shows the time-series chart from it.
      ;(lhr as Record<string, unknown>)['crux-history'] = series
      return lhr as unknown as LighthouseReport
    },
  }
}
