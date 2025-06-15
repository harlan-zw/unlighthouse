// Performance constants to avoid recalculation
export const EXCLUDED_CATEGORIES = ['Overview', 'CrUX'] as const

export const GAUGE_CONSTANTS = {
  RADIUS: 56,
  STROKE_WIDTH: 8,
  get CIRCUMFERENCE() {
    return 2 * Math.PI * this.RADIUS
  },
  get ROTATION_OFFSET() {
    return 0.25 * this.STROKE_WIDTH / this.CIRCUMFERENCE
  },
} as const
