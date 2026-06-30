import type { ScoreBand } from '~/utils/scoring'

// The single source for the good/average/poor hex palette (Lighthouse's
// green/orange/red gauge colours). Previously the same three hex values were
// re-typed in scoreToRingColor, routeScore100Color, and MetricStatCard. Tailwind
// token mappings (text-success/-warning/-error vs -destructive) are deliberately
// left per-consumer — that naming is an unresolved theme decision.
export const BAND_HEX: Record<ScoreBand, string> = {
  good: '#22c55e',
  average: '#f97316',
  poor: '#ef4444',
}

const BAND_HEX_MUTED = '#9ca3af'

/** Band → gauge hex; null band (no score / unknown) → muted grey. */
export function bandHex(band: ScoreBand | null): string {
  return band ? BAND_HEX[band] : BAND_HEX_MUTED
}
