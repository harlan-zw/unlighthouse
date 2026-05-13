import type { UnlighthouseClient } from '@unlighthouse/core/api/client'

export function useApiClient(): UnlighthouseClient {
  return useNuxtApp().$api
}
