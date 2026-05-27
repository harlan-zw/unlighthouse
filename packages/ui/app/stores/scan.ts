import { defineStore } from 'pinia'

type ScanStatus = 'idle' | 'starting' | 'discovering' | 'scanning' | 'paused' | 'complete' | 'cancelled' | 'error'

interface LogEntry {
  id: number
  timestamp: number
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
}

let logId = 0

export const useScanStore = defineStore('scan', () => {
  const scanId = ref<string | null>(null)
  const status = ref<ScanStatus>('idle')
  const site = ref<string | null>(null)
  const device = ref<string | null>(null)
  const startedAt = ref<string | null>(null)
  const completedAt = ref<string | null>(null)
  const error = ref<string | null>(null)

  const discovered = ref(0)
  const scanned = ref(0)
  const failed = ref(0)
  const total = ref(0)
  const percent = computed(() => total.value > 0 ? Math.round((scanned.value / total.value) * 100) : 0)

  const logs = ref<LogEntry[]>([])
  const MAX_LOGS = 500

  const recentRoutes = ref<Array<{ url: string, score: number | null, timestamp: number }>>([])

  const isActive = computed(() => ['starting', 'discovering', 'scanning'].includes(status.value))
  const isFinished = computed(() => ['complete', 'cancelled', 'error'].includes(status.value))

  function addLog(level: LogEntry['level'], message: string) {
    logs.value.push({ id: ++logId, timestamp: Date.now(), level, message })
    if (logs.value.length > MAX_LOGS) {
      logs.value = logs.value.slice(-MAX_LOGS)
    }
  }

  function resetProgress() {
    discovered.value = 0
    scanned.value = 0
    failed.value = 0
    total.value = 0
    recentRoutes.value = []
    logs.value = []
  }

  function setupWsListeners(ws: any) {
    ws.on('scan:created', (data: any) => {
      scanId.value = data.scanId
      site.value = data.site
      status.value = 'starting'
      startedAt.value = data.startedAt
      completedAt.value = null
      error.value = null
      resetProgress()
      addLog('info', `Scan created for ${data.site}`)
    })

    ws.on('scan:started', () => {
      status.value = 'starting'
      addLog('info', 'Scan started')
    })

    ws.on('scan:discovering', () => {
      status.value = 'discovering'
      addLog('info', 'Discovering routes...')
    })

    ws.on('scan:scanning', (data: any) => {
      status.value = 'scanning'
      addLog('info', `Scanning ${data?.discovered ?? 0} discovered routes`)
    })

    ws.on('scan:progress', (data: any) => {
      discovered.value = data.discovered ?? 0
      scanned.value = data.scanned ?? 0
      failed.value = data.failed ?? 0
      total.value = data.total ?? 0
    })

    ws.on('scan:route-complete', (data: any) => {
      const score = data.metrics?.scorePerformance ?? null
      recentRoutes.value = [
        { url: data.url, score, timestamp: Date.now() },
        ...recentRoutes.value,
      ].slice(0, 20)
      addLog('success', `${data.url}`)
    })

    ws.on('scan:route-failed', (data: any) => {
      addLog('error', `Failed: ${data.url} — ${data.error || 'Unknown error'}`)
    })

    ws.on('scan:paused', () => {
      status.value = 'paused'
      addLog('warn', 'Scan paused')
    })

    ws.on('scan:resumed', () => {
      status.value = 'scanning'
      addLog('info', 'Scan resumed')
    })

    ws.on('scan:complete', (data: any) => {
      status.value = 'complete'
      completedAt.value = new Date().toISOString()
      addLog('success', `Scan complete — ${data?.summary?.routes ?? scanned.value} routes scanned`)
    })

    ws.on('scan:cancelled', (data: any) => {
      status.value = 'cancelled'
      addLog('warn', `Scan cancelled${data?.reason ? `: ${data.reason}` : ''}`)
    })

    ws.on('scan:error', (data: any) => {
      status.value = 'error'
      error.value = data?.error || 'Unknown error'
      addLog('error', `Scan error: ${error.value}`)
    })

    ws.on('log', (data: any) => {
      const level = data.level === 'error' ? 'error' : data.level === 'warn' ? 'warn' : 'info'
      addLog(level, data.message)
    })
  }

  async function init(api: any, ws: any) {
    setupWsListeners(ws)
    try {
      const res = await api['scan.current']({})
      if (res.scanId) {
        scanId.value = res.scanId
        const [statusRes, metaRes] = await Promise.all([
          api['scan.status']({ scanId: res.scanId }).catch(() => null),
          api['scan.meta']({ scanId: res.scanId }).catch(() => null),
        ])
        if (metaRes) {
          site.value = metaRes.site
          device.value = metaRes.device
          startedAt.value = metaRes.startedAt
        }
        if (statusRes) {
          status.value = statusRes.status as ScanStatus
          completedAt.value = statusRes.completedAt
          discovered.value = statusRes.discovered
          scanned.value = statusRes.scanned
          failed.value = statusRes.failed
          total.value = statusRes.total
        }
      }
    }
    catch {}
  }

  async function startScan(api: any, siteUrl: string, options?: {
    device?: string
    mode?: 'site' | 'page'
    sampleSize?: number
    categories?: string[]
    ciBuild?: { branch?: string, hash?: string, message?: string }
  }) {
    const result = await api['scan.start']({
      site: siteUrl,
      device: options?.device,
      mode: options?.mode,
      sampleSize: options?.sampleSize,
      categories: options?.categories,
      ciBuild: options?.ciBuild,
    })
    scanId.value = result.scanId
    site.value = siteUrl
    status.value = 'starting'
    startedAt.value = result.startedAt
    completedAt.value = null
    error.value = null
    resetProgress()
    addLog('info', `Starting scan for ${siteUrl}`)
    return result
  }

  async function cancelScan(api: any) {
    if (!scanId.value) return
    await api['scan.cancel']({ scanId: scanId.value })
  }

  async function pauseScan(api: any) {
    if (!scanId.value) return
    await api['scan.pause']({ scanId: scanId.value })
  }

  async function resumeScan(api: any) {
    if (!scanId.value) return
    await api['scan.resume']({ scanId: scanId.value })
  }

  return {
    scanId,
    status,
    site,
    device,
    startedAt,
    completedAt,
    error,
    discovered,
    scanned,
    failed,
    total,
    percent,
    logs,
    recentRoutes,
    isActive,
    isFinished,
    init,
    startScan,
    cancelScan,
    pauseScan,
    resumeScan,
    addLog,
  }
})
