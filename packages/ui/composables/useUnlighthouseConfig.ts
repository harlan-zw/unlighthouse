import type { UnlighthouseRuntimeConfig } from '~/plugins/unlighthouse-config.client'

export function useUnlighthouseConfig(): UnlighthouseRuntimeConfig {
  return useNuxtApp().$uconfig as UnlighthouseRuntimeConfig
}
