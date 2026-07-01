// `agentic-browsing` pack — Lighthouse 13 agentic browsing category analysis.
//
// Lighthouse's agentic category is displayed as a fraction, and several of its
// WebMCP audits are informational. This pack reads raw LHR details when
// available so "informative pass" does not become a false positive.

import type { AgenticBrowsingReport, Pack, PackReconcileCtx } from '@unlighthouse/contracts/packs'
import type { AuditFinding, ReconciledReport, ScanRoute } from '@unlighthouse/contracts/types/atoms'
import { AgenticBrowsingReportSchema } from '@unlighthouse/contracts/packs'

const AGENTIC_AUDIT_IDS = [
  'agent-accessibility-tree',
  'webmcp-registered-tools',
  'webmcp-form-coverage',
  'webmcp-schema-validity',
  'cumulative-layout-shift',
  'llms-txt',
] as const

interface RawAudit {
  score?: number | null
  scoreDisplayMode?: string
  displayValue?: string
  explanation?: string
  title?: string
  numericValue?: number
  details?: unknown
}

interface RawLhr {
  categories?: Record<string, {
    score?: number | null
    categoryScoreDisplayMode?: string
    auditRefs?: Array<{ id: string, weight?: number }>
  }>
  audits?: Record<string, RawAudit>
}

