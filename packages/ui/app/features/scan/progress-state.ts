import type { Device, ScanId } from '@unlighthouse/contracts'
import type { UnlighthouseClient } from '@unlighthouse/core/api/client'
import type { ScanEventPayloads, UiScanStatus } from '~/types/scan-events'
import { computed, ref } from 'vue'

export interface LogEntry {
  id: number
  timestamp: number
  level: 'info' | 'warn' | 'error' | 'success'
  message: string
}

export type ScanStatusSnapshot = Awaited<ReturnType<UnlighthouseClient['scan.status']>>
export type ScanSummarySnapshot = Awaited<ReturnType<UnlighthouseClient['scan.summary']>>
export type RouteListSnapshot = Awaited<ReturnType<UnlighthouseClient['query.routes']>>
export type ActiveScanSnapshot = Partial<ScanStatusSnapshot> & { site?: string | null }

export function createScanProgressState() {
  const scanId = ref<ScanId | null>(null)
  const status = ref<UiScanStatus>('idle')
  const site = ref<string | null>(null)
  const device = ref<Device | null>(null)
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
  let logId = 0

  const recentRoutes = ref<Array<{ url: string, score: number | null, timestamp: number }>>([])

  const scoreSum = ref(0)
  const scoreCount = ref(0)
  const passCount = ref(0)
  const needsWorkCount = ref(0)
  const poorCount = ref(0)
  const avgPerfScore = computed(() => scoreCount.value > 0 ? scoreSum.value / scoreCount.value : null)

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
    if (logs.value.length > MAX_LOGS)
      logs.value = logs.value.slice(-MAX_LOGS)
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

  function applyCreated(data: ScanEventPayloads['scan:created']) {
    scanId.value = data.scanId
    site.value = data.site
    status.value = 'starting'
    startedAt.value = data.startedAt
    completedAt.value = null
    error.value = null
    resetProgress()
    addLog('info', `Scan created for ${data.site}`)
  }

  function applyStarted() {
    status.value = 'starting'
    addLog('info', 'Scan started')
  }

  function applyDiscovering() {
    status.value = 'discovering'
    addLog('info', 'Discovering routes...')
  }

  function applyScanning(data: ScanEventPayloads['scan:scanning']) {
    status.value = 'scanning'
    addLog('info', `Scanning ${data?.discovered ?? 0} discovered routes`)
  }

  function applyProgress(data: ScanEventPayloads['scan:progress']) {
    discovered.value = data.discovered ?? 0
    scanned.value = data.scanned ?? 0
    failed.value = data.failed ?? 0
    total.value = data.total ?? 0
  }

  function applyRouteComplete(data: ScanEventPayloads['scan:route-complete']) {
    const score = data.metrics?.scorePerformance ?? null
    recentRoutes.value = [
      { url: data.url, score, timestamp: Date.now() },
      ...recentRoutes.value,
    ].slice(0, 20)

    if (typeof score === 'number') {
      scoreSum.value += score
      scoreCount.value++
      const band = scoreBand(score)
      if (band === 'good')
        passCount.value++
      else if (band === 'average')
        needsWorkCount.value++
      else poorCount.value++
    }
    addLog('success', `${data.url}`)
  }

  function applyRouteFailed(data: ScanEventPayloads['scan:route-failed']) {
    addLog('error', `Failed: ${data.url} — ${data.error || 'Unknown error'}`)
  }

  function applyPaused() {
    status.value = 'paused'
    addLog('warn', 'Scan paused')
  }

  function applyResumed() {
    status.value = 'scanning'
    addLog('info', 'Scan resumed')
  }

  function applyComplete(data: ScanEventPayloads['scan:complete']) {
    status.value = 'complete'
    completedAt.value = new Date().toISOString()
    addLog('success', `Scan complete — ${data?.summary?.routes ?? scanned.value} routes scanned`)
  }

  function applyCancelled(data: ScanEventPayloads['scan:cancelled']) {
    status.value = 'cancelled'
    addLog('warn', `Scan cancelled${data?.reason ? `: ${data.reason}` : ''}`)
  }

  function applyError(data: ScanEventPayloads['scan:error']) {
    status.value = 'error'
    error.value = data?.error || 'Unknown error'
    addLog('error', `Scan error: ${error.value}`)
  }

  function applyLog(data: ScanEventPayloads['log']) {
    const level = data.level === 'error' ? 'error' : data.level === 'warn' ? 'warn' : 'info'
    addLog(level, data.message)
  }

  function applyStatusSnapshot(s: Partial<ScanStatusSnapshot> | null) {
    if (!s)
      return
    if (s.status)
      status.value = s.status
    discovered.value = s.discovered ?? discovered.value
    scanned.value = s.scanned ?? scanned.value
    failed.value = s.failed ?? failed.value
    total.value = s.total ?? total.value
    if (s.startedAt)
      startedAt.value = s.startedAt
    if (s.completedAt)
      completedAt.value = s.completedAt
  }

  function applySummarySnapshot(sum: ScanSummarySnapshot | null) {
    if (!sum)
      return
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

  function applyRoutesSnapshot(res: RouteListSnapshot | null) {
    const items = res?.items
    if (!Array.isArray(items))
      return
    recentRoutes.value = items
      .slice(-20)
      .reverse()
      .map(r => ({ url: r.url, score: r.scorePerformance ?? null, timestamp: Date.now() }))
  }

  function hydrateActive(id: ScanId, snapshot: ActiveScanSnapshot | null) {
    scanId.value = id
    if (snapshot?.site)
      site.value = snapshot.site
    applyStatusSnapshot(snapshot)
  }

  function prepareStartedScan(id: ScanId, siteUrl: string, startedAtValue: string) {
    scanId.value = id
    site.value = siteUrl
    status.value = 'starting'
    startedAt.value = startedAtValue
    completedAt.value = null
    error.value = null
    resetProgress()
    addLog('info', `Starting scan for ${siteUrl}`)
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
    addLog,
    resetProgress,
    applyCreated,
    applyStarted,
    applyDiscovering,
    applyScanning,
    applyProgress,
    applyRouteComplete,
    applyRouteFailed,
    applyPaused,
    applyResumed,
    applyComplete,
    applyCancelled,
    applyError,
    applyLog,
    applyStatusSnapshot,
    applySummarySnapshot,
    applyRoutesSnapshot,
    hydrateActive,
    prepareStartedScan,
  }
}
