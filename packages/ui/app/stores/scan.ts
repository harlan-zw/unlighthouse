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

  // Running aggregates updated per `scan:route-complete`. We accumulate
  // across the whole scan rather than over recentRoutes (which is capped
  // at 20) so the avg + bucket counts stay accurate as the scan grows.
  const scoreSum = ref(0)
  const scoreCount = ref(0)
  const passCount = ref(0) // perf >= 0.9
  const needsWorkCount = ref(0) // 0.5 <= perf < 0.9
  const poorCount = ref(0) // perf < 0.5
  const avgPerfScore = computed(() => scoreCount.value > 0 ? scoreSum.value / scoreCount.value : null)

  // ETA: time-per-route across what's been scanned, projected over what's
  // left. Null when there's no signal (nothing scanned yet, or total = 0
  // because we haven't entered the discover phase). Updated reactively
  // whenever scanned/total change.
  const etaMs = computed<number | null>(() => {
    if (!startedAt.value || scanned.value === 0 || total.value === 0)
      return null
    const remaining = total.value - scanned.value
    if (remaining <= 0)
      return 0
    const elapsed = Date.now() - new Date(startedAt.value).getTime()
    const perRoute = elapsed / scanned.value
    return Math.round(perRoute * remaining)
  })

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
    scoreSum.value = 0
    scoreCount.value = 0
    passCount.value = 0
    needsWorkCount.value = 0
    poorCount.value = 0
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
      // Bucket thresholds match Lighthouse's standard pass/needs-work/poor
      // cutoffs. Skip rows where the audit couldn't produce a perf score
      // (errored runs, manual audits) — they shouldn't drag the avg down.
      if (typeof score === 'number') {
        scoreSum.value += score
        scoreCount.value++
        if (score >= 0.9)
          passCount.value++
        else if (score >= 0.5)
          needsWorkCount.value++
        else poorCount.value++
      }
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

  // --- Polling fallback (no-WS deploys, e.g. Cloudflare) -------------------
  // When the live-event socket is disabled (empty WS URL) there are no
  // `scan:*` events to drive the progress view, so the overview page polls
  // scan.status on an interval and we mirror the snapshot onto the same state
  // the WS listeners would set. ScanProgress / LiveResults then render
  // identically. WS deploys never start this loop, so the two paths can't fight.
  let pollHandle: ReturnType<typeof setInterval> | null = null

  function applyStatusSnapshot(s: any) {
    if (!s)
      return
    status.value = s.status as ScanStatus
    discovered.value = s.discovered ?? discovered.value
    scanned.value = s.scanned ?? scanned.value
    failed.value = s.failed ?? failed.value
    total.value = s.total ?? total.value
    if (s.startedAt)
      startedAt.value = s.startedAt
    if (s.completedAt)
      completedAt.value = s.completedAt
  }

  function applySummarySnapshot(sum: any) {
    if (!sum)
      return
    // Drive avg + buckets from the authoritative summary. scoreSum/scoreCount
    // are internal accumulators for the WS path; in poll mode we set them so
    // the existing `avgPerfScore` computed resolves to the summary's perf avg.
    const perf = sum.categoryAverages?.performance
    if (typeof perf === 'number') {
      scoreSum.value = perf
      scoreCount.value = 1
    }
    const d = sum.distribution
    if (d) {
      passCount.value = d.passing ?? 0
      needsWorkCount.value = d.needsWork ?? 0
      poorCount.value = d.poor ?? 0
    }
  }

  function applyRoutesSnapshot(res: any) {
    const items = res?.items
    if (!Array.isArray(items))
      return
    // The queue drains in order, so the tail rows are the most recently
    // audited. Show them newest-first, capped at 20 like the WS feed.
    recentRoutes.value = items
      .slice(-20)
      .reverse()
      .map((r: any) => ({ url: r.url, score: r.scorePerformance ?? null, timestamp: Date.now() }))
  }

  // Adopt an in-progress scan found via REST (overview deep-link or a freshly
  // started scan) so `isCurrentScan` + `isActive` switch the live view on.
  function hydrateActive(id: string, snapshot: any) {
    scanId.value = id
    if (snapshot?.site)
      site.value = snapshot.site
    applyStatusSnapshot(snapshot)
  }

  async function pollTick(api: any) {
    const id = scanId.value
    if (!id)
      return
    const [s, sum, routes] = await Promise.all([
      api['scan.status']({ scanId: id }).catch(() => null),
      api['scan.summary']({ scanId: id }).catch(() => null),
      api['query.routes']({ scanId: id }).catch(() => null),
    ])
    // A tick that resolves after the user switched scans must not clobber the
    // new scan's state.
    if (scanId.value !== id)
      return
    applyStatusSnapshot(s)
    applySummarySnapshot(sum)
    applyRoutesSnapshot(routes)
    if (isFinished.value)
      stopPolling()
  }

  function startPolling(api: any, intervalMs = 1500) {
    if (pollHandle)
      return
    void pollTick(api)
    pollHandle = setInterval(() => void pollTick(api), intervalMs)
  }

  function stopPolling() {
    if (pollHandle) {
      clearInterval(pollHandle)
      pollHandle = null
    }
  }

  async function cancelScan(api: any) {
    if (!scanId.value)
      return
    await api['scan.cancel']({ scanId: scanId.value })
  }

  async function pauseScan(api: any) {
    if (!scanId.value)
      return
    await api['scan.pause']({ scanId: scanId.value })
  }

  async function resumeScan(api: any) {
    if (!scanId.value)
      return
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
    scoreSum,
    scoreCount,
    avgPerfScore,
    passCount,
    needsWorkCount,
    poorCount,
    etaMs,
    isActive,
    isFinished,
    init,
    startScan,
    cancelScan,
    pauseScan,
    resumeScan,
    addLog,
    hydrateActive,
    startPolling,
    stopPolling,
  }
})
