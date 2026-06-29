import type { UnlighthouseClient } from '@unlighthouse/core/api/client'
import type { ScanEventBus } from './scan-events'

declare module '#app' {
  interface NuxtApp {
    $api: UnlighthouseClient
    $ws: ScanEventBus
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $api: UnlighthouseClient
    $ws: ScanEventBus
  }
}

export {}
