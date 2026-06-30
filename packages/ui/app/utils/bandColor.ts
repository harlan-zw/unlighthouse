import type { ScoreBand } from '~/utils/scoring'

// The single app-level bridge from Lighthouse score bands to the design-system
// semantic palette. SVG/canvas consumers need hex strings, so keep that boundary
// here instead of retyping status hexes per component.
export const BAND_HEX: Record<ScoreBand, string> = {
  good: semanticColors.success.hex,
  average: semanticColors.warning.hex,
  poor: semanticColors.error.hex,
}

const BAND_HEX_MUTED = semanticColors.neutral.hex

/** Band → gauge hex; null band (no score / unknown) → muted grey. */
export function bandHex(band: ScoreBand | null): string {
  return band ? BAND_HEX[band] : BAND_HEX_MUTED
}
