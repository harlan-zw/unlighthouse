import type { SortingState } from '@tanstack/vue-table'

const MOBILE_COLUMNS = new Set(['path', 'device', 'scorePerformance'])

export function visibleRouteColumns(
  ids: readonly string[],
  mobile: boolean,
  choices: Readonly<Record<string, boolean>>,
  sorting: SortingState,
): string[] {
  const sorted = new Set(sorting.map(sort => sort.id))
  return ids.filter(id => choices[id] ?? (!mobile || MOBILE_COLUMNS.has(id) || sorted.has(id)))
}
