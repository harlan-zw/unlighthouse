// Pure helpers for chart annotations — the day-key matching + marker positioning
// extracted from UiChartFrame so they're unit-testable and shareable by every
// annotated chart (UiChartFrame's tooltip, the UiChartAnnotations marker overlay,
// and the CWV / indexing charts that compose unovis directly).

/**
 * A single chart annotation — a thin vertical marker line + interactive dot.
 * A plain UI shape any chart consumer can populate from any data source
 * (timeline events, deploy markers, …); the design system never imports the
 * domain that produces it.
 */
export interface ChartAnnotation {
  /** X position as a Date, ISO string, or epoch-ms number matching the chart's x domain. */
  x: number | string | Date
  /** Short label shown in the marker's native title + the chart tooltip. */
  label: string
  /**
   * Semantic tone that tints the marker (semantic CSS classes only).
   * 'success' → bg-success  'error' → bg-error  'warning' → bg-warning
   * 'neutral' (default) → bg-accented
   */
  tone?: 'success' | 'error' | 'warning' | 'neutral'
  /** Reserved for future icon rendering above the marker dot. Not yet displayed. */
  icon?: string
}

/** Semantic tone → marker tailwind background class (line + dot). */
export const ANNOTATION_TONE_CLASS: Record<NonNullable<ChartAnnotation['tone']>, string> = {
  success: 'bg-success',
  error: 'bg-error',
  warning: 'bg-warning',
  neutral: 'bg-accented',
}

function toMs(v: Date | string | number): number {
  if (v instanceof Date)
    return v.getTime()
  if (typeof v === 'number')
    return v
  return new Date(v).getTime()
}

/**
 * Normalise any x value to a `YYYY-MM-DD` day key.
 *
 * A `YYYY-MM-DD…` string keeps its own day verbatim (no Date round-trip, so no
 * UTC shift); a `Date`/epoch-ms is keyed by its **UTC** day.
 *
 * TIMEZONE NOTE (ADR-0082): chart x-domains here are GSC reporting days
 * (Pacific) rendered as UTC-midnight Dates, and an annotation's `x` is typically
 * an event instant (`occurredAt`, a UTC Date). Marker placement and the tooltip
 * match BOTH key off that UTC day, so the tooltip always matches the day the
 * marker is drawn on — they stay mutually consistent. The only artefact: a
 * detection-time event late in the Pacific evening keys one calendar day ahead
 * of the viewer's local day, and its marker sits on that same (next) day.
 */
export function toChartDayKey(v: Date | string | number): string {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v))
    return v.slice(0, 10)
  return new Date(toMs(v)).toISOString().slice(0, 10)
}

/** Annotations whose day matches the hovered x value (same `YYYY-MM-DD`). */
export function annotationsOnDay<T extends { x: Date | string | number }>(
  annotations: readonly T[],
  hoverX: Date | string | number | null | undefined,
): T[] {
  if (hoverX == null || !annotations.length)
    return []
  const day = toChartDayKey(hoverX)
  return annotations.filter(a => toChartDayKey(a.x) === day)
}

/**
 * The CSS `left` percentage for an annotation within a zero-horizontal-margin
 * plot (wrap width == plot x-span). Clamped to [0,100]. Returns '50%' for a
 * degenerate domain.
 */
export function annotationLeftPct(x: Date | string | number, domain: [Date | string | number, Date | string | number]): string {
  const xMs = toMs(x)
  const minMs = toMs(domain[0])
  const maxMs = toMs(domain[1])
  if (maxMs <= minMs)
    return '50%'
  const pct = Math.max(0, Math.min(100, ((xMs - minMs) / (maxMs - minMs)) * 100))
  return `${pct.toFixed(4)}%`
}

/**
 * Re-anchor annotations onto an INDEX-based x-axis (`x = (_d, i) => i`, e.g. the
 * CWV + indexing charts, whose bars are evenly spaced by array index rather than
 * by time). Maps each annotation's day to the data index sharing that day and
 * drops annotations with no matching data point. Pair with `xDomain = [0, len-1]`
 * so `UiChartAnnotations` positions markers on the right bar.
 */
export function indexAnnotationsByDay(
  annotations: readonly ChartAnnotation[] | undefined,
  days: readonly string[],
): ChartAnnotation[] {
  if (!annotations?.length || !days.length)
    return []
  const dayToIndex = new Map<string, number>()
  days.forEach((d, i) => {
    const key = toChartDayKey(d)
    if (!dayToIndex.has(key))
      dayToIndex.set(key, i)
  })
  return annotations.flatMap((a) => {
    const i = dayToIndex.get(toChartDayKey(a.x))
    return i == null ? [] : [{ ...a, x: i }]
  })
}

export interface ResolvedAnnotationMarker {
  id: number
  label: string
  leftPct: string
  toneClass: string
}

/** Resolve annotations to positioned markers; [] when no domain (silently skipped). */
export function resolveAnnotationMarkers(
  annotations: readonly ChartAnnotation[] | undefined,
  xDomain: [Date | string | number, Date | string | number] | undefined,
): ResolvedAnnotationMarker[] {
  if (!annotations?.length || !xDomain)
    return []
  return annotations.map((ann, i) => ({
    id: i,
    label: ann.label,
    leftPct: annotationLeftPct(ann.x, xDomain),
    toneClass: ANNOTATION_TONE_CLASS[ann.tone ?? 'neutral'],
  }))
}
