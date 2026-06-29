import type { UnlighthouseClient } from '@unlighthouse/core/api/client'

export function useApi(): UnlighthouseClient {
  return useNuxtApp().$api
}