interface FindingBucket {
  title: string | null
  passing: number
  failing: string[]
  total: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function rawAudit(lhr: unknown, id: string): RawAudit | null {
  return isRecord(lhr) && isRecord(lhr.audits) && isRecord(lhr.audits[id])
    ? lhr.audits[id] as RawAudit
    : null
}

function rawCategory(lhr: unknown): NonNullable<RawLhr['categories']>[string] | null {
  return isRecord(lhr) && isRecord(lhr.categories) && isRecord(lhr.categories['agentic-browsing'])
    ? lhr.categories['agentic-browsing'] as NonNullable<RawLhr['categories']>[string]
    : null
}

function countObjectsWithKey(value: unknown, key: string): number {
  if (Array.isArray(value))
    return value.reduce((sum, item) => sum + countObjectsWithKey(item, key), 0)
  if (!isRecord(value))
    return 0

  let count = Object.hasOwn(value, key) ? 1 : 0
  for (const child of Object.values(value))
    count += countObjectsWithKey(child, key)
  return count
}

function countTableRows(details: unknown): number {
  if (!isRecord(details))
    return 0
  const items = details.items
  if (details.type === 'table' && Array.isArray(items))
    return items.length
  if (Array.isArray(items))
    return items.reduce((sum, item) => sum + countTableRows(item), 0)
  return 0
}

function auditMode(audit?: AuditFinding | null, raw?: RawAudit | null): string | null {
  return audit?.scoreDisplayMode ?? raw?.scoreDisplayMode ?? null
}

function isNotApplicable(audit?: AuditFinding | null, raw?: RawAudit | null): boolean {
  return auditMode(audit, raw) === 'notApplicable' || auditMode(audit, raw) === 'manual'
}

function isPass(audit?: AuditFinding | null, raw?: RawAudit | null): boolean {
  if (audit)
    return audit.severity === 'pass'
  const score = raw?.score
  return typeof score === 'number' && score >= 0.9
}

function displayText(raw?: RawAudit | null, audit?: AuditFinding | null): string {
  return [raw?.displayValue, raw?.explanation, audit?.displayValue].filter(Boolean).join(' ')
}

function classifyLlmsTxt(raw: RawAudit | null, audit: AuditFinding | null): 'present' | 'missing' | 'invalid' | 'fetch-failed' | 'unknown' {
  if (!raw && !audit)
    return 'unknown'
  if (isNotApplicable(audit, raw))
    return 'missing'
  if ((raw?.score ?? audit?.score) === 1)
    return 'present'

  const text = displayText(raw, audit)
  if (/fetch/i.test(text) || /HTTP status 5\d\d/i.test(text))
    return 'fetch-failed'
  return 'invalid'
}

async function loadRoute(ctx: PackReconcileCtx, route: ScanRoute): Promise<{ reconciled: ReconciledReport | null, lhr: unknown | null }> {
  const [reconciled, lhr] = await Promise.all([
    ctx.getReconciled
      ? ctx.getReconciled(route.url, route.device).catch((err) => {
          ctx.logger?.debug?.(`agentic-browsing pack: failed to load reconciled report for ${route.url} [${route.device}]`, err)
          return null
        })
      : Promise.resolve(null),
    ctx.getLhr
      ? ctx.getLhr(route.url, route.device).catch((err) => {
          ctx.logger?.debug?.(`agentic-browsing pack: failed to load raw LHR for ${route.url} [${route.device}]`, err)
          return null
        })
      : Promise.resolve(null),
  ])
  return { reconciled, lhr }
}

function countFractionChecks(
  reconciled: ReconciledReport | null,
  lhr: unknown | null,
): { passed: number, total: number } {
  const refs = reconciled?.categories?.['agentic-browsing']?.auditRefs ?? rawCategory(lhr)?.auditRefs ?? []
  let passed = 0
  let total = 0
  for (const ref of refs) {
    const audit = reconciled?.audits?.[ref.id] ?? null
    const raw = rawAudit(lhr, ref.id)
    if (isNotApplicable(audit, raw))
      continue
    total++
    if (isPass(audit, raw))
      passed++
  }
  return { passed, total }
}

export const agenticBrowsingPack: Pack<AgenticBrowsingReport> = {
  name: 'agentic-browsing',
  description: 'Lighthouse 13 agentic browsing: WebMCP coverage, llms.txt, agent accessibility, and stability across all routes.',
  version: '1.1.0',
  reportSchema: AgenticBrowsingReportSchema,

  async reconciler(ctx: PackReconcileCtx): Promise<AgenticBrowsingReport> {
    const findings = new Map<string, FindingBucket>()

    for (const id of AGENTIC_AUDIT_IDS) {
      findings.set(id, { title: null, passing: 0, failing: [], total: 0 })
    }

    let scoreSum = 0
    let scoreCount = 0
    let passedChecks = 0
    let totalChecks = 0

    let webmcpSupported: boolean | null = null
    let registeredToolCount = 0
    let routesWithTools = 0
    let missingFormAnnotationCount = 0
    let routesMissingFormAnnotations = 0
    let formCoverageSum = 0
    let formCoverageCount = 0
    let schemaIssueCount = 0
    let schemaValidAll: boolean | null = null

    let validLlmsRoutes = 0
    let invalidLlmsRoutes = 0
    let missingLlmsRoutes = 0
    let fetchFailedLlmsRoutes = 0

    let stabilityRouteCount = 0
    let stabilityPassingCount = 0
    let maxCls: number | null = null

    for (const route of ctx.routes) {
      const { reconciled, lhr } = await loadRoute(ctx, route)
      if (!reconciled && !lhr)
        continue

      const catScore = reconciled?.categories?.['agentic-browsing']?.score ?? rawCategory(lhr)?.score
      if (typeof catScore === 'number') {
        scoreSum += catScore
        scoreCount++
      }

      const routeFraction = countFractionChecks(reconciled, lhr)
      passedChecks += routeFraction.passed
      totalChecks += routeFraction.total

      for (const id of AGENTIC_AUDIT_IDS) {
        const audit = reconciled?.audits?.[id] ?? null
        const raw = rawAudit(lhr, id)
        if (!audit && !raw)
          continue

        const entry = findings.get(id)!
        if (!entry.title)
          entry.title = audit?.title ?? raw?.title ?? null
        if (!isNotApplicable(audit, raw)) {
          entry.total++
          if (isPass(audit, raw))
            entry.passing++
          else
            entry.failing.push(route.url)
        }
      }

      const registeredAudit = reconciled?.audits?.['webmcp-registered-tools'] ?? null
      const rawRegistered = rawAudit(lhr, 'webmcp-registered-tools')
      if (isNotApplicable(registeredAudit, rawRegistered)) {
        if (webmcpSupported === null)
          webmcpSupported = false
      }
      else if (registeredAudit || rawRegistered) {
        webmcpSupported = true
      }

      const routeToolCount = countObjectsWithKey(rawRegistered?.details, 'tool')
      registeredToolCount += routeToolCount
      if (routeToolCount > 0)
        routesWithTools++

      const formAudit = reconciled?.audits?.['webmcp-form-coverage'] ?? null
      const rawForm = rawAudit(lhr, 'webmcp-form-coverage')
      if (formAudit || rawForm) {
        const missing = countTableRows(rawForm?.details)
        missingFormAnnotationCount += missing
        if (missing > 0) {
          routesMissingFormAnnotations++
          formCoverageSum += 0
          formCoverageCount++
        }
        else if (!isNotApplicable(formAudit, rawForm) || webmcpSupported) {
          formCoverageSum += 1
          formCoverageCount++
        }
      }

      const schemaAudit = reconciled?.audits?.['webmcp-schema-validity'] ?? null
      const rawSchema = rawAudit(lhr, 'webmcp-schema-validity')
      if (schemaAudit || rawSchema) {
        const issues = countTableRows(rawSchema?.details)
        schemaIssueCount += issues
        if (!isNotApplicable(schemaAudit, rawSchema)) {
          const valid = (rawSchema?.score ?? schemaAudit?.score) === 1
          schemaValidAll = schemaValidAll === null ? valid : schemaValidAll && valid
        }
      }

      const llmsAudit = reconciled?.audits?.['llms-txt'] ?? null
      const rawLlms = rawAudit(lhr, 'llms-txt')
      switch (classifyLlmsTxt(rawLlms, llmsAudit)) {
        case 'present':
          validLlmsRoutes++
          break
        case 'missing':
          missingLlmsRoutes++
          break
        case 'fetch-failed':
          fetchFailedLlmsRoutes++
          break
        case 'invalid':
          invalidLlmsRoutes++
          break
      }

      const clsAudit = reconciled?.audits?.['cumulative-layout-shift'] ?? null
      const rawCls = rawAudit(lhr, 'cumulative-layout-shift')
      if (clsAudit || rawCls) {
        stabilityRouteCount++
        if (isPass(clsAudit, rawCls))
          stabilityPassingCount++
        const cls = typeof rawCls?.numericValue === 'number' ? rawCls.numericValue : route.cls
        if (typeof cls === 'number')
          maxCls = maxCls === null ? cls : Math.max(maxCls, cls)
      }
    }

    const llmsStatus = fetchFailedLlmsRoutes > 0
      ? 'fetch-failed'
      : invalidLlmsRoutes > 0
        ? 'invalid'
        : validLlmsRoutes > 0
          ? 'present'
          : missingLlmsRoutes > 0
            ? 'missing'
            : 'unknown'

    return {
      scanId: ctx.scanId as string,
      routesAnalysed: ctx.routes.length,
      avgScore: scoreCount > 0 ? scoreSum / scoreCount : null,
      passedChecks,
      totalChecks,
      findings: Array.from(findings.entries()).map(([id, f]) => ({
        auditId: id,
        title: f.title,
        severity: f.failing.length > 0 ? 'fail' as const : f.total > 0 ? 'pass' as const : 'pass' as const,
        routeCount: f.total,
        passingRouteCount: f.passing,
        failingRoutes: f.failing.slice(0, 10),
      })),
      webmcp: {
        supported: webmcpSupported,
        hasRegisteredTools: registeredToolCount > 0,
        formCoverage: formCoverageCount > 0 ? formCoverageSum / formCoverageCount : null,
        schemaValid: schemaValidAll,
        routesWithTools,
        registeredToolCount,
        missingFormAnnotationCount,
        routesMissingFormAnnotations,
        schemaIssueCount,
      },
      hasLlmsTxt: validLlmsRoutes > 0,
      llmsTxt: {
        status: llmsStatus,
        validRoutes: validLlmsRoutes,
        invalidRoutes: invalidLlmsRoutes,
        missingRoutes: missingLlmsRoutes,
        fetchFailedRoutes: fetchFailedLlmsRoutes,
      },
      stability: {
        routeCount: stabilityRouteCount,
        passingCount: stabilityPassingCount,
        maxCls,
      },
      agentA11yTree: {
        routeCount: findings.get('agent-accessibility-tree')?.total ?? 0,
        passingCount: findings.get('agent-accessibility-tree')?.passing ?? 0,
      },
    }
  },
}
