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

      function computePercent(p: ScanProgress) {
        const denom = p.total || p.discovered
        if (!denom)
          return 0
        return Math.min(100, Math.round((p.scanned / denom) * 100))
      }

      async function fetchScanStatus() {
        if (!scanId.value) {
          const current = await client['scan.current']({}).catch(() => null)
          if (current?.scanId)
            scanId.value = current.scanId
        }
        if (!scanId.value)
          return
        const data = await client['scan.status']({ scanId: scanId.value as ScanId }).catch(() => null)
        if (!data)
          return
        state.status = data.status as ScanState['status']
        state.startedAt = data.startedAt ?? state.startedAt
        state.progress = {
          discovered: data.discovered,
          scanned: data.scanned,
          failed: data.failed,
          total: data.total,
          percent: data.status === 'complete' ? 100 : computePercent(data as unknown as ScanProgress),
        }
      }

      nuxtApp.hook('transport:scan:progress', (data: Partial<ScanProgress>) => {
        const merged = { ...state.progress, ...data }
        merged.percent = data.percent ?? computePercent(merged)
        state.progress = merged
        if (merged.percent < 100)
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
