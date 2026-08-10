export const RECOMMENDED_PAGE_LIMIT = 100

export type PageLimitPreference
  = | { _tag: 'Automatic', value: number | null }
    | { _tag: 'User', value: number }

export function recommendPageLimit(
  discoveredUrlCount: number,
  current: PageLimitPreference,
): PageLimitPreference {
  if (current._tag === 'User')
    return current
  return {
    _tag: 'Automatic',
    value: discoveredUrlCount > RECOMMENDED_PAGE_LIMIT ? RECOMMENDED_PAGE_LIMIT : null,
  }
}

export function effectivePageCount(
  discoveredUrlCount: number,
  preference: PageLimitPreference,
): number {
  return Math.min(discoveredUrlCount, preference.value ?? discoveredUrlCount)
}
