import type { ComputedRef, Ref } from 'vue'
import { computed } from 'vue'

function buildGridCols(colCount: number): string {
  if (colCount <= 0)
    colCount = 1

  const colWidth = colCount <= 2 ? '200px' : '160px'

  const middle = colCount === 1
    ? colWidth
    : Array.from({ length: colCount }).fill(colWidth).join(' 8px ')

  return `48px 1fr ${middle} 60px`
}

export function useGridCols(
  columnCount: Ref<number> | ComputedRef<number>,
  fallbackClass?: Ref<string | false | undefined> | ComputedRef<string | false | undefined>,
): ComputedRef<string> {
  return computed(() => {
    if (fallbackClass?.value)
      return fallbackClass.value
    return buildGridCols(columnCount.value)
  })
}
