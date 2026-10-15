import type { Metric } from '../types.ts'

export function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function roundScore(value: number): number {
  return round(value, 2)
}

export function roundMetric(metric: Metric, value: number): number {
  return metric === 'cls' ? round(value, 3) : Math.round(value)
}

export function mean(values: number[]): number | null {
  if (values.length === 0)
    return null
  let sum = 0
  for (const value of values)
    sum += value
  return sum / values.length
}

export function median(values: number[]): number | null {
  if (values.length === 0)
    return null
  const sorted = values.toSorted((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0)
    return null
  const sorted = values.toSorted((a, b) => a - b)
  const rank = Math.max(1, Math.ceil(p * sorted.length))
  return sorted[rank - 1]!
}

export function present<T>(values: Array<T | null>): T[] {
  return values.filter((value): value is T => value !== null)
}
