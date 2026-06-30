import { semanticColors } from './semanticColors'

/**
 * Data-viz palette — chart-only colours, distinct from semantic status colours.
 *
 * Hex literals (rather than `var(--ui-color-*)`) because Unovis / SVG / Canvas
 * cannot resolve CSS variables at render time without an extra read, and
 * `color-mix()` consumers need stable string inputs.
 *
 * Three concerns:
 *  1. Metric identity — each GSC / CWV metric has a fixed colour so multi-series
 *     charts are readable at a glance (clicks = blue, impressions = purple, …).
 *  2. Category palettes — ordered swatches for series with no inherent identity
 *     (top pages, country donut, device split).
 *  3. Threshold / brand splits — colours that carry meaning (brand vs non-brand
 *     traffic, indexing success vs error).
 *
 * Colour MUST encode information; never decorate. Routed through `vizColorMap`
 * so legend chips and sparklines share one lookup.
 */

export interface VizColor {
  bg: string
  hex: string
  text: string
  dot: string
}

/**
 * `dot` is the solid identity colour (legend dots, sparkline strokes); `bg` is its
 * translucent fill variant for proportion bars / badge backgrounds so the value sitting
 * on top stays readable. Standard `bg-{hue}-{shade}` tokens get a `/15` fill; tokens that
 * already carry an opacity modifier or use a semantic name (e.g. `bg-accented`) pass through.
 *
 * The `/15` variants are built at runtime, so Tailwind's content scanner never sees them
 * as literals — they must be safelisted (see `vizFillSafelist` below) or the bar renders
 * transparent.
 */
function viz(dot: string, hex: string, text: string): VizColor {
  const bg = /^bg-[a-z]+-\d+$/.test(dot) ? `${dot}/15` : dot
  return { bg, hex, text, dot }
}

/**
 * Tailwind JIT safelist. Every `bg-<hue>-<shade>/15` fill `viz()` can emit must appear
 * here as a literal so Tailwind's source scanner generates the CSS (clicks/impressions
 * worked only because `periodVizColors` happened to spell them out). Keep in sync with
 * the `viz()` inputs below — a missing entry makes that metric's proportion bar invisible.
 */
export const vizFillSafelist = [
  'bg-blue-500/15',
  'bg-purple-500/15',
  'bg-emerald-500/15',
  'bg-orange-500/15',
  'bg-cyan-500/15',
  'bg-amber-500/15',
  'bg-red-500/15',
  'bg-violet-500/15',
  'bg-blue-400/15',
  'bg-green-400/15',
  'bg-amber-400/15',
  'bg-emerald-400/15',
] as const

/**
 * GSC metric identity — pinned so every clicks chart reads blue, every
 *  impressions chart reads purple, regardless of consumer.
 */
export const gscMetricColors = {
  clicks: viz('bg-blue-500', '#3b82f6', 'text-blue-500'),
  impressions: viz('bg-purple-500', '#a855f7', 'text-purple-500'),
  ctr: viz('bg-emerald-500', '#10b981', 'text-emerald-500'),
  position: viz('bg-orange-500', '#f97316', 'text-orange-500'),
} as const satisfies Record<string, VizColor>

/**
 * Web Analytics metric identity (ADR-0032). Paired with `text` / `dot` tailwind
 * classes because the consumers (`ProCardAnalytics`) bind these via `:class`,
 * whereas the chart line/area colours live inline next to the SVG gradients
 * in `ProGraphAnalytics`.
 */
export const analyticsMetricColors = {
  sessions: viz('bg-blue-500', '#3b82f6', 'text-blue-500'),
  users: viz('bg-cyan-500', '#06b6d4', 'text-cyan-500'),
  pageviews: viz('bg-purple-500', '#a855f7', 'text-purple-500'),
} as const satisfies Record<string, VizColor>

