/**
 * Shared options for the design-system slot text roll.
 *
 * Kept as a local type so components can expose tuning without depending on the
 * external `slot-text` package or carrying its DOM controller runtime.
 */
export interface SlotTextOptions {
  direction?: 'up' | 'down'
  stagger?: number
  duration?: number
  exitOffset?: number
  easing?: string
  bounce?: number
  color?: string | ((index: number, total: number) => string)
  colorFade?: number
  skipUnchanged?: boolean
  interrupt?: boolean
}
