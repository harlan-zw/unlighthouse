// Lighthouse scoring domain rules — the single source for the two numbers that
// were previously copy-pasted across the scan, compare, and dashboard features:
// the score bands (Google's canonical 0–0.49 poor / 0.5–0.89 average / 0.9–1
// good) and the Core Web Vitals good/poor boundaries. Consumers map a band onto
// a colour/label/counter; nobody re-encodes the thresholds.
//
// NOTE: this is *verdict* banding, distinct from compare/presentation.ts's
// thresholds, which size a *significant delta* between two scans (e.g. lcp:500
// = "a 500ms change is worth flagging"). Different concept — don't merge them.

export type ScoreBand = 'good' | 'average' | 'poor'

/** Lighthouse 0–1 score → band. `>= 0.9` good, `>= 0.5` average, else poor. */
export function scoreBand(score: number | null | undefined): ScoreBand | null {
  if (score == null)
    return null
  if (score >= 0.9)
    return 'good'
  if (score >= 0.5)
    return 'average'
  return 'poor'
}

/** Core Web Vitals `[good, poor]` boundaries, keyed by lowercase metric id. */
export const CWV_THRESHOLDS = {
  lcp: [2500, 4000],
  cls: [0.1, 0.25],
  fcp: [1800, 3000],
  tbt: [200, 600],
  ttfb: [800, 1800],
  si: [3400, 5800],
  inp: [200, 500],
} as const satisfies Record<string, readonly [number, number]>

export type CwvMetric = keyof typeof CWV_THRESHOLDS

/**
 * Classify a lower-is-better value against explicit `[good, poor]` bounds:
 * `<= good` good, `<= poor` average, else poor. null value → null band.
 */
export function bandFromBounds(value: number | null | undefined, good: number, poor: number): ScoreBand | null {
  if (value == null)
    return null
  if (value <= good)
    return 'good'
  if (value <= poor)
    return 'average'
  return 'poor'
}

/**
 * Core Web Vitals value → band (lower is better). Accepts any-case metric id;
 * returns null for an unknown metric or a null value so callers render neutral.
 */
export function cwvBand(metric: string, value: number | null | undefined): ScoreBand | null {
  const bounds = (CWV_THRESHOLDS as Record<string, readonly [number, number]>)[metric.toLowerCase()]
  if (!bounds)
    return null
  return bandFromBounds(value, bounds[0], bounds[1])
}
