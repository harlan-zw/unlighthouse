/**
 * Centralized semantic color system for the Pro dashboard.
 *
 * Three concerns:
 * 1. **Status colors** — success/error/warning/info/neutral for health, connection, validation states
 * 2. **Threshold colors** — good/needs-attention/poor for CWV, indexing %, etc.
 * 3. **Trend colors** — positive (green) / negative (red) / neutral for change values
 *
 * Metric visualization colors (clicks=blue, impressions=purple, etc.) are intentionally
 * NOT included here — those are data-viz concerns, not semantic.
 */

export type SemanticStatus = 'success' | 'error' | 'warning' | 'info' | 'neutral'
export type HealthStatus = 'healthy' | 'attention' | 'issues' | 'unknown'

export interface SemanticColorSet {
  text: string
  bg: string
  dot: string
  border: string
  hex: string
}

/** Full class sets for each semantic status */
export const semanticColors: Record<SemanticStatus, SemanticColorSet> = {
  success: { text: 'text-success', bg: 'bg-success/10', dot: 'bg-success', border: 'border-success/20', hex: '#22c55e' },
  error: { text: 'text-error', bg: 'bg-error/10', dot: 'bg-error', border: 'border-error/20', hex: '#ef4444' },
  warning: { text: 'text-warning', bg: 'bg-warning/10', dot: 'bg-warning', border: 'border-warning/20', hex: '#eab308' },
  info: { text: 'text-info', bg: 'bg-info/10', dot: 'bg-info', border: 'border-info/20', hex: '#3b82f6' },
  // hex is a violet-tinted grey (hue ~292) matching the de-chromatized neutral
  // ramp, not stock cold blue-slate — so chart neutrals sit with the surface
  // greys instead of reading cool against them.
  neutral: { text: 'text-muted', bg: 'bg-accented', dot: 'bg-[var(--ui-border)]', border: 'border-default', hex: '#9e9aa6' },
}

/** Map dashboard health status to semantic status */
export function healthToSemantic(health: HealthStatus | null): SemanticStatus {
  switch (health) {
    case 'healthy': return 'success'
    case 'attention': return 'warning'
    case 'issues': return 'error'
    default: return 'neutral'
  }
}

/** Map a numeric value against good/poor thresholds to semantic status */
export function thresholdToSemantic(value: number, good: number, poor: number): SemanticStatus {
  if (value <= good)
    return 'success'
  if (value <= poor)
    return 'warning'
  return 'error'
}

/** Map a trend direction to semantic status — positive=success, negative=error, zero=neutral */
export function trendToSemantic(value: number): SemanticStatus {
  if (value > 0)
    return 'success'
  if (value < 0)
    return 'error'
  return 'neutral'
}

/** Shorthand: get the full color set for a health status */
export function healthColors(health: HealthStatus | null): SemanticColorSet {
  return semanticColors[healthToSemantic(health)]
}

/** Shorthand: get the full color set for a threshold value */
export function thresholdColors(value: number, good: number, poor: number): SemanticColorSet {
  return semanticColors[thresholdToSemantic(value, good, poor)]
}

/** Shorthand: get hex color for a threshold value (for chart rendering) */
export function thresholdHex(value: number, good: number, poor: number): string {
  return thresholdColors(value, good, poor).hex
}
