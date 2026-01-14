import type { UnlighthouseRouteReport } from '../../types'
import { randomUUID } from 'node:crypto'
import { useLogger } from '../../logger'
import { useUnlighthouse } from '../../unlighthouse'
import * as history from '@unlighthouse/db'

let currentScanId: string | null = null
const routeIdMap = new Map<string, number>() // Map route path to scan_route id

/**
 * Get current scan ID
 */
export function getCurrentScanId(): string | null {
  return currentScanId
}

/**
 * Initialize history tracking for a scan session
 * Call this when the scan starts
 */
export function initHistoryTracking() {
  const { hooks, resolvedConfig, runtimeSettings } = useUnlighthouse()
  const logger = useLogger()

  // Create scan record
  currentScanId = randomUUID()
  routeIdMap.clear()

  logger.debug(`Creating history record for scan: ${currentScanId}`)

  history.createScan(resolvedConfig.outputPath, {
    id: currentScanId,
    site: resolvedConfig.site,
    device: resolvedConfig.scanner?.device || 'mobile',
    throttle: resolvedConfig.scanner?.throttle || false,
    reportPath: runtimeSettings.outputPath,
    status: 'running',
  })

  // Track when routes are added
  hooks.hook('task-added', (path: string, report: UnlighthouseRouteReport) => {
    if (!currentScanId)
      return

    const route = history.addScanRoute(resolvedConfig.outputPath, {
      scanId: currentScanId,
      path: report.route.path,
      url: report.route.url,
      status: 'pending',
    })

    routeIdMap.set(report.route.path, route.id)

    // Update route count
    history.updateScan(resolvedConfig.outputPath, currentScanId, {
      routeCount: routeIdMap.size,
    })
  })

  // Track when tasks complete
  hooks.hook('task-complete', (path: string, report: UnlighthouseRouteReport, taskName: string) => {
    if (!currentScanId)
      return

    const routeDbId = routeIdMap.get(report.route.path)
    if (!routeDbId)
      return

    // Update route with scores when lighthouse completes
    if (taskName === 'runLighthouseTask' && report.report) {
      const categories = report.report.categories || {}

      history.updateScanRoute(resolvedConfig.outputPath, routeDbId, {
        status: 'complete',
        score: report.report.score ? Math.round(report.report.score) : null,
        performanceScore: categories.performance?.score ? Math.round(categories.performance.score * 100) : null,
        accessibilityScore: categories.accessibility?.score ? Math.round(categories.accessibility.score * 100) : null,
        bestPracticesScore: categories['best-practices']?.score ? Math.round(categories['best-practices'].score * 100) : null,
        seoScore: categories.seo?.score ? Math.round(categories.seo.score * 100) : null,
        scannedAt: new Date(),
      })

      // Update aggregate scores
      history.updateScanScores(resolvedConfig.outputPath, currentScanId)
    }
  })

  // Track when worker finishes
  hooks.hook('worker-finished', () => {
    if (!currentScanId)
      return

    logger.debug(`Scan complete, updating history: ${currentScanId}`)

    history.updateScan(resolvedConfig.outputPath, currentScanId, {
      status: 'complete',
      completedAt: new Date(),
    })

    // Final score update
    history.updateScanScores(resolvedConfig.outputPath, currentScanId)
  })
}

/**
 * Mark current scan as cancelled
 */
export function cancelHistoryTracking() {
  const { resolvedConfig } = useUnlighthouse()

  if (currentScanId) {
    history.updateScan(resolvedConfig.outputPath, currentScanId, {
      status: 'cancelled',
      completedAt: new Date(),
    })
    currentScanId = null
  }
}

/**
 * Mark current scan as failed
 */
export function failHistoryTracking(error: string) {
  const { resolvedConfig } = useUnlighthouse()

  if (currentScanId) {
    history.updateScan(resolvedConfig.outputPath, currentScanId, {
      status: 'failed',
      error,
      completedAt: new Date(),
    })
    currentScanId = null
  }
}
