// Helpers for the crux pack UI view. The pack's `gapAnalysis` is a flat
// array of `(url, formFactor, metric, …)` entries — each metric on each
// (url, device) shows up as its own row. For the UI we want one row per
// route+device, with the per-metric verdicts collapsed into a compact
// summary, so users can scan "which URLs are gapping?" rather than
// "which (url, metric) cells are gapping?".
//
// Pure functions — kept in `utils/` so they're auto-imported by Nuxt and
// trivially unit-testable.

import type { GapEntry } from '@unlighthouse/core/packs'

export interface GroupedGap {
  /** `${url}|${formFactor}` — stable key for v-for. */
  key: string
  url: string
  formFactor: GapEntry['formFactor']
  /** Per-metric rows collapsed under this (url, formFactor) pair. */
  metrics: GapEntry[]
}

/**
 * Group gap entries by `(url, formFactor)`. Order of the returned groups
 * matches the order of first appearance in `entries`; the per-metric order
 * inside each group is preserved as well. Stable so the UI doesn't shuffle
 * rows between renders when the underlying report is unchanged.
 */
export function groupGapsByRoute(entries: ReadonlyArray<GapEntry>): GroupedGap[] {
  const index = new Map<string, GroupedGap>()
  for (const entry of entries) {
    const key = `${entry.url}|${entry.formFactor}`
    let group = index.get(key)
    if (!group) {
      group = {
        key,
        url: entry.url,
        formFactor: entry.formFactor,
        metrics: [],
      }
      index.set(key, group)
    }
    group.metrics.push(entry)
  }
  return Array.from(index.values())
}

/**
 * Strip the protocol + host off a URL for compact display in tables. Falls
 * back to the input string when parsing fails — bad URLs shouldn't crash
 * the view.
 */
export function shortPath(url: string): string {
  try {
    const u = new URL(url)
    return u.pathname + u.search || '/'
  }
  catch {
    return url
  }
}

/**
 * Friendly device label for a CrUX form factor. The CrUX wire uses
 * PHONE / DESKTOP / TABLET; the rest of the dashboard uses
 * mobile / desktop, so we lower-case + collapse phone → mobile to match.
 */
export function formFactorLabel(ff: GapEntry['formFactor']): string {
  switch (ff) {
    case 'PHONE':
      return 'mobile'
    case 'DESKTOP':
      return 'desktop'
    case 'TABLET':
      return 'tablet'
    default:
      return 'all'
  }
}

/**
 * Format a metric value for display. CrUX CLS is a raw float (e.g. 0.05)
 * and lab CLS comes through ScanRoute as the same float — we render both
 * to three decimal places. LCP / INP arrive in ms — < 1000 stays as ms,
 * larger values fold up to seconds for legibility.
 */
export function formatMetric(metric: GapEntry['metric'], value: number | null): string {
  if (value == null)
    return '—'
  if (metric === 'cls')
    return value.toFixed(3)
  if (value < 1000)
    return `${Math.round(value)} ms`
  return `${(value / 1000).toFixed(2)} s`
}

/**
 * Tailwind colour classes for a Google p75 verdict. Matches the palette
 * used by the cwv pack page so the two views feel like one product.
 */
export function verdictClasses(v: GapEntry['labVerdict']): { text: string, bg: string } {
  switch (v) {
    case 'good':
      return { text: 'text-success', bg: 'bg-success/15' }
    case 'needsImprovement':
      return { text: 'text-warning', bg: 'bg-warning/15' }
    case 'poor':
      return { text: 'text-error', bg: 'bg-error/15' }
    default:
      return { text: 'text-dimmed', bg: 'bg-muted' }
  }
}

export function verdictLabel(v: GapEntry['labVerdict']): string {
  return v === 'needsImprovement' ? 'needs work' : v
}
