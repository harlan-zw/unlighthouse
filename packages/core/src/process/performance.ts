import type { PerformanceSummary, ProcessorParams } from './types'
import { lcpElements, performanceIssues, thirdPartyScripts } from '../data/history/schema'

interface ImageIssue {
  url: string
  wastedBytes: number
  pages: string[]
  issues: Set<string>
}

interface ThirdPartyData {
  entity: string
  url: string
  tbtSum: number
  pages: string[]
}

interface LcpData {
  selector: string
  elementType: string
  lcpSum: number
  pages: string[]
}

function auditToIssueType(auditId: string): string {
  return ({
    'uses-optimized-images': 'format',
    'uses-responsive-images': 'resize',
    'offscreen-images': 'lazy',
    'modern-image-formats': 'format',
    'uses-webp-images': 'format',
  })[auditId] ?? 'unknown'
}

export async function processPerformance(p: ProcessorParams): Promise<PerformanceSummary> {
  const { db, scanId, routes } = p

  // 1. Aggregate images across pages
  const imageMap = new Map<string, ImageIssue>()
  const imageAudits = ['uses-optimized-images', 'uses-responsive-images', 'offscreen-images', 'modern-image-formats']

  for (const [path, route] of routes) {
    for (const auditId of imageAudits) {
      const items = route.audits[auditId]?.details?.items ?? []
      for (const item of items) {
        const url = item.url
        if (!url)
          continue
        const existing = imageMap.get(url) ?? {
          url,
          wastedBytes: 0,
          pages: [],
          issues: new Set<string>(),
        }
        existing.wastedBytes += item.wastedBytes ?? 0
        existing.pages.push(path)
        existing.issues.add(auditToIssueType(auditId))
        imageMap.set(url, existing)
      }
    }
  }

  // 2. Insert deduplicated image issues
  const imageIssues = [...imageMap.values()].map(img => ({
    scanId,
    type: 'image',
    url: img.url,
    wastedBytes: img.wastedBytes,
    pageCount: [...new Set(img.pages)].length,
    pages: JSON.stringify([...new Set(img.pages)]),
    issueSubtype: [...img.issues].join(','),
  }))

  if (imageIssues.length > 0) {
    db.insert(performanceIssues).values(imageIssues).run()
  }

  // 3. Third-party scripts
  const thirdPartyMap = new Map<string, ThirdPartyData>()
  for (const [path, route] of routes) {
    const items = route.audits['third-party-summary']?.details?.items ?? []
    for (const item of items) {
      const entity = item.entity?.text ?? item.entity ?? 'Unknown'
      const existing = thirdPartyMap.get(entity) ?? {
        entity,
        url: item.url ?? '',
        tbtSum: 0,
        pages: [],
      }
      existing.tbtSum += item.blockingTime ?? item.mainThreadTime ?? 0
      existing.pages.push(path)
      thirdPartyMap.set(entity, existing)
    }
  }

  const thirdParty = [...thirdPartyMap.values()].map(tp => ({
    scanId,
    entity: tp.entity,
    url: tp.url,
    avgTbt: tp.pages.length > 0 ? Math.round(tp.tbtSum / tp.pages.length) : 0,
    totalTbt: Math.round(tp.tbtSum),
    pageCount: [...new Set(tp.pages)].length,
    pages: JSON.stringify([...new Set(tp.pages)]),
  }))

  if (thirdParty.length > 0) {
    db.insert(thirdPartyScripts).values(thirdParty).run()
  }

  // 4. LCP elements
  const lcpMap = new Map<string, LcpData>()
  for (const [path, route] of routes) {
    const items = route.audits['largest-contentful-paint-element']?.details?.items ?? []
    const lcpItem = items[0]
    if (!lcpItem?.node?.selector)
      continue

    const selector = lcpItem.node.selector
    const existing = lcpMap.get(selector) ?? {
      selector,
      elementType: lcpItem.node.nodeLabel?.startsWith('<img') ? 'image' : 'text',
      lcpSum: 0,
      pages: [],
    }
    existing.lcpSum += route.lcp ?? 0
    existing.pages.push(path)
    lcpMap.set(selector, existing)
  }

  const lcpData = [...lcpMap.values()].map(lcp => ({
    scanId,
    selector: lcp.selector,
    elementType: lcp.elementType,
    avgLcp: lcp.pages.length > 0 ? Math.round(lcp.lcpSum / lcp.pages.length) : 0,
    pageCount: lcp.pages.length,
    pages: JSON.stringify(lcp.pages),
  }))

  if (lcpData.length > 0) {
    db.insert(lcpElements).values(lcpData).run()
  }

  // Compute summary
  return computePerformanceSummary(routes, imageMap, thirdPartyMap)
}

function computePerformanceSummary(routes: Map<string, any>, imageMap: Map<string, ImageIssue>, thirdPartyMap: Map<string, ThirdPartyData>): PerformanceSummary {
  const routeValues = [...routes.values()]
  const count = routeValues.length || 1

  const sum = (fn: (r: any) => number | null) =>
    routeValues.reduce((acc, r) => acc + (fn(r) ?? 0), 0)

  const totalWastedBytes = [...imageMap.values()].reduce((acc, img) => acc + img.wastedBytes, 0)

  return {
    avgLcp: Math.round(sum(r => r.lcp) / count),
    avgCls: Math.round(sum(r => r.cls) / count),
    avgTbt: Math.round(sum(r => r.tbt) / count),
    avgFcp: Math.round(sum(r => r.fcp) / count),
    avgSi: Math.round(sum(r => r.si) / count),
    avgTtfb: Math.round(sum(r => r.ttfb) / count),
    imageIssueCount: imageMap.size,
    thirdPartyCount: thirdPartyMap.size,
    totalWastedBytes,
    totalWastedMs: 0, // TODO: calculate from render-blocking resources
  }
}
