import type { ScanMeta, UnlighthouseRouteReport } from '@unlighthouse/contracts'
import type { UnlighthouseClient } from '@unlighthouse/core/api/client'
import type { TransportConnection } from './transport.client'
import type { UnlighthouseRuntimeConfig } from './unlighthouse-config.client'

const META_POLL_MS = 5000

export default defineNuxtPlugin({
  name: 'unlighthouse-live-reports',
  dependsOn: ['unlighthouse-config', 'unlighthouse-api', 'unlighthouse-transport'],
  setup(nuxtApp) {
    const { isStatic } = nuxtApp.$uconfig as UnlighthouseRuntimeConfig
    if (isStatic.value)
      return

    const client = nuxtApp.$api as UnlighthouseClient
    const reports = useState<UnlighthouseRouteReport[]>('unlighthouse:reports', () => [])
    const scanMeta = useState<ScanMeta | null>('unlighthouse:scan-meta', () => null)
    const isOffline = useState<boolean>('unlighthouse:offline', () => false)

    nuxtApp.hook('transport:route-report', (report) => {
      const idx = reports.value.findIndex(r => r.route.path === report.route.path)
      if (idx >= 0)
        reports.value[idx] = report
      else
        reports.value.push(report)
    })
    nuxtApp.hook('transport:scan-meta', (meta) => {
      scanMeta.value = meta
    })
    nuxtApp.hook('transport:open', () => {
      isOffline.value = false
    })
    nuxtApp.hook('transport:close', () => {
      isOffline.value = true
    })

    ;(nuxtApp.$transport as TransportConnection).connect().catch(() => {
      isOffline.value = true
    })

    setInterval(async () => {
      const current = await client['scan.current']({}).catch(() => null)
      if (!current?.scanId)
        return
      const data = await client['scan.meta']({ scanId: current.scanId }).catch(() => null)
      if (data)
        scanMeta.value = data as unknown as ScanMeta
    }, META_POLL_MS)
  },
})
