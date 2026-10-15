import type { FieldResult, Store } from '../contracts.ts'
import type { Device, FieldMetric, FieldRecord, FieldSource, FieldTrend } from '../types.ts'
import { FIELD_METRICS } from '../types.ts'

export const CRUX_BASE_URL = 'https://chromeuxreport.googleapis.com/v1'
export const CRUX_TTL_MS = 24 * 60 * 60 * 1000

const FORM_FACTORS: Record<Device, FieldRecord['formFactor']> = { mobile: 'PHONE', desktop: 'DESKTOP' }

const METRIC_NAMES: Record<FieldMetric, string> = {
  lcp: 'largest_contentful_paint',
  inp: 'interaction_to_next_paint',
  cls: 'cumulative_layout_shift',
  fcp: 'first_contentful_paint',
  ttfb: 'experimental_time_to_first_byte',
}

const HISTORY_PERIODS = 25
const MAX_WAIT_MS = 60_000
const REQUEST_TIMEOUT_MS = 30_000

export interface CruxOptions {
  apiKey: string
  store: Pick<Store, 'cruxCacheGet' | 'cruxCachePut'>
  baseUrl?: string
  fetch?: typeof fetch
  signal?: AbortSignal
  maxRetries?: number
  backoffMs?: number
  timeoutMs?: number
  concurrency?: number
  onWarn?: (message: string) => void
}

export interface FieldQuery {
  origin: string
  devices: Device[]
  pages: Array<{ url: string, device: Device }>
  history?: boolean
}

type Target = { url: string } | { origin: string }
type Kind = 'record' | 'history'

interface RawDate { year?: number, month?: number, day?: number }

interface RawMetric {
  histogram?: Array<{ density?: number | string }>
  percentiles?: { p75?: number | string | null }
  percentilesTimeseries?: { p75s?: Array<number | string | null> }
}

interface RawRecord {
  key?: { url?: string, origin?: string }
  metrics?: Record<string, RawMetric>
  collectionPeriod?: { firstDate?: RawDate, lastDate?: RawDate }
  collectionPeriods?: Array<{ firstDate?: RawDate, lastDate?: RawDate }>
}

function isoDate(date: RawDate | undefined): string {
  const pad = (value: number | undefined, size: number) => String(value ?? 0).padStart(size, '0')
  return `${pad(date?.year, 4)}-${pad(date?.month, 2)}-${pad(date?.day, 2)}`
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '')
    return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function density(metric: RawMetric, index: number): number {
  return Math.round((numberOrNull(metric.histogram?.[index]?.density) ?? 0) * 10_000) / 10_000
}

export function toFieldRecord(raw: RawRecord, formFactor: FieldRecord['formFactor']): FieldRecord {
  const metrics: FieldRecord['metrics'] = {}
  for (const metric of FIELD_METRICS) {
    const value = raw.metrics?.[METRIC_NAMES[metric]]
    const p75 = numberOrNull(value?.percentiles?.p75)
    if (!value || p75 === null)
      continue
    metrics[metric] = { p75, histogram: { good: density(value, 0), needsImprovement: density(value, 1), poor: density(value, 2) } }
  }
  const period = raw.collectionPeriod
  return {
    key: raw.key?.url ?? raw.key?.origin ?? '',
    formFactor,
    metrics,
    period: period ? { first: isoDate(period.firstDate), last: isoDate(period.lastDate) } : null,
  }
}

export function toFieldTrend(raw: RawRecord): FieldTrend {
  const p75: FieldTrend['p75'] = {}
  for (const metric of FIELD_METRICS) {
    const series = raw.metrics?.[METRIC_NAMES[metric]]?.percentilesTimeseries?.p75s
    if (series)
      p75[metric] = series.map(numberOrNull)
  }
  return { periods: (raw.collectionPeriods ?? []).map(period => isoDate(period.lastDate)), p75 }
}