/**
 * Core Web Vitals metric identity. `tbt` (synthetic lab) shares INP's amber —
 *  it occupies the same responsiveness slot when the source is Lighthouse.
 */
export const cwvMetricColors = {
  lcp: viz('bg-blue-500', '#3b82f6', 'text-blue-500'),
  inp: viz('bg-amber-500', '#f59e0b', 'text-amber-500'),
  tbt: viz('bg-amber-500', '#f59e0b', 'text-amber-500'),
  cls: viz('bg-purple-500', '#a855f7', 'text-purple-500'),
} as const satisfies Record<string, VizColor>

/**
 * Period-comparison palette — current period vs comparison (prev/YoY) shown in
 * the date-range picker, sparklines, and any "vs" pill. Pinned so all comparison
 * surfaces share one hue.
 */
export const periodVizColors = {
  current: viz('bg-blue-500/15', '#3b82f6', 'text-blue-400'),
  comparison: viz('bg-purple-500/15', '#a855f7', 'text-purple-400'),
} as const satisfies Record<string, VizColor>

/** Indexing status — bridges semantic status into the chart palette. */
export const indexingVizColors = {
  indexed: { bg: 'bg-success', hex: semanticColors.success.hex, text: 'text-success', dot: 'bg-success' },
  notIndexed: { bg: 'bg-warning', hex: semanticColors.warning.hex, text: 'text-warning', dot: 'bg-warning' },
  excluded: { bg: 'bg-warning', hex: semanticColors.warning.hex, text: 'text-warning', dot: 'bg-warning' },
  errors: { bg: 'bg-error', hex: semanticColors.error.hex, text: 'text-error', dot: 'bg-error' },
  error: { bg: 'bg-error', hex: semanticColors.error.hex, text: 'text-error', dot: 'bg-error' },
  crawled: { bg: 'bg-info', hex: semanticColors.info.hex, text: 'text-info', dot: 'bg-info' },
} as const satisfies Record<string, VizColor>

/**
 * Position-distribution tiers — premier (1–3) reads warning-amber so the eye
 *  goes there; second-page / beyond fade into muted neutrals.
 */
export const positionDistColors = {
  premier: { bg: 'bg-warning', hex: semanticColors.warning.hex, text: 'text-warning', dot: 'bg-warning' },
  pageOne: { bg: 'bg-info', hex: semanticColors.info.hex, text: 'text-info', dot: 'bg-info' },
  secondPage: { bg: 'bg-muted', hex: semanticColors.neutral.hex, text: 'text-muted', dot: 'bg-muted' },
  beyond: { bg: 'bg-elevated', hex: semanticColors.neutral.hex, text: 'text-muted', dot: 'bg-elevated' },
  top3: { bg: 'bg-warning', hex: semanticColors.warning.hex, text: 'text-warning', dot: 'bg-warning' },
  page1: { bg: 'bg-info', hex: semanticColors.info.hex, text: 'text-info', dot: 'bg-info' },
  page2: { bg: 'bg-muted', hex: semanticColors.neutral.hex, text: 'text-muted', dot: 'bg-muted' },
  deep: { bg: 'bg-elevated', hex: semanticColors.neutral.hex, text: 'text-muted', dot: 'bg-elevated' },
} as const satisfies Record<string, VizColor>

/**
 * Device split — desktop / mobile / tablet. Lighter shoulder hues so three
 *  values can sit beside each other without one dominating.
 */
export const gscDeviceColors = {
  desktop: viz('bg-blue-400', '#60a5fa', 'text-blue-400'),
  mobile: viz('bg-green-400', '#4ade80', 'text-green-400'),
  tablet: viz('bg-amber-400', '#fbbf24', 'text-amber-400'),
} as const satisfies Record<string, VizColor>

/**
 * Brand vs non-brand traffic split. Violet pulls toward brand identity, emerald
 *  reads as "earned" non-brand traffic.
 */
