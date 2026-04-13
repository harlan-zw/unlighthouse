import type { BestPracticesSummary, ProcessorParams } from './types'
import { consoleErrors, deprecatedApis, detectedLibraries, securityIssues } from '../data/history/schema'

interface ConsoleErrorData {
  message: string
  normalized: string
  sourceType: string
  sourceFile?: string
  stackTrace?: string
  count: number
  pages: Set<string>
}

interface LibraryData {
  name: string
  version?: string
  pages: Set<string>
}

interface DeprecatedApiData {
  api: string
  description?: string
  sourceFile?: string
  isThirdParty: boolean
  pages: Set<string>
}

interface SecurityIssue {
  type: string
  severity: string
  path: string
  details?: any
}

function normalizeError(msg: string): string {
  return msg
    .replace(/:\d+:\d+/g, ':X:X') // line:col numbers
    .replace(/0x[\da-f]+/gi, '0xXXX') // hex addresses
    .replace(/\d{10,}/g, 'TIMESTAMP') // timestamps
    .slice(0, 200)
}

function classifySource(source: string | undefined, msg: string, siteHost?: string): string {
  if (msg.includes('CSP') || msg.includes('Content-Security-Policy'))
    return 'csp'
  if (msg.includes('net::') || msg.includes('Failed to load'))
    return 'network'
  if (source && siteHost && !source.includes(siteHost))
    return 'thirdParty'
  return 'app'
}

function isThirdPartyUrl(url: string | undefined, siteHost?: string): boolean {
  if (!url || !siteHost)
    return false
  return !url.includes(siteHost)
}

function getSecurityDescription(type: string): string {
  return ({
    'mixed-content': 'Page contains mixed content (HTTP resources on HTTPS page)',
    'unsafe-link': 'External links missing rel="noopener" or rel="noreferrer"',
    'csp': 'Content Security Policy issues detected',
    'hsts': 'HTTP Strict Transport Security not configured',
  })[type] ?? type
}

function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = String(item[key])
    acc[k] = acc[k] ?? []
    acc[k].push(item)
    return acc
  }, {} as Record<string, T[]>)
}

export async function processBestPractices(p: ProcessorParams): Promise<BestPracticesSummary> {
  const { db, scanId, routes, siteHost } = p

  // 1. Console errors - group by normalized message
  const errorMap = new Map<string, ConsoleErrorData>()

  for (const [path, route] of routes) {
    const items = route.audits['errors-in-console']?.details?.items ?? []
    for (const item of items) {
      const normalized = normalizeError(item.description ?? item.text ?? '')
      const existing = errorMap.get(normalized) ?? {
        message: item.description ?? item.text ?? '',
        normalized,
        sourceType: classifySource(item.source, item.description ?? '', siteHost),
        sourceFile: item.source,
        stackTrace: item.stackTrace,
        count: 0,
        pages: new Set<string>(),
      }
      existing.count++
      existing.pages.add(path)
      errorMap.set(normalized, existing)
    }
  }

  const errorValues = [...errorMap.values()].map(err => ({
    scanId,
    message: err.message,
    normalizedMessage: err.normalized,
    sourceType: err.sourceType,
    sourceFile: err.sourceFile,
    stackTrace: err.stackTrace,
    instanceCount: err.count,
    pageCount: err.pages.size,
    pages: JSON.stringify([...err.pages]),
  }))

  if (errorValues.length > 0) {
    db.insert(consoleErrors).values(errorValues).run()
  }

  // 2. Detected libraries
  const libMap = new Map<string, LibraryData>()

  for (const [path, route] of routes) {
    const items = route.audits['js-libraries']?.details?.items ?? []
    for (const item of items) {
      const key = `${item.name}@${item.version ?? 'unknown'}`
      const existing = libMap.get(key) ?? {
        name: item.name,
        version: item.version,
        pages: new Set<string>(),
      }
      existing.pages.add(path)
      libMap.set(key, existing)
    }
  }

  const libValues = [...libMap.values()].map(lib => ({
    scanId,
    name: lib.name,
    version: lib.version,
    status: 'current', // TODO: check against vulnerability DB
    pageCount: lib.pages.size,
    pages: JSON.stringify([...lib.pages]),
  }))

  if (libValues.length > 0) {
    db.insert(detectedLibraries).values(libValues).run()
  }

  // 3. Deprecated APIs
  const apiMap = new Map<string, DeprecatedApiData>()

  for (const [path, route] of routes) {
    const items = route.audits.deprecations?.details?.items ?? []
    for (const item of items) {
      const api = item.value ?? item.description ?? 'Unknown API'
      const existing = apiMap.get(api) ?? {
        api,
        description: item.description,
        sourceFile: item.source,
        isThirdParty: isThirdPartyUrl(item.source, siteHost),
        pages: new Set<string>(),
      }
      existing.pages.add(path)
      apiMap.set(api, existing)
    }
  }

  const apiValues = [...apiMap.values()].map(api => ({
    scanId,
    api: api.api,
    description: api.description,
    sourceFile: api.sourceFile,
    isThirdParty: api.isThirdParty,
    pageCount: api.pages.size,
    pages: JSON.stringify([...api.pages]),
  }))

  if (apiValues.length > 0) {
    db.insert(deprecatedApis).values(apiValues).run()
  }

  // 4. Security issues
  const securityIssuesList: SecurityIssue[] = []

  for (const [path, route] of routes) {
    // Mixed content
    if (route.audits['is-on-https']?.score !== 1) {
      securityIssuesList.push({
        type: 'mixed-content',
        severity: 'high',
        path,
        details: route.audits['is-on-https']?.details,
      })
    }

    // Unsafe links
    const unsafeLinks = route.audits['external-anchors-use-rel-noopener']?.details?.items ?? []
    if (unsafeLinks.length) {
      securityIssuesList.push({
        type: 'unsafe-link',
        severity: 'medium',
        path,
        details: { links: unsafeLinks },
      })
    }
  }

  // Group security issues by type
  const securityByType = groupBy(securityIssuesList, 'type')
  const securityValues = Object.entries(securityByType).map(([type, issues]) => ({
    scanId,
    type,
    severity: issues[0].severity,
    description: getSecurityDescription(type),
    details: JSON.stringify(issues.map(i => i.details)),
    pageCount: issues.length,
    pages: JSON.stringify(issues.map(i => i.path)),
  }))

  if (securityValues.length > 0) {
    db.insert(securityIssues).values(securityValues).run()
  }

  return computeBestPracticesSummary(errorMap, libMap, apiMap, securityByType)
}

function computeBestPracticesSummary(errorMap: Map<string, ConsoleErrorData>, libMap: Map<string, LibraryData>, apiMap: Map<string, DeprecatedApiData>, securityByType: Record<string, SecurityIssue[]>): BestPracticesSummary {
  return {
    consoleErrorCount: errorMap.size,
    deprecatedApiCount: apiMap.size,
    vulnerableLibCount: 0, // TODO: check vuln DB
    securityIssueCount: Object.keys(securityByType).length,
    outdatedLibCount: 0, // TODO: check version DB
  }
}
