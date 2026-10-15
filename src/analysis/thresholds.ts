import type { Device, Metric } from '../types.ts'

export type Rating = 'good' | 'needs-improvement' | 'poor'
export type ScoreBand = 'good' | 'average' | 'poor'

export interface MetricThreshold {
  good: number
  poor: number
}

const CORE = {
  lcp: { good: 2500, poor: 4000 },
  fcp: { good: 1800, poor: 3000 },
  cls: { good: 0.1, poor: 0.25 },
  ttfb: { good: 800, poor: 1800 },
} as const satisfies Partial<Record<Metric, MetricThreshold>>

export const METRIC_THRESHOLDS: Record<Device, Record<Metric, MetricThreshold>> = {
  mobile: { ...CORE, tbt: { good: 200, poor: 600 }, si: { good: 3387, poor: 5800 } },
  desktop: { ...CORE, tbt: { good: 150, poor: 350 }, si: { good: 1311, poor: 2300 } },
}

export const SCORE_BANDS = { good: 0.9, average: 0.5 } as const

export const RELIABILITY = {
  minBenchmarkIndex: 1000,
  maxSpread: 0.1,
} as const

export function rateMetric(metric: Metric, value: number, device: Device = 'mobile'): Rating {
  const threshold = METRIC_THRESHOLDS[device][metric]
  if (value <= threshold.good)
    return 'good'
  return value <= threshold.poor ? 'needs-improvement' : 'poor'
}

export function scoreBand(score: number): ScoreBand {
  if (score >= SCORE_BANDS.good)
    return 'good'
  return score >= SCORE_BANDS.average ? 'average' : 'poor'
}
