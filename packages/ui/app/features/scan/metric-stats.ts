// Percentile + summary stats for a metric across a scan's routes. Mirrors the
// linear-interpolation percentile the cwv pack uses (PageSpeed/CrUX convention)
// so the dashboard's p75 matches the backend's.

function percentile(sortedAsc: number[], p: number): number | null {
  if (!sortedAsc.length)
    return null
  const pos = (sortedAsc.length - 1) * p
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  const a = sortedAsc[lo]
  const b = sortedAsc[hi]
  if (a == null || b == null)
    return null
  return lo === hi ? a : a + (b - a) * (pos - lo)
}

interface MetricStats {
  count: number
  min: number
  max: number
  avg: number
  median: number
  p75: number
  p95: number
  /** Sorted ascending — handy for histograms. */
  sorted: number[]
}

export function metricStats(values: Array<number | null | undefined>): MetricStats | null {
  const nums = values.filter((v): v is number => typeof v === 'number').sort((a, b) => a - b)
  if (!nums.length)
    return null
  const min = nums[0]
  const max = nums.at(-1)
  const median = percentile(nums, 0.5)
  const p75 = percentile(nums, 0.75)
  const p95 = percentile(nums, 0.95)
  if (min === undefined || max === undefined || median === null || p75 === null || p95 === null)
    return null
  const sum = nums.reduce((a, b) => a + b, 0)
  return {
    count: nums.length,
    min,
    max,
    avg: sum / nums.length,
    median,
    p75,
    p95,
    sorted: nums,
  }
}
