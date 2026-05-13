import type { Logger } from '@unlighthouse/contracts'
import type { AuditOpts, Auditor, AuditorCapabilities, LighthouseReport, Page } from '@unlighthouse/contracts/ports'

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

export function createCruxAuditor(opts: CruxAuditorOptions): Auditor {
  return {
    capabilities: CRUX_CAPABILITIES,
    async audit(url: string, _page?: Page, _auditOpts?: AuditOpts): Promise<LighthouseReport> {
      // CrUX is field-data history, not a per-URL lab audit. We pack the series
      // into the report's `audits` map so downstream extract code can lift it.
      // @TODO v1.6: produce real LighthouseReport via report/extract pipeline (or split CrUX out into a non-Auditor port).
      const series = await fetchCruxHistory({
        apiKey: opts.apiKey,
        origin: getSiteOrigin(url),
        formFactor: opts.formFactor,
      })
      return {
        requestedUrl: url,
        finalUrl: url,
        fetchTime: new Date().toISOString(),
        score: 0,
        categories: [],
        audits: { 'crux-history': { numericValue: 0, details: series } as any },
        computed: {
          imageIssues: { displayValue: '', score: 1 } as any,
          ariaIssues: { displayValue: '', score: 1 } as any,
        },
      } as unknown as LighthouseReport
    },
  }
}