export const gscBrandSplitColors = {
  brand: viz('bg-violet-500', '#8b5cf6', 'text-violet-500'),
  nonBrand: viz('bg-emerald-500', '#10b981', 'text-emerald-500'),
} as const satisfies Record<'brand' | 'nonBrand', VizColor>

/** Country donut — 5-slot ordered palette consumed by Unovis donut charts. */
export const gscCountryDonutColors: string[] = ['#60a5fa', '#4ade80', '#fbbf24', '#f87171', '#a78bfa']

/** Top-pages stacked area (6 slots: 5 pages + "other"). */
export const gscTopPagesColors: VizColor[] = [
  viz('bg-blue-500', '#3b82f6', 'text-blue-500'),
  viz('bg-purple-500', '#a855f7', 'text-purple-500'),
  viz('bg-emerald-400', '#34d399', 'text-emerald-400'),
  viz('bg-orange-500', '#f97316', 'text-orange-500'),
  viz('bg-cyan-500', '#06b6d4', 'text-cyan-500'),
  viz('bg-accented', `${semanticColors.neutral.hex}80`, 'text-muted'),
]

/**
 * Generic preset swatches — for charts with no metric/category mapping (e.g.
 *  `<UiSparkline color="blue">`). Use a metric/category map first when one fits.
 *
 * `long-tail` / `high-volume` / `quick-wins` are keyword-research categories
 *  consumed by `ProToolsKeywordTable`; aliased onto preset hues so they share
 *  the same look as the underlying chart colour.
 */
export const presetVizColors = {
  'blue': viz('bg-blue-500', '#3b82f6', 'text-blue-500'),
  'green': viz('bg-emerald-500', '#10b981', 'text-emerald-500'),
  'purple': viz('bg-purple-500', '#a855f7', 'text-purple-500'),
  'orange': viz('bg-orange-500', '#f97316', 'text-orange-500'),
  'red': viz('bg-red-500', '#ef4444', 'text-red-500'),
  'cyan': viz('bg-cyan-500', '#06b6d4', 'text-cyan-500'),
  'amber': viz('bg-amber-500', '#f59e0b', 'text-amber-500'),
  'neutral': viz('bg-accented', semanticColors.neutral.hex, 'text-muted'),
  'long-tail': viz('bg-cyan-500', '#06b6d4', 'text-cyan-500'),
  'high-volume': viz('bg-emerald-500', '#10b981', 'text-emerald-500'),
  'quick-wins': viz('bg-amber-500', '#f59e0b', 'text-amber-500'),
} as const satisfies Record<string, VizColor>

/**
 * One lookup for legends, sparklines, and dot chips. Metric / category names
 *  resolve to their identity colour; preset names fall through.
 */
export const vizColorMap: Record<string, VizColor> = {
  ...presetVizColors,
  clicks: gscMetricColors.clicks,
  impressions: gscMetricColors.impressions,
  ctr: gscMetricColors.ctr,
  position: gscMetricColors.position,
  lcp: cwvMetricColors.lcp,
  inp: cwvMetricColors.inp,
  cls: cwvMetricColors.cls,
  brand: gscBrandSplitColors.brand,
  nonBrand: gscBrandSplitColors.nonBrand,
}

/**
 * Lookup helpers. Both function-callable (`vizBgColor("clicks")`) AND
 * key-indexable (`vizBgColor.blue`) so legend mapping and inline class
 * binding can share one import.
 */
function makeLookup(field: keyof VizColor) {
  const fallback = presetVizColors.neutral[field]
  return Object.assign(
    (name: string | null | undefined) => (name ? (vizColorMap[name]?.[field] ?? fallback) : fallback),
    Object.fromEntries(Object.entries(vizColorMap).map(([k, v]) => [k, v[field]])),
  ) as ((name: string | null | undefined) => string) & Record<string, string>
}

export const vizBgColor = makeLookup('bg')
export const vizDotColor = makeLookup('hex')
export const vizTextColor = makeLookup('text')
