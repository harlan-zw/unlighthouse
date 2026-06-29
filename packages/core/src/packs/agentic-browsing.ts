// `agentic-browsing` pack — Lighthouse 13 agentic browsing category analysis.
//
// Analyzes WebMCP tool registration, form coverage, schema validity,
// agent accessibility tree, and llms.txt across all routes.

import type { Pack, PackReconcileCtx } from '@unlighthouse/contracts'
import { z } from 'zod'

const AGENTIC_AUDIT_IDS = [
  'agent-accessibility-tree',
  'webmcp-registered-tools',
  'webmcp-form-coverage',
  'webmcp-schema-validity',
  'llms-txt',
] as const

const AuditSummarySchema = z.object({
  auditId: z.string(),
  title: z.string().nullable(),
  severity: z.enum(['pass', 'warn', 'fail']),
  routeCount: z.number().int(),
  passingRouteCount: z.number().int(),
  failingRoutes: z.array(z.string()),
})

const AgenticBrowsingReportSchema = z.object({
  scanId: z.string(),
  routesAnalysed: z.number().int(),
  avgScore: z.number().nullable(),
  findings: z.array(AuditSummarySchema),
  webmcp: z.object({
    hasRegisteredTools: z.boolean(),
    formCoverage: z.number().nullable(),
    schemaValid: z.boolean().nullable(),
    routesWithTools: z.number().int(),
  }),
  hasLlmsTxt: z.boolean(),
  agentA11yTree: z.object({
    routeCount: z.number().int(),
    passingCount: z.number().int(),
  }),
})
export type AgenticBrowsingReport = z.infer<typeof AgenticBrowsingReportSchema>

export const agenticBrowsingPack: Pack<AgenticBrowsingReport> = {
  name: 'agentic-browsing',
  description: 'Lighthouse 13 agentic browsing: WebMCP coverage, llms.txt, and agent accessibility across all routes.',
  version: '1.0.0',
  reportSchema: AgenticBrowsingReportSchema,

  async reconciler(ctx: PackReconcileCtx): Promise<AgenticBrowsingReport> {
    const { scanId, routes } = ctx
    const device = routes[0]?.device ?? 'mobile'

    const findings = new Map<string, {
      title: string | null
      passing: number
      failing: string[]
      total: number
    }>()

    for (const id of AGENTIC_AUDIT_IDS) {
      findings.set(id, { title: null, passing: 0, failing: [], total: 0 })
    }

    let scoreSum = 0
    let scoreCount = 0
    let routesWithTools = 0
    let hasLlmsTxt = false
    let formCoverageSum = 0
    let formCoverageCount = 0
    let schemaValidAll: boolean | null = null

    for (const route of routes) {
      let reconciled: any = null
      if (ctx.getReconciled) {
        try {
          reconciled = await ctx.getReconciled(route.url, device)
        }
        catch {}
      }
      if (!reconciled)
        continue

      const catScore = reconciled.categories?.['agentic-browsing']?.score
      if (typeof catScore === 'number') {
        scoreSum += catScore
        scoreCount++
      }

      for (const id of AGENTIC_AUDIT_IDS) {
        const audit = reconciled.audits?.[id]
        if (!audit)
          continue
        const entry = findings.get(id)!
        if (!entry.title && audit.title)
          entry.title = audit.title
        entry.total++
        if (audit.severity === 'pass') {
          entry.passing++
        }
        else {
          entry.failing.push(route.url)
        }

        if (id === 'webmcp-registered-tools' && audit.severity === 'pass') {
          routesWithTools++
        }
        if (id === 'llms-txt' && audit.severity === 'pass') {
          hasLlmsTxt = true
        }
        if (id === 'webmcp-form-coverage' && typeof audit.score === 'number') {
          formCoverageSum += audit.score
          formCoverageCount++
        }
        if (id === 'webmcp-schema-validity') {
          if (schemaValidAll === null)
            schemaValidAll = audit.severity === 'pass'
          else if (audit.severity !== 'pass')
            schemaValidAll = false
        }
      }
    }

    return {
      scanId: scanId as string,
      routesAnalysed: routes.length,
      avgScore: scoreCount > 0 ? scoreSum / scoreCount : null,
      findings: Array.from(findings.entries()).map(([id, f]) => ({
        auditId: id,
        title: f.title,
        severity: f.failing.length > 0 ? 'fail' as const : f.total > 0 ? 'pass' as const : 'pass' as const,
        routeCount: f.total,
        passingRouteCount: f.passing,
        failingRoutes: f.failing.slice(0, 10),
      })),
      webmcp: {
        hasRegisteredTools: routesWithTools > 0,
        formCoverage: formCoverageCount > 0 ? formCoverageSum / formCoverageCount : null,
        schemaValid: schemaValidAll,
        routesWithTools,
      },
      hasLlmsTxt,
      agentA11yTree: {
        routeCount: findings.get('agent-accessibility-tree')?.total ?? 0,
        passingCount: findings.get('agent-accessibility-tree')?.passing ?? 0,
      },
    }
  },
}
