// Pure sort helpers for the routes table in
// `pages/results/[scanId]/index.vue`. Extracted so they can be unit-tested
// without mounting the page — closes #101 (column sorting broken for
// performance score on rows still scanning).
//
// Design constraints:
//   1. `null`/`undefined` scores always sink to the bottom, regardless of
//      direction. Previous logic used `-1` as a sentinel which placed nulls
//      at the *top* in ascending order.
//   2. RouteGroup rows can have both `mobile` and `desktop` reports; use the
//      better (max) device score so multi-device rows sort sensibly against
//      single-device rows.
//   3. The "Overall" sort key is the mean of the categories present on the
//      group — matches the summary card semantics.

export type SortDir = 'asc' | 'desc'
export type CategoryKey = 'performance' | 'accessibility' | 'best-practices' | 'seo'
export type SortKey = CategoryKey | 'score' | 'path'

const CATEGORY_KEYS: readonly CategoryKey[] = [
  'performance',
  'accessibility',
  'best-practices',
  'seo',
] as const

interface CategoryShape {
  score?: number | null
}

interface ReportShape {
  categories?: Record<string, CategoryShape> | null
}

interface ReportRow {
  report?: ReportShape | null
}

/**
 * A grouped row matching the `RouteGroup` interface in
 * `pages/results/[scanId]/index.vue`. We accept the shape structurally so the
 * tests don't have to construct full Lighthouse payloads.
 */
export interface SortableRouteGroup {
  path?: string
  mobile?: ReportRow | null
  desktop?: ReportRow | null
  /**
   * The single-device fallback row. Used when neither `mobile` nor `desktop`
   * carries a score (older single-device scans, or when the matrix scan
   * hasn't populated both yet).
   */
  primary?: ReportRow | null
}

/**
 * Read a Lighthouse 0..1 score and return it as a 0..100 integer, or `null`
 * when the score is missing or non-numeric. Numeric `0` is preserved (a real
 * zero score) — we explicitly only treat `null`/`undefined`/`NaN` as missing.
 */
function readScore(row: ReportRow | null | undefined, cat: CategoryKey): number | null {
  const raw = row?.report?.categories?.[cat]?.score
  if (raw == null || Number.isNaN(raw))
    return null
  return Math.round(raw * 100)
}

/**
 * For a single category, return the *best* score across the group's mobile
 * + desktop reports, falling back to `primary` when neither device row has
 * one. Returns `null` only when no device has a score for this category.
 */
export function groupCategoryScore(g: SortableRouteGroup, cat: CategoryKey): number | null {
  const scores = [
    readScore(g.mobile, cat),
    readScore(g.desktop, cat),
  ].filter((s): s is number => s != null)
  if (scores.length)
    return Math.max(...scores)
  // Fall back to primary for older single-device payloads where mobile /
  // desktop aren't tagged separately.
  return readScore(g.primary, cat)
}

/**
 * The "Overall" column: mean of category scores present on the group. Mirrors
 * `getOverallScore` in `index.vue` but operates on the group (max across
 * devices) so multi-device rows aren't penalised when one device lags.
 */
export function groupOverallScore(g: SortableRouteGroup): number | null {
  const scores = CATEGORY_KEYS
    .map(c => groupCategoryScore(g, c))
    .filter((s): s is number => s != null)
  if (!scores.length)
    return null
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
}

/**
 * Compare two scores with `null` always sinking to the bottom. Returns a
 * value compatible with `Array.prototype.sort` such that, when used as
 * `compareScores(a, b) * (dir === 'asc' ? 1 : -1)`, null rows end up *last*
 * in both orders.
 */
function compareScores(a: number | null, b: number | null, dir: SortDir): number {
  // null always sinks: replace with -Infinity for desc (so it lands at the
  // end after negation) and +Infinity for asc (so it lands at the end
  // directly).
  const sentinel = dir === 'desc' ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY
  const av = a ?? sentinel
  const bv = b ?? sentinel
  if (av === bv)
    return 0
  return av < bv ? -1 : 1
}

/**
 * Build the comparator used by the routes table. Pure & side-effect free so
 * the page can use it inside a `computed` without invalidation surprises.
 */
export function makeRouteGroupComparator(
  sortBy: SortKey,
  dir: SortDir,
): (a: SortableRouteGroup, b: SortableRouteGroup) => number {
  if (sortBy === 'path') {
    return (a, b) => {
      const cmp = (a.path || '').localeCompare(b.path || '')
      return dir === 'asc' ? cmp : -cmp
    }
  }
  if (sortBy === 'score') {
    return (a, b) => {
      const raw = compareScores(groupOverallScore(a), groupOverallScore(b), dir)
      return dir === 'asc' ? raw : -raw
    }
  }
  return (a, b) => {
    const raw = compareScores(groupCategoryScore(a, sortBy), groupCategoryScore(b, sortBy), dir)
    return dir === 'asc' ? raw : -raw
  }
}
