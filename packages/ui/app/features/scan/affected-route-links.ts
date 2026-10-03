import type { MaybeRefOrGetter } from 'vue'
import { parseScanId } from '@unlighthouse/contracts/types/atoms'
import { computed, toValue } from 'vue'
import { routeParamString } from '~/features/scan/route-context'
import { resolveAffectedRouteLink } from '~/features/scan/route-links'

// Resolve against audited rows, rather than treating every finding URL as a
// page. The shared command cache and static client serve the same request.
export function useAffectedRouteLinks(base?: MaybeRefOrGetter<string | undefined>) {
  const route = useRoute()
  const rawScanId = computed(() => routeParamString(route.params.scanId))
  const scanBase = computed(() => toValue(base) ?? (rawScanId.value && routeParamString(route.params.siteId)
    ? `/sites/${route.params.siteId}/scans/${rawScanId.value}`
    : undefined))
  const { data, status, error, refresh } = useApiQuery(
    'scan.results',
    () => ({ scanId: parseScanId(rawScanId.value ?? 'unavailable'), page: 1, pageSize: 500 }),
    { enabled: () => !!rawScanId.value && !!scanBase.value },
  )
  function affectedRouteLink(affected: string): string | undefined {
    const device = route.query.device === 'mobile' || route.query.device === 'desktop' ? route.query.device : undefined
    return resolveAffectedRouteLink(scanBase.value, affected, data.value?.items ?? [], device)
  }
  return { affectedRouteLink, linksPending: computed(() => status.value === 'pending'), linksError: error, refreshLinks: refresh }
}