function abortable(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal!.reason)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export function createCruxClient(options: CruxOptions) {
  const base = (options.baseUrl ?? CRUX_BASE_URL).replace(/\/+$/, '')
  const doFetch = options.fetch ?? fetch
  const maxRetries = options.maxRetries ?? 3
  const backoffMs = options.backoffMs ?? 1000
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS
  const warned = new Set<string>()
  let stopped: string | null = null

  function warn(message: string): void {
    if (warned.has(message))
      return
    warned.add(message)
    options.onWarn?.(message)
  }

  async function query(kind: Kind, target: Target, formFactor: FieldRecord['formFactor']): Promise<RawRecord | null | undefined> {
    const name = 'url' in target ? `url:${target.url}` : `origin:${target.origin}`
    const cacheKey = `${kind}:${formFactor}:${name}`
    const cached = options.store.cruxCacheGet(cacheKey, CRUX_TTL_MS)
    if (cached)
      return cached.value as RawRecord | null
    if (stopped)
      return undefined
    const method = kind === 'record' ? 'queryRecord' : 'queryHistoryRecord'
    const body = {
      ...target,
      formFactor,
      metrics: FIELD_METRICS.map(metric => METRIC_NAMES[metric]),
      ...(kind === 'history' ? { collectionPeriodCount: HISTORY_PERIODS } : {}),
    }
    for (let attempt = 0; ; attempt++) {
      options.signal?.throwIfAborted()
      const signal = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(options.signal ? [options.signal] : [])])
      let response: Response
      let json: { record?: RawRecord } | null = null
      try {
        response = await doFetch(`${base}/records:${method}?key=${encodeURIComponent(options.apiKey)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal,
        })
        if (response.ok)
          json = await response.json() as { record?: RawRecord }
      }
      catch (error) {
        if (options.signal?.aborted)
          throw error
        if (signal.aborted) {
          stopped = `CrUX API did not answer within ${timeoutMs} ms; remaining field data was skipped`
          warn(stopped)
          return undefined
        }
        warn(`CrUX API unreachable: ${error instanceof Error ? error.message : String(error)}`)
        return undefined
      }
      if (response.status === 404) {
        options.store.cruxCachePut(cacheKey, null)
        return null
      }
      if (json) {
        const record = json.record ?? null
        options.store.cruxCachePut(cacheKey, record)
        return record
      }
      const retryable = response.status === 429 || response.status >= 500
      if (!retryable || attempt >= maxRetries) {
        if (response.status === 429 || response.status === 400 || response.status === 401 || response.status === 403) {
          stopped = response.status === 429
            ? 'CrUX API quota exhausted (HTTP 429); remaining field data was skipped'
            : `CrUX API refused the key (HTTP ${response.status}); check the API key and that the Chrome UX Report API is enabled`
          warn(stopped)
        }
        else {
          warn(`CrUX API answered HTTP ${response.status}; some field data is missing`)
        }
        return undefined
      }
      const retryAfter = numberOrNull(response.headers.get('retry-after'))
      const wait = retryAfter !== null ? retryAfter * 1000 : backoffMs * 2 ** attempt
      await abortable(Math.min(MAX_WAIT_MS, wait), options.signal)
    }
  }

  return { query }
}

async function eachLimited<T>(items: T[], limit: number, run: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length)
      await run(items[next++]!)
  }))
}

export async function collectField(input: FieldQuery, options: CruxOptions): Promise<FieldResult> {
  const client = createCruxClient(options)
  const origin: FieldResult['origin'] = {}
  for (const device of input.devices) {
    const formFactor = FORM_FACTORS[device]
    const raw = await client.query('record', { origin: input.origin }, formFactor)
    const record = raw ? toFieldRecord(raw, formFactor) : null
    if (record && input.history) {
      const history = await client.query('history', { origin: input.origin }, formFactor)
      if (history)
        record.trend = toFieldTrend(history)
    }
    origin[device] = record
  }
  const pages: FieldResult['pages'] = []
  await eachLimited(input.pages, options.concurrency ?? 4, async (page) => {
    const originRecord = origin[page.device] ?? null
    if (!originRecord) {
      pages.push({ url: page.url, device: page.device, source: null, record: null })
      return
    }
    const formFactor = FORM_FACTORS[page.device]
    const raw = await client.query('record', { url: page.url }, formFactor)
    const source: FieldSource = raw ? 'url' : 'origin'
    pages.push({ url: page.url, device: page.device, source, record: raw ? toFieldRecord(raw, formFactor) : originRecord })
  })
  return { origin, pages }
}
