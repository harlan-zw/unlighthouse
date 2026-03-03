import type { HTMLExtractPayload, UnlighthouseRouteReport } from '../../types'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { useLogger } from '../../logger'
import { processScanData } from '../../process'
import { useUnlighthouse } from '../../unlighthouse'
import * as history from './index'

// Collect HTML data during scan for SEO processing
const htmlDataMap = new Map<string, HTMLExtractPayload>()

let currentScanId: string | null = null
const routeIdMap = new Map<string, number>() // Map route path to scan_route id

/**
 * Extract CWV metrics from a Lighthouse report
 */
function extractCwvMetrics(lhr: any) {
  const getNumeric = (auditId: string): number | null =>
    lhr.audits?.[auditId]?.numericValue ?? null

  return {
    lcp: getNumeric('largest-contentful-paint'),
    cls: Math.round((getNumeric('cumulative-layout-shift') ?? 0) * 1000), // Store as x1000 int
    tbt: getNumeric('total-blocking-time'),
    fcp: getNumeric('first-contentful-paint'),
    si: getNumeric('speed-index'),
    ttfb: getNumeric('server-response-time'),
  }
}

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
  htmlDataMap.clear()

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

    // Collect SEO data when HTML inspection completes
    if (taskName === 'inspectHtmlTask' && report.seo) {
      htmlDataMap.set(report.route.path, report.seo)
    }

    // Update route with scores when lighthouse completes
    if (taskName === 'runLighthouseTask' && report.report) {
      // Categories is an array of { key, id, title, score } objects
      const categoriesArr = report.report.categories || []
      const getScore = (key: string) => {
        const cat = categoriesArr.find((c: any) => c.key === key || c.id === key)
        return cat?.score != null ? Math.round(cat.score * 100) : null
      }

      // Try to read the raw LHR file to extract CWV metrics
      let cwvMetrics: ReturnType<typeof extractCwvMetrics> | null = null
      let lhrGzip: Buffer | null = null

      const lhrPath = join(report.artifactPath, 'lighthouse.json')
      if (existsSync(lhrPath)) {
        const lhrJson = readFileSync(lhrPath, 'utf-8')
        const lhr = JSON.parse(lhrJson)
        cwvMetrics = extractCwvMetrics(lhr)
        // Gzip the LHR for storage
        lhrGzip = gzipSync(lhrJson)
      }

      history.updateScanRoute(resolvedConfig.outputPath, routeDbId, {
        status: 'complete',
        score: report.report.score ? Math.round(report.report.score * 100) : null,
        performanceScore: getScore('performance'),
        accessibilityScore: getScore('accessibility'),
        bestPracticesScore: getScore('best-practices'),
        seoScore: getScore('seo'),
        // CWV metrics
        ...(cwvMetrics && {
          lcp: cwvMetrics.lcp ? Math.round(cwvMetrics.lcp) : null,
          cls: cwvMetrics.cls,
          tbt: cwvMetrics.tbt ? Math.round(cwvMetrics.tbt) : null,
          fcp: cwvMetrics.fcp ? Math.round(cwvMetrics.fcp) : null,
          si: cwvMetrics.si ? Math.round(cwvMetrics.si) : null,
          ttfb: cwvMetrics.ttfb ? Math.round(cwvMetrics.ttfb) : null,
        }),
        // Gzipped LHR
        ...(lhrGzip && { lhrGzip }),
        scannedAt: new Date(),
      })

      // Update aggregate scores
      history.updateScanScores(resolvedConfig.outputPath, currentScanId)
    }
  })

  // Track when worker finishes
  hooks.hook('worker-finished', async () => {
    if (!currentScanId)
      return

    logger.debug(`Scan complete, updating history: ${currentScanId}`)

    history.updateScan(resolvedConfig.outputPath, currentScanId, {
      status: 'complete',
      completedAt: new Date(),
    })

    // Final score update
    history.updateScanScores(resolvedConfig.outputPath, currentScanId)

    // Process scan data for dashboard views, passing collected HTML data
    const db = history.getHistoryDb(resolvedConfig.outputPath)
    logger.debug(`Processing dashboard data for scan: ${currentScanId} with ${htmlDataMap.size} HTML entries`)
    processScanData(db, currentScanId, htmlDataMap).catch((err) => {
      logger.error(`Failed to process scan data: ${err}`)
    })
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
