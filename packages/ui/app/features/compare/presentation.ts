import type { CompareRouteRow } from '@unlighthouse/contracts'

// Every CompareMetric.key is a real key of the per-route metrics object, so
// reads (`row.current?.[key]`) index it directly without a cast.
export type MetricKey = keyof CompareRouteRow['deltas']

interface CompareMetric {
  key: MetricKey
  label: string
  score: boolean
  thresholdKey: string
  hint?: string
}

interface RowScoreCell {
  value: string
  klass: string
  mutedByThreshold: boolean
}

type BadgeTone = 'destructive' | 'default' | 'secondary' | 'outline'

const DEFAULT_THRESHOLDS: Record<string, number> = {
  'performance': 0.05,
  'accessibility': 0.05,
  'seo': 0.05,
  'best-practices': 0.05,
  'lcp': 500,
  'cls': 0.1,
  'inp': 200,
  'fcp': 300,
  'tbt': 200,
  'ttfb': 200,
  'si': 500,
}

export const SHORT_LABEL: Record<string, string> = {
  scorePerformance: 'Perf',
  scoreAccessibility: 'A11y',
  scoreSeo: 'SEO',
  scoreBestPractices: 'BP',
}

export const CATEGORY_METRICS: CompareMetric[] = [
  { key: 'scorePerformance', label: 'Performance', score: true, thresholdKey: 'performance' },
  { key: 'scoreAccessibility', label: 'Accessibility', score: true, thresholdKey: 'accessibility' },
  { key: 'scoreSeo', label: 'SEO', score: true, thresholdKey: 'seo' },
  { key: 'scoreBestPractices', label: 'Best Practices', score: true, thresholdKey: 'best-practices' },
]

export const CWV_METRICS: CompareMetric[] = [
  { key: 'lcp', label: 'LCP', score: false, thresholdKey: 'lcp', hint: 'Largest Contentful Paint — when the main content paints. Good < 2.5s.' },
  { key: 'cls', label: 'CLS', score: false, thresholdKey: 'cls', hint: 'Cumulative Layout Shift — visual stability. Good < 0.1.' },
  { key: 'inp', label: 'INP', score: false, thresholdKey: 'inp', hint: 'Interaction to Next Paint — responsiveness. Good < 200ms.' },
]

export const DIAGNOSTIC_METRICS: CompareMetric[] = [
  { key: 'fcp', label: 'FCP', score: false, thresholdKey: 'fcp', hint: 'First Contentful Paint — useful for triage when LCP regressed.' },
  { key: 'tbt', label: 'TBT', score: false, thresholdKey: 'tbt', hint: 'Total Blocking Time — lab-only INP precursor.' },
  { key: 'ttfb', label: 'TTFB', score: false, thresholdKey: 'ttfb', hint: 'Time to First Byte — server-side signal.' },
  { key: 'si', label: 'SI', score: false, thresholdKey: 'si', hint: 'Speed Index — deprecated by Google, still in LH scoring.' },
]

export const SORT_OPTIONS = [
  { value: 'delta-perf-desc', label: 'Perf Δ (worst first)' },
  { value: 'delta-perf-asc', label: 'Perf Δ (best first)' },
  { value: 'delta-a11y-desc', label: 'A11y Δ (worst first)' },
  { value: 'delta-seo-desc', label: 'SEO Δ (worst first)' },
  { value: 'delta-bp-desc', label: 'BP Δ (worst first)' },
  { value: 'delta-lcp-desc', label: 'LCP Δ (slowest)' },
  { value: 'delta-cls-desc', label: 'CLS Δ (worst)' },
  { value: 'url-asc', label: 'URL (A-Z)' },
]

export function fmtCwvP75(metric: string, value: number | null): string {
  if (value == null)
    return '—'
  if (metric === 'cls')
    return value.toFixed(3)
  if (metric === 'lcp' || metric === 'inp' || metric === 'fcp' || metric === 'ttfb') {
    if (value >= 1000)
      return `${(value / 1000).toFixed(2)}s`
    return `${Math.round(value)}ms`
  }
  return String(Math.round(value))
}

export function cwvVerdictColor(verdict: string | null): string {
  if (verdict === 'good')
    return 'text-success'
  if (verdict === 'needs-improvement' || verdict === 'needsImprovement')
    return 'text-warning'
  if (verdict === 'poor')
    return 'text-error'
  return 'text-muted'
}

export function statusBadge(status: string): BadgeTone {
  if (status === 'regressed')
    return 'destructive'
  if (status === 'improved')
    return 'default'
  if (status === 'added')
    return 'secondary'
  return 'outline'
}

// Map the legacy shadcn badge tone vocabulary onto Nuxt UI's color+variant
// pair, so status rows and verdict summaries share one translation point.
export function badgeProps(tone: string) {
  switch (tone) {
    case 'destructive': return { color: 'error' as const, variant: 'soft' as const }
    case 'default': return { color: 'primary' as const, variant: 'soft' as const }
    case 'secondary': return { color: 'neutral' as const, variant: 'soft' as const }
    default: return { color: 'neutral' as const, variant: 'outline' as const }
  }
}

export function deltaClass(value: number | null | undefined, isScore: boolean): string {
  if (value == null || value === 0)
    return 'text-muted'
  if (isScore)
    return value > 0 ? 'text-success' : 'text-error'
  return value < 0 ? 'text-success' : 'text-error'
}

function effectiveThreshold(thresholds: Record<string, string>, key: string): number | null {
  const userValue = thresholds[key]
  if (userValue && userValue.trim() !== '') {
    const parsed = Number.parseFloat(userValue)
    if (!Number.isNaN(parsed))
      return parsed
  }
  return DEFAULT_THRESHOLDS[key] ?? null
}

export function createComparePresentation(deps: {
  thresholds: Record<string, string>
  fmtScore: (value: number | null | undefined) => string | number
  fmtDelta: (value: number | null | undefined, isScore: boolean) => string
}) {
  function deltaClassWithThreshold(value: number | null | undefined, isScore: boolean, thresholdKey: string): { klass: string, mutedByThreshold: boolean } {
    if (value == null || value === 0)
      return { klass: 'text-muted', mutedByThreshold: false }
    const threshold = effectiveThreshold(deps.thresholds, thresholdKey)
    if (threshold != null && Math.abs(value) <= threshold)
      return { klass: 'text-muted/70', mutedByThreshold: true }
    return { klass: deltaClass(value, isScore), mutedByThreshold: false }
  }

  function rowScoreCell(row: CompareRouteRow, key: MetricKey, thresholdKey: string): RowScoreCell {
    if (row.status === 'added')
      return { value: String(deps.fmtScore(row.current?.[key])), klass: 'text-info', mutedByThreshold: false }
    if (row.status === 'removed')
      return { value: String(deps.fmtScore(row.base?.[key])), klass: 'text-warning', mutedByThreshold: false }
    const delta = row.deltas?.[key]
    if (delta != null && delta !== 0) {
      const { klass, mutedByThreshold } = deltaClassWithThreshold(delta, true, thresholdKey)
      return { value: deps.fmtDelta(delta, true), klass, mutedByThreshold }
    }
    return { value: String(deps.fmtScore(row.current?.[key])), klass: 'text-muted', mutedByThreshold: false }
  }

  return {
    deltaClassWithThreshold,
    rowScoreCell,
  }
}

export function compareRowKey(row: { url: string, device: string }): string {
  return `${row.url}|${row.device}`
}
