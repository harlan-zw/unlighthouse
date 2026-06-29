import { defineStore } from 'pinia'
import type { ScanId } from '@unlighthouse/contracts'
import type { UnlighthouseClient } from '@unlighthouse/core/api/client'
import { createScanProgressState, type ActiveScanSnapshot } from '~/features/scan/progress-state'
import type { ScanEventBus } from '~/types/scan-events'

type ScanStartOptions = Omit<Parameters<UnlighthouseClient['scan.start']>[0], 'site'>

export const useScanStore = defineStore('scan', () => {
  const progress = createScanProgressState()
  const {
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
  } = progress

  function setupWsListeners(ws: ScanEventBus) {
    ws.on('scan:created', progress.applyCreated)
    ws.on('scan:started', progress.applyStarted)
    ws.on('scan:discovering', progress.applyDiscovering)
    ws.on('scan:scanning', progress.applyScanning)
    ws.on('scan:progress', progress.applyProgress)
    ws.on('scan:route-complete', progress.applyRouteComplete)
    ws.on('scan:route-failed', progress.applyRouteFailed)
    ws.on('scan:paused', progress.applyPaused)
    ws.on('scan:resumed', progress.applyResumed)
    ws.on('scan:complete', progress.applyComplete)
    ws.on('scan:cancelled', progress.applyCancelled)
    ws.on('scan:error', progress.applyError)
    ws.on('log', progress.applyLog)
  }

  async function init(api: UnlighthouseClient, ws: ScanEventBus) {
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
        progress.applyStatusSnapshot(statusRes)
      }
    }
    catch {}
  }

  async function startScan(api: UnlighthouseClient, siteUrl: string, options?: ScanStartOptions) {
    const result = await api['scan.start']({
      site: siteUrl,
      device: options?.device,
      mode: options?.mode,
      sampleSize: options?.sampleSize,
      categories: options?.categories,
      ciBuild: options?.ciBuild,
    })
    progress.prepareStartedScan(result.scanId, siteUrl, result.startedAt)
    return result
  }

  // --- Polling fallback (no-WS deploys, e.g. Cloudflare) -------------------
  // When the live-event socket is disabled (empty WS URL) there are no
  // `scan:*` events to drive the progress view, so the overview page polls
  // scan.status on an interval and mirrors the snapshot onto the same state
  // the WS reducers would set. WS deploys never start this loop, so the two
  // paths cannot fight.
  let pollHandle: ReturnType<typeof setInterval> | null = null

  async function pollTick(api: UnlighthouseClient) {
    const id = scanId.value
    if (!id)
      return
    const [s, sum, routes] = await Promise.all([
      api['scan.status']({ scanId: id }).catch(() => null),
      api['scan.summary']({ scanId: id }).catch(() => null),
      api['query.routes']({ scanId: id, page: 1, pageSize: 50 }).catch(() => null),
    ])
    // A tick that resolves after the user switched scans must not clobber the
    // new scan's state.
    if (scanId.value !== id)
      return
    progress.applyStatusSnapshot(s)
    progress.applySummarySnapshot(sum)
    progress.applyRoutesSnapshot(routes)
    if (isFinished.value)
      stopPolling()
  }

  function startPolling(api: UnlighthouseClient, intervalMs = 1500) {
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

  async function cancelScan(api: UnlighthouseClient) {
    if (!scanId.value)
      return
    await api['scan.cancel']({ scanId: scanId.value })
  }

  async function pauseScan(api: UnlighthouseClient) {
    if (!scanId.value)
      return
    await api['scan.pause']({ scanId: scanId.value })
  }

  async function resumeScan(api: UnlighthouseClient) {
    if (!scanId.value)
      return
    await api['scan.resume']({ scanId: scanId.value })
  }

  function hydrateActive(id: ScanId, snapshot: ActiveScanSnapshot | null) {
    progress.hydrateActive(id, snapshot)
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
    addLog: progress.addLog,
    hydrateActive,
    startPolling,
    stopPolling,
  }
})
