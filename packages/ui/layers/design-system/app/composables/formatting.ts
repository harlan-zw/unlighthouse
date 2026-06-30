import type { ComputedRef, MaybeRef, Ref } from 'vue'
import { computed, isRef } from 'vue'
import { semanticColors } from './semanticColors'

// `Intl.*` constructors are expensive; hoist to module scope so per-cell
// formatters across large tables reuse one instance instead of allocating
// a new one on every call.
// Locale left as `undefined` so each formatter honours the runtime locale
// (cf. useChartTickPlan) rather than pinning to US English.
const compactNumberFormat = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })
// `narrowSymbol` keeps the "$" glyph (prices are USD) while still localising
// grouping/decimal separators, rather than degrading to the "USD" code in
// locales that disambiguate the dollar sign (e.g. en-AU).
const compactUsdFormat = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', notation: 'compact', maximumFractionDigits: 1 })
const usdFormat = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol' })
const sitemapDateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const relativeTimeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'narrow' })
const signedPercentFormat = new Intl.NumberFormat(undefined, { style: 'percent', signDisplay: 'exceptZero', minimumFractionDigits: 1, maximumFractionDigits: 1 })
const ctrPercentFormat = new Intl.NumberFormat(undefined, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })
const positionFormat = new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/**
 * Pure trend percentage between two values.
 * For metrics where lower is better (e.g. position), pass `invert: true`.
 * Returns 0 when prev is 0/null/undefined to avoid Infinity.
 */
export function calcTrendPercent(current: number, prev: number, invert = false): number {
  if (!prev)
    return 0
  const pct = Math.round(((current - prev) / prev) * 100) || 0
  return (invert ? -pct : pct) || 0
}

export function useProHumanFriendlyNumber(number: Ref<string | number>, decimals?: number): ComputedRef<string>
export function useProHumanFriendlyNumber(number: string | number, decimals?: number): string
export function useProHumanFriendlyNumber(number: MaybeRef<string | number | null | undefined>, decimals?: number) {
  const format = (number: number | null | undefined) => {
    if (!['number', 'string'].includes(typeof number))
      return '-'
    if (typeof decimals !== 'undefined')
      number = Number.parseFloat(Number(number).toFixed(decimals))
    return compactNumberFormat.format(Number(number))
  }
  if (isRef(number)) {
    return computed(() => {
      return format(Number(number.value))
    })
  }
  return format(Number(number))
}

export const useHumanFriendlyNumber = useProHumanFriendlyNumber

export function formatTimeAgo(timestamp: number | string | Date | null | undefined) {
  if (!timestamp)
    return null
  // A raw `number` may be unix SECONDS (our `mode:'timestamp'` columns) or unix
  // MILLISECONDS (the raw-`integer` audit columns — billingEvents / adminEvents /
  // loginEvents / runtimeErrors, ADR-0082). Disambiguate by magnitude: seconds for
  // any plausible date are < 1e11, ms are ≥ 1e12. Both render as the same instant.
  const date = typeof timestamp === 'number'
    ? new Date(timestamp < 1e11 ? timestamp * 1000 : timestamp)
    : new Date(timestamp)
  // Result is relative to the current time, so it differs between SSR and
  // client render — callers showing this in initial HTML should wrap it in
  // <ClientOnly> to avoid a hydration mismatch.
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1)
    return 'just now'
  if (minutes < 60)
    return relativeTimeFormat.format(-minutes, 'minute')
  if (hours < 24)
    return relativeTimeFormat.format(-hours, 'hour')
  if (days < 30)
    return relativeTimeFormat.format(-days, 'day')
  const months = Math.floor(days / 30)
  if (months < 12)
    return relativeTimeFormat.format(-months, 'month')
  return relativeTimeFormat.format(-Math.floor(days / 365), 'year')
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null)
    return '—'
  return compactNumberFormat.format(n)
}

export function formatCurrency(n: number | null | undefined): string {
  if (n == null)
    return '—'
  return compactUsdFormat.format(n)
}

