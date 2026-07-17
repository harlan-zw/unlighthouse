/** D1 currently accepts at most 100 bound parameters per statement. */
export const MAX_SQLITE_BOUND_PARAMETERS = 100

export function chunkRowsByBindLimit<T>(rows: readonly T[], boundValuesPerRow: number): T[][] {
  if (!Number.isInteger(boundValuesPerRow) || boundValuesPerRow < 1)
    throw new RangeError('boundValuesPerRow must be a positive integer')
  const size = Math.max(1, Math.floor(MAX_SQLITE_BOUND_PARAMETERS / boundValuesPerRow))
  const chunks: T[][] = []
  for (let offset = 0; offset < rows.length; offset += size)
    chunks.push(rows.slice(offset, offset + size))
  return chunks
}
