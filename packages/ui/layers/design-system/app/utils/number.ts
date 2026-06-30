/**
 * Calculate percentage change between two values, clamped to ±999.
 * Returns 0 if prev is 0 (avoids division by zero).
 */
export function percentChange(current: number, prev: number): number {
  if (!prev)
    return 0
  return clamp(Math.round(((current - prev) / prev) * 100), -999, 999) || 0
}

/**
 * Clamp a number between min and max values:
 *
 * @example clamp(-5, 1, 5) // 1
 * @example clamp(10, 1, 5) // 5
 *
 * Or clamp an index to valid array indices:
 *
 * @example clamp(-5, [1, 2, 3, 4, 5]) // 0
 * @example clamp(10, [1, 2, 3, 4, 5]) // 4
 */
export function clamp(value: number, arr: readonly unknown[]): number
export function clamp(value: number, min: number, max: number): number
export function clamp(value: number, a: number | readonly unknown[], b?: number): number {
  if (typeof a !== 'number')
    return Math.min(Math.max(value, 0), a.length - 1)

  const min = a
  const max = b ?? min
  return Math.min(Math.max(value, min), max)
}
