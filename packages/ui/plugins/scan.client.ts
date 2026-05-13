import type { CompletedRoute, ScanProgress } from '@unlighthouse/contracts'
import type { ScanId } from '@unlighthouse/contracts/types/atoms'
import type { UnlighthouseClient } from '@unlighthouse/core/api/client'
import type { TransportConnection } from './transport.client'
import type { UnlighthouseRuntimeConfig } from './unlighthouse-config.client'
import type { ScanState } from '~/composables/scan'
import { freshScanState } from '~/composables/scan'

const POLL_MS = 2000

export default defineNuxtPlugin({
  name: 'unlighthouse-scan',
  dependsOn: ['unlighthouse-config', 'unlighthouse-api', 'unlighthouse-transport'],
  setup(nuxtApp) {
    const state = reactive<ScanState>(freshScanState())
    const scanId = useState<string>('scanId', () => '')

    const { isStatic } = nuxtApp.$uconfig as UnlighthouseRuntimeConfig
    if (!isStatic.value) {
      const client = nuxtApp.$api as UnlighthouseClient

      async function fetchScanStatus() {
        const data = await client['scan.status']({ scanId: (scanId.value ?? '') as ScanId }).catch(() => null)
        if (data)
          Object.assign(state, data)
      }

      nuxtApp.hook('transport:scan:progress', (data: Partial<ScanProgress>) => {
        state.progress = { ...state.progress, ...data }
        if (state.progress.percent < 100)
          state.status = 'scanning'
      })
      nuxtApp.hook('transport:scan:route-complete', (data: CompletedRoute) => {
        state.recentlyCompleted = [data, ...state.recentlyCompleted.slice(0, 9)]
      })
      nuxtApp.hook('transport:scan:complete', () => {
        state.status = 'complete'
        state.progress.percent = 100
        state.paused = false
        state.error = null
      })
      nuxtApp.hook('transport:scan:cancelled', () => {
        state.status = 'cancelled'
        state.paused = false
        state.error = null
      })
      nuxtApp.hook('transport:scan:error', (data: { message?: string }) => {
        state.status = 'error'
        state.paused = false
        state.error = data?.message || 'Unknown error'
      })

      ;(nuxtApp.$transport as TransportConnection).connect().catch(() => {})
      fetchScanStatus()
      setInterval(fetchScanStatus, POLL_MS)
    }

    return {
      provide: { scan: { state, scanId } },
    }
  },
})
