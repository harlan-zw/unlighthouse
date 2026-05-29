import type { MaybeRefOrGetter } from 'vue'
import { computed, toValue } from 'vue'

// Calendar-aware tick planning for time-series charts. Picks tick positions +
// label format based on the span:
//   ≤ 10 days   → every day, "Mon 12"
//   ≤ 35 days   → ~5 evenly-spaced ticks, "Jan 12"
//   ≤ 120 days  → every ~2 weeks (aligned to data), "Jan 12"
//   > 120 days  → first-of-month ticks, "Jan"; year suffix on Jan/first when span spans years
// Extracted from ProGraphGsc / ProGraphAnalytics / GraphIndexing, which had
// identical copies of this logic.

export interface ChartTickPlan {
  indices: number[]
  format: (date: Date, i: number, firstYear: number) => string
}

export interface UseChartTickPlanOptions {
  /** Reactive ISO date strings (one per data point). */
  dates: MaybeRefOrGetter<string[]>
  /** Cap on tick count for long spans (default 14 — thins to ~12 if exceeded). */
  maxTicks?: number
}

const weekdayDayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric' })
const monthDayFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'short' })
const monthYearFmt = new Intl.DateTimeFormat(undefined, { month: 'short', year: '2-digit' })

export function useChartTickPlan(opts: UseChartTickPlanOptions) {
  const maxTicks = opts.maxTicks ?? 14

  const tickPlan = computed<ChartTickPlan>(() => {
    const dates = toValue(opts.dates)
    const len = dates.length
    if (len <= 1)
      return { indices: [0], format: d => monthDayFmt.format(d) }
    if (len <= 10)
      return { indices: dates.map((_, i) => i), format: d => weekdayDayFmt.format(d) }
    if (len <= 35) {
      const step = Math.max(1, Math.ceil(len / 5))
      const indices: number[] = []
      for (let i = 0; i < len; i += step) indices.push(i)
      if (indices[indices.length - 1] !== len - 1)
        indices.push(len - 1)
      return { indices, format: d => monthDayFmt.format(d) }
    }
    if (len <= 120) {
      // Anchor at index 0 (chart left edge) and step by 14 days. Earlier
      // Monday-snap variant pushed the first tick rightward, leaving the
      // leftmost label visually detached from the data start.
      const indices: number[] = []
      for (let i = 0; i < len; i += 14) indices.push(i)
      return { indices, format: d => monthDayFmt.format(d) }
    }

    // Long span: first-of-month ticks.
    const indices: number[] = []
    let lastMonth = ''
    for (let i = 0; i < len; i++) {
      const m = dates[i]?.slice(0, 7) ?? ''
      if (m !== lastMonth) {
        indices.push(i)
        lastMonth = m
      }
    }
    if (indices.length < 2)
      return { indices: [0, Math.floor(len / 2), len - 1], format: d => monthDayFmt.format(d) }
    // Drop the first tick if the second is within 5 days — happens when the
    // series starts late in a month and the next month's first-of-month tick
    // would render right on top of it.
    if (indices.length > 2 && indices[1]! - indices[0]! < 5)
      indices.shift()

    // Thin out at very long spans so the axis doesn't crowd.
    if (indices.length > maxTicks) {
      const keep = Math.ceil(indices.length / 12)
      return {
        indices: indices.filter((_, i) => i % keep === 0),
        format: (d, i, firstYear) => (d.getMonth() === 0 || i === 0) && d.getFullYear() !== firstYear
          ? monthYearFmt.format(d)
          : monthFmt.format(d),
      }
    }
    return {
      indices,
      format: (d, i, _firstYear) => (d.getMonth() === 0 && i > 0) || (i === 0 && d.getMonth() !== 0 && indices.length > 6)
        ? monthYearFmt.format(d)
        : monthFmt.format(d),
    }
  })

  const firstTickYear = computed(() => {
    const dates = toValue(opts.dates)
    const first = tickPlan.value.indices[0]
    if (first == null || !dates[first])
      return new Date().getFullYear()
    return Number(dates[first]!.slice(0, 4))
  })

  /** Use as Unovis `tickFormat` for an x-axis indexed by row position. */
  function tickFormat(d: number): string {
    const dates = toValue(opts.dates)
    const idx = Math.round(d)
    const date = dates[idx]
    if (!date)
      return ''
    const tickIdx = tickPlan.value.indices.indexOf(idx)
    return tickPlan.value.format(new Date(`${date}T00:00:00`), tickIdx, firstTickYear.value)
  }

  return { tickPlan, firstTickYear, tickFormat }
}
