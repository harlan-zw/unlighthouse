import type { BestPracticesSummary, ProcessorParams } from './types'
import { consoleErrors, deprecatedApis, detectedLibraries, securityIssues, vulnerableLibraries } from '../storage/drizzle/schema/history'
import { findVulnerabilities } from './vulnerabilities'

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
    'csp': 'Content Security Policy missing or ineffective',
    'hsts': 'HTTP Strict Transport Security not configured',
  })[type] ?? type
}

function getSecuritySeverity(type: string): string {
  return ({
    'mixed-content': 'high',
    'unsafe-link': 'medium',
    'csp': 'medium',
    'hsts': 'low',
  })[type] ?? 'low'
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

  // Match detected libraries against bundled vulnerability DB
  const vulnMatches = findVulnerabilities([...libMap.values()].map(l => ({ name: l.name, version: l.version })))
  const vulnByKey = new Map(vulnMatches.map(v => [`${v.name.toLowerCase()}@${v.version}`, v]))

  const libValues = [...libMap.values()].map((lib) => {
    const key = `${lib.name.toLowerCase()}@${lib.version}`
    const hasVuln = vulnByKey.has(key)
    return {
      scanId,
      name: lib.name,
      version: lib.version,
      status: hasVuln ? 'vulnerable' : 'current',
      pageCount: lib.pages.size,
      pages: JSON.stringify([...lib.pages]),
    }
  })

  if (libValues.length > 0) {
    db.insert(detectedLibraries).values(libValues).run()
  }

  // Insert vulnerable-library records (aggregating pages across all matching lib entries)
  const vulnValues = vulnMatches.map((v) => {
    const key = `${v.name.toLowerCase()}@${v.version}`
    const pages = [...(libMap.get(`${v.name}@${v.version}`)?.pages ?? [])]
    return {
      scanId,
      name: v.name,
      version: v.version,
      severity: v.severity,
      cves: JSON.stringify(v.cves),
      description: v.description,
      recommendation: v.recommendation,
      pageCount: pages.length,
      pages: JSON.stringify(pages),
      _key: key,
    }
  }).map(({ _key, ...rest }) => rest)

  if (vulnValues.length > 0) {
    db.insert(vulnerableLibraries).values(vulnValues).run()
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

    // CSP (csp-xss audit): score 1 = effective, otherwise weak/missing
    const csp = route.audits['csp-xss']
    if (csp && csp.score !== 1 && csp.score !== null) {
      securityIssuesList.push({
        type: 'csp',
        severity: 'medium',
        path,
        details: csp.details,
      })
    }

    // HSTS (has-hsts audit): score 0 = missing/weak. Informative score 1 runs
    // may still list suggestions (missing preload / includeSubDomains) — we flag
    // only when the top-level score indicates failure.
    const hsts = route.audits['has-hsts']
    if (hsts && hsts.score === 0) {
      securityIssuesList.push({
        type: 'hsts',
        severity: 'low',
        path,
        details: hsts.details,
      })
    }
  }

  // Group security issues by type
  const securityByType = groupBy(securityIssuesList, 'type')
  const securityValues = Object.entries(securityByType).map(([type, issues]) => ({
    scanId,
    type,
    severity: getSecuritySeverity(type),
    description: getSecurityDescription(type),
    details: JSON.stringify(issues.map(i => i.details)),
    pageCount: issues.length,
    pages: JSON.stringify(issues.map(i => i.path)),
  }))

  if (securityValues.length > 0) {
    db.insert(securityIssues).values(securityValues).run()
  }

  return computeBestPracticesSummary(errorMap, libMap, apiMap, securityByType, vulnMatches.length)
}

function computeBestPracticesSummary(errorMap: Map<string, ConsoleErrorData>, libMap: Map<string, LibraryData>, apiMap: Map<string, DeprecatedApiData>, securityByType: Record<string, SecurityIssue[]>, vulnCount: number): BestPracticesSummary {
  return {
    consoleErrorCount: errorMap.size,
    deprecatedApiCount: apiMap.size,
    vulnerableLibCount: vulnCount,
    securityIssueCount: Object.keys(securityByType).length,
    outdatedLibCount: 0,
  }
}
