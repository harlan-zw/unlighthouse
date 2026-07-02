import type { UnlighthouseClient } from '@unlighthouse/contracts/client'

export function useApi(): UnlighthouseClient {
  return useNuxtApp().$api
}
