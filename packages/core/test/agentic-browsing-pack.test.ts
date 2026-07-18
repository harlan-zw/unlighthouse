import type { ReconciledReport, ScanRoute } from '@unlighthouse/contracts/types/atoms'
import { AgenticBrowsingReportSchema } from '@unlighthouse/contracts/packs'
import { agenticBrowsingPack } from '@unlighthouse/core/packs'
import { describe, expect, it } from 'vitest'
import { testScanId, testUrl } from '../../../test/helpers/contracts'

const route = {
  scanId: testScanId('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  url: testUrl('http://example.com/'),
  path: '/',
  routeName: null,
  device: 'mobile',
  scorePerformance: 0.9,
  scoreAccessibility: 1,
  scoreSeo: 1,
  scoreBestPractices: 1,
  scoreAgenticBrowsing: 0.75,
  lcp: 1200,
  cls: 0.02,
  inp: null,
  fcp: 900,
  ttfb: 100,
  tbt: 50,
  si: 1100,
  lighthouseVersion: '13.4.0',
  capturedAt: '2026-01-01T00:00:00.000Z',
  lhrBlobKey: 'lhr',
  reportBlobKey: 'report',
  screenshotBlobKey: null,
} satisfies ScanRoute

function audit(score: number | null, scoreDisplayMode = 'binary') {
  return {
    id: 'audit',
    score,
    scoreDisplayMode,
    displayValue: null,
    title: null,
    description: null,
    severity: score == null || score >= 0.9 ? 'pass' : score >= 0.5 ? 'warn' : 'fail',
    metricSavings: null,
    items: null,
  } as const
}

function reconciled(overrides: Partial<ReconciledReport> = {}): ReconciledReport {
  return {
    scanId: route.scanId,
    url: route.url,
    device: 'mobile',
    metrics: {
      scorePerformance: 0.9,
      scoreAccessibility: 1,
      scoreSeo: 1,
      scoreBestPractices: 1,
      scoreAgenticBrowsing: 0.75,
      lcp: 1200,
      cls: 0.02,
      inp: null,
      fcp: 900,
      ttfb: 100,
      tbt: 50,
      si: 1100,
    },
    categories: {
      'agentic-browsing': {
        score: 0.75,
        categoryScoreDisplayMode: 'fraction',
        auditRefs: [
          { id: 'agent-accessibility-tree', weight: 1 },
          { id: 'webmcp-registered-tools', weight: 1 },
          { id: 'webmcp-form-coverage', weight: 1 },
          { id: 'webmcp-schema-validity', weight: 1 },
          { id: 'cumulative-layout-shift', weight: 1 },
          { id: 'llms-txt', weight: 1 },
        ],
      },
    },
    audits: {
      'agent-accessibility-tree': { ...audit(1), id: 'agent-accessibility-tree', title: 'Agent accessibility tree' },
      'webmcp-registered-tools': { ...audit(1, 'informative'), id: 'webmcp-registered-tools', title: 'WebMCP tools registered' },
      'webmcp-form-coverage': { ...audit(1, 'notApplicable'), id: 'webmcp-form-coverage', title: 'WebMCP form coverage' },
      'webmcp-schema-validity': { ...audit(1, 'notApplicable'), id: 'webmcp-schema-validity', title: 'WebMCP schemas are valid' },
      'cumulative-layout-shift': { ...audit(1, 'numeric'), id: 'cumulative-layout-shift', title: 'Cumulative Layout Shift' },
      'llms-txt': { ...audit(1, 'notApplicable'), id: 'llms-txt', title: 'llms.txt follows recommendations' },
    },
    provenance: {
      lighthouseVersion: '13.4.0',
      userAgent: null,
      capturedAt: '2026-01-01T00:00:00.000Z',
      benchmarkIndex: null,
      timingTotal: null,
      warnings: [],
      runtimeError: null,
    },
    stackPacks: null,
    entities: null,
    ...overrides,
  } as ReconciledReport
}

async function runPack(input: { reconciled: ReconciledReport, lhr: unknown }) {
  return agenticBrowsingPack.reconciler({
    scanId: route.scanId,
    routes: [route],
    getReconciled: async () => input.reconciled,
    getLhr: async () => input.lhr,
  })
}

describe('agenticBrowsingPack', () => {
  it('does not treat an informative registered-tools audit as tools present', async () => {
    const report = await runPack({
      reconciled: reconciled(),
      lhr: {
        categories: {
          'agentic-browsing': {
            score: 0.75,
            categoryScoreDisplayMode: 'fraction',
            auditRefs: reconciled().categories['agentic-browsing']!.auditRefs,
          },
        },
        audits: {
          'webmcp-registered-tools': { score: 1, scoreDisplayMode: 'informative' },
          'llms-txt': { score: 1, scoreDisplayMode: 'notApplicable' },
        },
      },
    })

    expect(() => AgenticBrowsingReportSchema.parse(report)).not.toThrow()
    expect(report.webmcp.routesWithTools).toBe(0)
    expect(report.webmcp.registeredToolCount).toBe(0)
    expect(report.hasLlmsTxt).toBe(false)
    expect(report.llmsTxt?.status).toBe('missing')
  })

  it('counts WebMCP tools from raw LHR list details', async () => {
    const report = await runPack({
      reconciled: reconciled({
        audits: {
          ...reconciled().audits,
          'llms-txt': { ...audit(1), id: 'llms-txt', title: 'llms.txt follows recommendations' },
        },
      }),
      lhr: {
        audits: {
          'webmcp-registered-tools': {
            score: 1,
            scoreDisplayMode: 'informative',
            details: {
              type: 'list',
              items: [
                { type: 'table', items: [{ tool: 'search' }, { tool: 'checkout' }] },
              ],
            },
          },
          'llms-txt': { score: 1, scoreDisplayMode: 'binary' },
        },
      },
    })

    expect(report.webmcp.routesWithTools).toBe(1)
    expect(report.webmcp.registeredToolCount).toBe(2)
    expect(report.hasLlmsTxt).toBe(true)
    expect(report.llmsTxt?.status).toBe('present')
  })

  it('reports form annotation and schema issue counts from raw details', async () => {
    const report = await runPack({
      reconciled: reconciled({
        audits: {
          ...reconciled().audits,
          'webmcp-form-coverage': { ...audit(1, 'informative'), id: 'webmcp-form-coverage', title: 'WebMCP form coverage' },
          'webmcp-schema-validity': { ...audit(0.5), id: 'webmcp-schema-validity', title: 'WebMCP schemas are valid', severity: 'warn' },
        },
      }),
      lhr: {
        audits: {
          'webmcp-registered-tools': { score: 1, scoreDisplayMode: 'informative' },
          'webmcp-form-coverage': {
            score: 1,
            scoreDisplayMode: 'informative',
            details: { type: 'table', items: [{ node: {} }, { node: {} }] },
          },
          'webmcp-schema-validity': {
            score: 0.5,
            scoreDisplayMode: 'binary',
            details: { type: 'table', items: [{ issue: 'Missing description' }] },
          },
        },
      },
    })

    expect(report.webmcp.routesMissingFormAnnotations).toBe(1)
    expect(report.webmcp.missingFormAnnotationCount).toBe(2)
    expect(report.webmcp.schemaValid).toBe(false)
    expect(report.webmcp.schemaIssueCount).toBe(1)
  })
})
