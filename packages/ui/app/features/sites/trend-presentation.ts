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