// `n` is a percentage-point value (e.g. 5 → "+5.0%"), so divide before the
// percent formatter (which multiplies by 100).
export function formatPercent(n: number): string {
  return signedPercentFormat.format(n / 100)
}

export function formatCurrencyFromCents(cents: number | null | undefined): string {
  if (cents == null)
    return '—'
  return usdFormat.format(cents / 100)
}

// GSC metric formatter (replaces duplicated fmtMetric across SC pages)
export function fmtGscMetric(val: number, metric: string): string {
  if (metric === 'ctr')
    return ctrPercentFormat.format(val)
  if (metric === 'position')
    return positionFormat.format(val)
  return formatNumber(val)
}

// Color utilities
export function getDifficultyColor(d: number | null): string {
  if (d == null)
    return 'bg-accented text-muted'
  if (d <= 30)
    return 'bg-success/10 text-success'
  if (d <= 60)
    return 'bg-warning/10 text-warning'
  return 'bg-error/10 text-error'
}

export function getDifficultyInfo(kd: number | null): { label: string, color: string, bg: string, description: string } {
  if (kd === null)
    return { label: '—', color: 'text-muted', bg: 'bg-accented', description: 'No difficulty data' }
  if (kd <= 20)
    return { label: 'Easy', color: 'text-success', bg: 'bg-success/15', description: 'Low competition – great opportunity' }
  if (kd <= 40)
    return { label: 'Low', color: 'text-success', bg: 'bg-success/15', description: 'Achievable with quality content' }
  if (kd <= 60)
    return { label: 'Medium', color: 'text-warning', bg: 'bg-warning/15', description: 'Needs strong content + backlinks' }
  if (kd <= 80)
    return { label: 'Hard', color: 'text-warning', bg: 'bg-warning/15', description: 'Requires niche authority' }
  return { label: 'Very Hard', color: 'text-error', bg: 'bg-error/15', description: 'Dominated by major sites' }
}

export function getDomainRankColor(rank: number | null | undefined): string {
  if (!rank)
    return 'text-muted'
  if (rank >= 70)
    return 'text-success'
  if (rank >= 40)
    return 'text-warning'
  return 'text-error'
}

export function trendColor(change: number | null): string {
  if (!change)
    return semanticColors.neutral.hex
  return change > 0 ? semanticColors.success.hex : semanticColors.error.hex
}

// URL/path helpers
export function getPath(url: string): string {
  if (!url?.startsWith('http'))
    return url || '/'
  return new URL(url).pathname || '/'
}

export function getSitemapName(path: string): string {
  try {
    return new URL(path).pathname || path
  }
  catch {
    return path
  }
}

export function formatSitemapDate(dateStr: string | null | undefined): string {
  if (!dateStr)
    return 'Never'
  return sitemapDateFormat.format(new Date(dateStr))
}

// --- Reporting-day buckets (GSC/analytics daily rows keyed "YYYY-MM-DD") ---
// These are calendar-day LABELS owned by the data source (GSC buckets in Pacific
// Time), not instants. We never shift them into the viewer's timezone — doing so
// is the off-by-one-day bug. Parse in a fixed UTC frame so the round-trip is
// identity, and ALWAYS format with `timeZone: 'UTC'` so the label never drifts.
// See ADR-0082. The `Z`/UTC here is a neutral frame for an opaque label, not a
// claim that the data is UTC.
const reportingDayFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })

/** Parse a "YYYY-MM-DD" reporting-day label into a stable, viewer-independent Date. */
export function parseReportingDay(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}

/**
 * Format a "YYYY-MM-DD" reporting-day label. Defaults to "Jun 24"; pass `opts` for
 * other shapes — `timeZone: 'UTC'` is forced so the label can't drift per viewer.
 */
export function formatReportingDay(iso: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso)
    return '—'
  if (opts)
    return new Intl.DateTimeFormat(undefined, { ...opts, timeZone: 'UTC' }).format(parseReportingDay(iso))
  return reportingDayFormat.format(parseReportingDay(iso))
}
