import { performanceSourceLabel } from '../scan/pack-presentation'

export interface TrendObservation {
  t: number
  v: number | null
}

export interface TrendObservationSeries {
  points: TrendObservation[]
}

export function hasMeaningfulTrend(points: TrendObservation[]): boolean {
  return new Set(points.filter(point => point.v !== null).map(point => point.t)).size >= 2
}

export function hasMeaningfulTrendSeries(series: TrendObservationSeries[]): boolean {
  return series.some(item => hasMeaningfulTrend(item.points))
}
export function performanceTrendSeries(label: string, color: string, observations: Array<TrendObservation & { source: string }>) {
  return [...new Set(observations.filter(point => point.v !== null).map(point => point.source))].map(source => ({
    label: `${label} · ${performanceSourceLabel(source)}`,
    color,
    points: observations.map(point => ({ t: point.t, v: point.source === source ? point.v : null })),
  }))
}
