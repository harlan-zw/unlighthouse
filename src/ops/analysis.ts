import type { BudgetReport } from '../analysis/budgets.ts'
import { checkBudgets } from '../analysis/budgets.ts'
import type { CompareSide, ScanComparison } from '../analysis/compare.ts'
import { compareScans } from '../analysis/compare.ts'
import { briefFlows } from '../analysis/flows.ts'
import { mean, present, roundScore } from '../analysis/stats.ts'
import type { ScanSummary } from '../analysis/summary.ts'
import { summarize } from '../analysis/summary.ts'
import type { Budgets } from '../config.ts'
import { budgetsSchema } from '../config.ts'
import type { Store } from '../contracts.ts'
import { UnlighthouseError } from '../errors.ts'
import { CATEGORIES } from '../types.ts'
import type { Device, FlowRun, Page, Scan, Scores } from '../types.ts'

const ALL = 1_000_000

export interface ScanAnalysis {
  scan: Scan
  side: CompareSide
  baseline: Scan | null
  comparison?: ScanComparison
  summary: ScanSummary
  flows: FlowRun[]
}

export function getScan(store: Store, scanId: string): Scan {
  const scan = store.getScan(scanId)
  if (!scan)
    throw new UnlighthouseError('NOT_FOUND', `Scan not found: ${scanId}. Call scans.list to see existing scans.`)
  return scan
}

export function loadSide(store: Store, scan: Scan): CompareSide {
  return {
    scan,
    pages: store.allPages(scan.id),
    issues: store.listIssues({ scanId: scan.id, limit: ALL, offset: 0 }).items,
    issuePages: (auditId, itemKey) => store.issuePages(scan.id, auditId, itemKey),
  }
}

export function findBaseline(store: Store, scan: Scan, branch?: string | null): Scan | null {
  const preferred = branch ?? scan.branch
  return store.findBaseline({
    origin: scan.origin,
    devices: scan.devices,
    excludeId: scan.id,
    before: scan.createdAt,
    ...(preferred ? { branch: preferred } : {}),
  })
}

export function analyzeScan(store: Store, scanId: string, options: { baselineBranch?: string | null } = {}): ScanAnalysis {
  const scan = getScan(store, scanId)
  const side = loadSide(store, scan)
  const baseline = findBaseline(store, scan, options.baselineBranch)
  const comparison = baseline ? compareScans(loadSide(store, baseline), side) : undefined
  const summary = summarize({
    scan,
    pages: side.pages,
    issues: side.issues,
    brokenLinks: store.brokenLinks(scan.id),
    field: store.scanField(scan.id),
    ...(comparison ? { comparison } : {}),
  })
  const flows = store.listFlowRuns(scan.id)
  if (flows.length)
    summary.flows = briefFlows(flows)
  return { scan, side, baseline, summary, flows, ...(comparison ? { comparison } : {}) }
}

export function scanBudgets(scan: Scan): Budgets {
  const options = scan.options as { budgets?: unknown } | null
  const parsed = budgetsSchema.safeParse(options?.budgets ?? {})
  return parsed.success ? parsed.data : budgetsSchema.parse({})
}

export function budgetReport(analysis: ScanAnalysis, budgets: Budgets): BudgetReport {
  return checkBudgets({
    summary: analysis.summary,
    pages: analysis.side.pages,
    flows: analysis.flows,
    ...(analysis.comparison ? { comparison: analysis.comparison } : {}),
  }, budgets)
}

export function meanScores(pages: Page[], devices: Device[]): Partial<Record<Device, Scores>> {
  const out: Partial<Record<Device, Scores>> = {}
  for (const device of devices) {
    const measured = pages.filter(page => page.device === device && page.status === 'done')
    if (!measured.length)
      continue
    const scores = {} as Scores
    for (const category of CATEGORIES) {
      const value = mean(present(measured.map(page => page.scores[category])))
      scores[category] = value === null ? null : roundScore(value)
    }
    out[device] = scores
  }
  return out
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mask(value: unknown): Record<string, string> {
  return isRecord(value) ? Object.fromEntries(Object.keys(value).map(key => [key, '[redacted]'])) : {}
}

function publicRunner(runner: unknown): unknown {
  if (!isRecord(runner) || runner['type'] !== 'cdp')
    return runner
  let endpoint = runner['endpoint']
  if (typeof endpoint === 'string' && URL.canParse(endpoint)) {
    const url = new URL(endpoint)
    if (url.username || url.password) {
      url.username = '[redacted]'
      url.password = ''
    }
    for (const key of [...url.searchParams.keys()])
      url.searchParams.set(key, '[redacted]')
    endpoint = url.toString()
  }
  return { ...runner, endpoint, headers: mask(runner['headers']) }
}

function publicLighthouse(lighthouse: unknown): unknown {
  if (!isRecord(lighthouse) || !isRecord(lighthouse['settings']) || !('extraHeaders' in lighthouse['settings']))
    return lighthouse
  return { ...lighthouse, settings: { ...lighthouse['settings'], extraHeaders: mask(lighthouse['settings']['extraHeaders']) } }
}

export function publicScan(scan: Scan): Scan {
  const options = scan.options
  if (!isRecord(options) || !isRecord(options['auth']))
    return scan
  const auth = options['auth']
  const cookies = Array.isArray(auth['cookies']) ? auth['cookies'] : []
  return {
    ...scan,
    options: {
      ...options,
      ...('runner' in options ? { runner: publicRunner(options['runner']) } : {}),
      ...('lighthouse' in options ? { lighthouse: publicLighthouse(options['lighthouse']) } : {}),
      auth: {
        ...auth,
        headers: mask(auth['headers']),
        cookies: cookies.map(cookie => (isRecord(cookie) ? { ...cookie, value: '[redacted]' } : cookie)),
        localStorage: mask(auth['localStorage']),
        sessionStorage: mask(auth['sessionStorage']),
      },
    },
  }
}
