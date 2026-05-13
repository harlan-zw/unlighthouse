import type { ScanId } from '@unlighthouse/contracts/types/atoms'
import type { UnlighthouseClient } from '@unlighthouse/core/api/client'

export function useApiClient(): UnlighthouseClient {
  return useNuxtApp().$api as UnlighthouseClient
}

export function asScanId(scanId: string): ScanId {
  return scanId as ScanId
}
