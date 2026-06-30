// Single source for rendering a metric value as a human string. The ms/s rule
// below was copy-pasted across the route table, route detail, CrUX, and sites
// metric cards (with toFixed drift); centralise it here so a tweak lands once.

/** ms metric → `1.2s` (>= 1000ms) or `840ms`. null/undefined → em-dash. */
export function formatMs(value: number | null | undefined): string {
  if (value == null)
    return '—'
  if (value >= 1000)
    return `${(value / 1000).toFixed(1)}s`
  return `${Math.round(value)}ms`
}

/** Metric by unit: `'ms'` uses formatMs; `''` (unitless, e.g. CLS) → 3 dp. */
export function formatMetricValue(value: number | null | undefined, unit: 'ms' | '' = 'ms'): string {
  if (value == null)
    return '—'
  return unit === 'ms' ? formatMs(value) : value.toFixed(3)
}
