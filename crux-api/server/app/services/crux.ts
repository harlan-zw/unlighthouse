import type { FetchError } from 'ofetch'
import { useRuntimeConfig } from '#imports'
import { $fetch } from 'ofetch'
import { withHttps, withTrailingSlash } from 'ufo'
import { incrementUsage } from './usage'

type cwvKeys = [
  'largest_contentful_paint',
  'cumulative_layout_shift',
  'interaction_to_next_paint',
]

export async function fetchCrux(domain: string, formFactor: 'PHONE' | 'TABLET' | 'DESKTOP' = 'PHONE') {
  const origin = withTrailingSlash(withHttps(domain))
  incrementUsage()
  const results = await $fetch(`/records:queryHistoryRecord`, {
    baseURL: 'https://chromeuxreport.googleapis.com/v1',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    query: {
      key: useRuntimeConfig().google.cruxApiToken,
    },
    body: {
      origin,
      formFactor,
    },
  }).catch((e: FetchError) => {
    // 404 is okay, it just means there's no data for this domain
    if (e.status === 404)
      return { exists: false }
    throw e
  })

  if (!results || results.exists === false)
    return results

  const normalised = normaliseCruxHistory(results.record)
  // there was data but it was all empty?
  if (!normalised.dates.length)
    return { exists: false }
  return normalised
}
interface CrUXHistoryResult {
  key: {
    formFactor: 'PHONE' | 'DESKTOP' | 'TABLET'
    origin: string
  }
  metrics: {
    [key in cwvKeys[number]]: {
      histogramTimeseries: Array<{
        start: number | string
        end?: number | string
        densities: number[]
      }>
      percentilesTimeseries: {
        p75s: (number | null)[]
      }
    }
  }
  collectionPeriods: Array<{
    firstDate: {
      year: number
      month: number
      day: number
    }
    lastDate: {
      year: number
      month: number
      day: number
    }
  }>
}

interface NormalizedCrUXHistoryResult {
}

function normaliseCruxHistory(data: CrUXHistoryResult): NormalizedCrUXHistoryResult {
  // we need to turn it into a time series data where we have each metric seperated into
  // an array like { value: number, time: number }[]
  // we also need to make sure that the data is sorted by time
  const { cumulative_layout_shift, largest_contentful_paint, interaction_to_next_paint } = data.metrics
  const dates = data.collectionPeriods.map(period => new Date(period.firstDate.year, period.firstDate.month, period.firstDate.day).getTime())
  function normaliseP75(segment, i) {
    // we should use the p75s data as the value
    return {
      value: Number.parseFloat(segment) || 0,
      time: dates[i],
    }
  }
  const cls = (cumulative_layout_shift?.percentilesTimeseries?.p75s || []).map(normaliseP75)
  const lcp = (largest_contentful_paint?.percentilesTimeseries?.p75s || []).map(normaliseP75)
  const inp = (interaction_to_next_paint?.percentilesTimeseries?.p75s || []).map(normaliseP75)

  const clsStart = cls.findIndex(v => v.value >= 0)
  const lcpStart = lcp.findIndex(v => v.value > 0)
  const inpStart = inp.findIndex(v => v.value > 0)
  const indexes = [
    clsStart,
    lcpStart,
    inpStart,
  ].filter(i => i > -1)
  if (!indexes.length)
    return { dates: [], cls: [], lcp: [], inp: [] }

  // we need to compute the first index that we'll start the data from
  // this index is the first index that has a value for all three data types above
  const start = Math.min(...indexes)
  // end should be the last index of a value greater than 0
  const end = Math.max(cls.findLastIndex(v => v.value >= 0), lcp.findLastIndex(v => v.value > 0), inp.findLastIndex(v => v.value > 0))

  return {
    dates: dates.slice(start, end),
    cls: clsStart !== -1 ? cls.slice(start, end) : undefined,
    lcp: lcpStart !== -1 ? lcp.slice(start, end) : undefined,
    inp: inpStart !== -1 ? inp.slice(start, end) : undefined,
  }
}
