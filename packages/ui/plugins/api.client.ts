import type { UnlighthouseClient } from '@unlighthouse/core/api/client'
import type { UnlighthouseRuntimeConfig } from './unlighthouse-config.client'
import { createClient } from '@unlighthouse/core/api/client'

declare module '#app' {
  interface NuxtApp {
    $api: UnlighthouseClient
  }
}

export default defineNuxtPlugin({
  name: 'unlighthouse-api',
  dependsOn: ['unlighthouse-config'],
  setup(nuxtApp) {
    const { apiUrl } = nuxtApp.$uconfig as UnlighthouseRuntimeConfig
    const api = createClient({ baseUrl: apiUrl.value || '/api' })
    return {
      provide: { api },
    }
  },
})
