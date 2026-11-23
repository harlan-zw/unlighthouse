import type { ScanSummary } from '../analysis/summary.ts'
import type { Category, Device } from '../types.ts'

export function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

export function categoryMedian(summary: ScanSummary | undefined, category: Category, device: Device | null): number | null {
  if (!summary)
    return null
  const values: number[] = []
  for (const entry of summary.devices) {
    const value = entry.scores.median[category]
    if ((device === null || entry.device === device) && value !== undefined)
      values.push(value)
  }
  return average(values)
}
