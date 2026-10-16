import type { BrokenLink } from '../contracts.ts'
import type { Category, Device, FieldCoverage, FieldMetric, Issue, Metric, Page, PageStatus, Scan, ScanField, ScanStatus, Severity } from '../types.ts'
import type { ScanComparison } from './compare.ts'
import type { FlowBrief } from './flows.ts'
import { CATEGORIES, FIELD_METRICS, METRICS } from '../types.ts'
import { topRegressions } from './compare.ts'
import { METRIC_THRESHOLDS, RELIABILITY } from './thresholds.ts'
import { mean, median, percentile, present, roundMetric, roundScore } from './stats.ts'

export interface ScoreStats {
  mean: Partial<Record<Category, number>>
  median: Partial<Record<Category, number>>
}

export interface LabCwvPassShare {
  pages: number
  lcp: number
  cls: number
  tbtAsInpStandIn: number
  all: number
}

export interface TemplateBrief {
  template: string
  pages: number
  meanPerformance: number
  worstPath: string
}

export interface FieldBrief {
  p75: Partial<Record<FieldMetric, number>>
  period: string | null
  coverage: FieldCoverage
}

export interface DeviceSummary {
  device: Device
  pages: Partial<Record<PageStatus, number>>
  scores: ScoreStats
  p75: Partial<Record<Metric, number>>
  field?: FieldBrief
  labCwvPass: LabCwvPassShare | null
  worstTemplates: TemplateBrief[]
}

export interface IssueBrief {
  auditId: string
  title: string
  items: number
  topItem: string | null
  pages: number
  impact: number
}

export type SiteCheckStatus = 'pass' | Severity | 'not-measured'

export type SiteCheckId = 'llms-txt' | 'ard-schema' | 'robots-txt'

export interface RegressionBrief {
  path: string
  device: Device
  scores: Partial<Record<Category, number>>
  metrics: Partial<Record<Metric, number>>
}

export interface BaselineSummary {
  scanId: string
  branch: string | null
  commit: string | null
  createdAt: number
  scores: Partial<Record<Device, Partial<Record<Category, number>>>>
  pages: { regressed: number, improved: number, unchanged: number, added: number, removed: number, failed: number }
  issues: { new: number, fixed: number, unknown: number }
  topRegressions: RegressionBrief[]
}

export type ReliabilityCode =
  | 'failed-pages'
  | 'high-sample-spread'
  | 'low-benchmark-index'
  | 'concurrent-simulated-throttling'
  | 'mixed-lighthouse-versions'
  | 'remote-runner'

export interface ReliabilityWarning {
  code: ReliabilityCode
  pages: number
  detail?: string
}

export interface ScanSummary {
  scan: {
    id: string
    origin: string
    status: ScanStatus
    label: string | null
    branch: string | null
    commit: string | null
    lighthouseVersion: string | null
    createdAt: number
    finishedAt: number | null
  }
  pages: { discovered: number, audited: number, skippedBySampling: number, failed: number }
  devices: DeviceSummary[]
  siteChecks: Record<SiteCheckId, SiteCheckStatus>
  topIssues: IssueBrief[]
  issueCount: number
  brokenLinks: number
  baseline?: BaselineSummary
  fieldNote?: string
  warnings: ReliabilityWarning[]
  flows?: FlowBrief[]
}

export interface SummaryInput {
  scan: Scan
  pages: Page[]
  issues: Issue[]
  comparison?: ScanComparison
  brokenLinks: BrokenLink[]
  field?: ScanField | null
}

export const SITE_CHECKS: ReadonlyArray<{ auditId: SiteCheckId, category: Category, title: string }> = [
  { auditId: 'llms-txt', category: 'agentic-browsing', title: 'llms.txt' },
  { auditId: 'ard-schema', category: 'agentic-browsing', title: 'ai-catalog.json (ARD)' },
  { auditId: 'robots-txt', category: 'seo', title: 'robots.txt' },
]

const SITE_CHECK_IDS = new Set<string>(SITE_CHECKS.map(check => check.auditId))
const TOP_ISSUES = 5
const WORST_TEMPLATES = 3
const TOP_REGRESSIONS = 5
const MAX_LABEL = 80

function clip(text: string | null, origin: string): string | null {
  if (text === null)
    return null
  const local = localPath(text, origin)
  return local.length <= MAX_LABEL ? local : `${local.slice(0, MAX_LABEL - 1)}…`
}

function countStatuses(pages: Page[]): Partial<Record<PageStatus, number>> {
  const counts: Partial<Record<PageStatus, number>> = {}
  for (const page of pages)
    counts[page.status] = (counts[page.status] ?? 0) + 1
  return counts
}

function localPath(url: string, origin: string): string {
  return url.startsWith(`${origin}/`) ? url.slice(origin.length) : url
}

function share(count: number, total: number): number {
  return roundScore(count / total)
}

function labCwvPass(device: Device, done: Page[]): LabCwvPassShare | null {
  const rated = done.filter(page => page.metrics.lcp !== null && page.metrics.cls !== null && page.metrics.tbt !== null)
  if (rated.length === 0)
    return null
  const limits = METRIC_THRESHOLDS[device]
  let lcp = 0
  let cls = 0
  let tbt = 0
  let all = 0
  for (const page of rated) {
    const lcpOk = page.metrics.lcp! <= limits.lcp.good
    const clsOk = page.metrics.cls! <= limits.cls.good
    const tbtOk = page.metrics.tbt! <= limits.tbt.good
    lcp += Number(lcpOk)
    cls += Number(clsOk)
    tbt += Number(tbtOk)
    all += Number(lcpOk && clsOk && tbtOk)
  }
  const total = rated.length
  return { pages: total, lcp: share(lcp, total), cls: share(cls, total), tbtAsInpStandIn: share(tbt, total), all: share(all, total) }
}

function worstTemplates(done: Page[]): TemplateBrief[] {
  const groups = new Map<string, Page[]>()
  for (const page of done) {
    if (page.scores.performance === null)
      continue
    const group = groups.get(page.template) ?? []
    group.push(page)
    groups.set(page.template, group)
  }
  return [...groups.entries()]
    .map(([template, group]) => {
      const worst = group.reduce((a, b) => (b.scores.performance! < a.scores.performance! ? b : a))
      return {
        template,
        pages: group.length,
        meanPerformance: roundScore(mean(group.map(page => page.scores.performance!))!),
        worstPath: worst.path,
      }
    })
    .sort((a, b) => a.meanPerformance - b.meanPerformance || a.template.localeCompare(b.template))
    .slice(0, WORST_TEMPLATES)
}

function deviceSummary(device: Device, pages: Page[]): DeviceSummary {
  const done = pages.filter(page => page.status === 'done')
  const scores: ScoreStats = { mean: {}, median: {} }
  for (const category of CATEGORIES) {
    const values = present(done.map(page => page.scores[category]))
    if (values.length > 0) {
      scores.mean[category] = roundScore(mean(values)!)
      scores.median[category] = roundScore(median(values)!)
    }
  }
  const p75: DeviceSummary['p75'] = {}
  for (const metric of METRICS) {
    const value = percentile(present(done.map(page => page.metrics[metric])), 0.75)
    if (value !== null)
      p75[metric] = roundMetric(metric, value)
  }
  return { device, pages: countStatuses(pages), scores, p75, labCwvPass: labCwvPass(device, done), worstTemplates: worstTemplates(done) }
}

function siteChecks(pages: Page[], issues: Issue[]): Record<SiteCheckId, SiteCheckStatus> {
  const done = pages.filter(page => page.status === 'done')
  const status = (check: typeof SITE_CHECKS[number]): SiteCheckStatus => {
    const issue = issues.find(entry => entry.auditId === check.auditId)
    if (issue)
      return issue.severity
    return done.some(page => page.scores[check.category] !== null) ? 'pass' : 'not-measured'
  }
  return Object.fromEntries(SITE_CHECKS.map(check => [check.auditId, status(check)])) as Record<SiteCheckId, SiteCheckStatus>
}

function topIssues(issues: Issue[], origin: string): IssueBrief[] {
  return issues
    .filter(issue => !SITE_CHECK_IDS.has(issue.auditId))
    .toSorted((a, b) => b.impact - a.impact || b.pages - a.pages)
    .slice(0, TOP_ISSUES)
    .map((issue) => {
      const top = issue.topItems[0]
      return { auditId: issue.auditId, title: issue.title, items: issue.items, topItem: top ? clip(top.label ?? top.key, origin) : null, pages: issue.pages, impact: Math.round(issue.impact) }
    })
}

function baselineSummary(comparison: ScanComparison, origin: string): BaselineSummary {
  const scores: BaselineSummary['scores'] = {}
  for (const entry of comparison.devices) {
    const deltas: Partial<Record<Category, number>> = {}
    for (const category of CATEGORIES) {
      const value = entry.scores[category]
      if (value && value.delta !== 0)
        deltas[category] = value.delta
    }
    scores[entry.device] = deltas
  }
  const regressions = topRegressions(comparison, TOP_REGRESSIONS).map(diff => {
    const brief: RegressionBrief = { path: localPath(diff.url, origin), device: diff.device, scores: {}, metrics: {} }
    for (const category of CATEGORIES) {
      const value = diff.scores[category]
      if (value && value.change !== 'unchanged')
        brief.scores[category] = value.delta
    }
    for (const metric of METRICS) {
      const value = diff.metrics[metric]
      if (value && value.change !== 'unchanged')
        brief.metrics[metric] = value.delta
    }
    return brief
  })
  const { unchanged, regressed, improved, added, removed, failed } = comparison.totals.pages
  return {
    scanId: comparison.base.id,
    branch: comparison.base.branch,
    commit: comparison.base.commit,
    createdAt: comparison.base.createdAt,
    scores,
    pages: { regressed, improved, unchanged, added, removed, failed },
    issues: { new: comparison.totals.issues.new, fixed: comparison.totals.issues.fixed, unknown: comparison.totals.issues.unknown },
    topRegressions: regressions,
  }
}

function reliabilityWarnings(pages: Page[]): ReliabilityWarning[] {
  const warnings: ReliabilityWarning[] = []
  const failed = pages.filter(page => page.status === 'failed').length
  if (failed > 0)
    warnings.push({ code: 'failed-pages', pages: failed })

  const measured = pages.filter(page => page.status === 'done' && page.provenance !== null)
  const spread = measured.filter(page => page.provenance!.spread !== null && page.provenance!.spread > RELIABILITY.maxSpread).length
  if (spread > 0)
    warnings.push({ code: 'high-sample-spread', pages: spread })

  const slow = measured.filter(page => page.provenance!.benchmarkIndex !== null && page.provenance!.benchmarkIndex < RELIABILITY.minBenchmarkIndex).length
  if (slow > 0)
    warnings.push({ code: 'low-benchmark-index', pages: slow })

  const concurrent = measured.filter(page => page.provenance!.throttling === 'simulate' && page.provenance!.concurrency > 1)
  if (concurrent.length > 0)
    warnings.push({ code: 'concurrent-simulated-throttling', pages: concurrent.length, detail: String(Math.max(...concurrent.map(page => page.provenance!.concurrency))) })

  const versions = new Set(measured.map(page => page.provenance!.lighthouseVersion))
  if (versions.size > 1)
    warnings.push({ code: 'mixed-lighthouse-versions', pages: measured.length, detail: [...versions].sort().join(', ') })

  const remote = measured.filter(page => page.provenance!.runner !== undefined && page.provenance!.runner !== 'local')
  if (remote.length > 0)
    warnings.push({ code: 'remote-runner', pages: remote.length, detail: [...new Set(remote.map(page => page.provenance!.runner!))].sort().join(', ') })
  return warnings
}

export function describeWarning(warning: ReliabilityWarning): string {
  const { pages, detail } = warning
  switch (warning.code) {
    case 'failed-pages':
      return `${pages} audit(s) failed and are left out of every mean.`
    case 'high-sample-spread':
      return `${pages} page(s) varied by more than ${RELIABILITY.maxSpread} in performance score between samples; treat their scores as approximate.`
    case 'low-benchmark-index':
      return `${pages} page(s) ran on a host with a benchmark index below ${RELIABILITY.minBenchmarkIndex}; performance scores read lower than on typical hardware.`
    case 'concurrent-simulated-throttling':
      return `${pages} page(s) ran with up to ${detail} parallel audits under simulated throttling; CPU contention can lower performance scores.`
    case 'mixed-lighthouse-versions':
      return `Pages were audited with different Lighthouse versions (${detail}); their scores are not directly comparable.`
    case 'remote-runner':
      return `${pages} page(s) were measured by a remote runner (${detail}) on hardware Unlighthouse does not control; their performance scores are not comparable with local lab runs.`
  }
}

function uniqueUrls(pages: Page[], statuses: PageStatus[]): number {
  return new Set(pages.filter(page => statuses.includes(page.status)).map(page => page.url)).size
}

export const FIELD_NOTE = 'p75 is lab data: Lighthouse runs of the audited pages on this machine. field.p75 is real-user data from the Chrome UX Report for the whole origin over the last 28 days. They measure different things and are not expected to match; INP exists only in field data.'

function fieldBrief(field: ScanField, device: Device): FieldBrief | undefined {
  const record = field.origin[device]
  const coverage = field.coverage[device] ?? { url: 0, origin: 0, none: 0 }
  if (!record && coverage.url === 0)
    return undefined
  const p75: FieldBrief['p75'] = {}
  for (const metric of FIELD_METRICS) {
    const value = record?.metrics[metric]?.p75
    if (value !== undefined)
      p75[metric] = value
  }
  return { p75, period: record?.period ? `${record.period.first}/${record.period.last}` : null, coverage }
}

export function summarize(input: SummaryInput): ScanSummary {
  const { scan, pages, issues, comparison, brokenLinks } = input
  const devices = [...new Set([...scan.devices, ...pages.map(page => page.device)])]
  const summary: ScanSummary = {
    scan: {
      id: scan.id,
      origin: scan.origin,
      status: scan.status,
      label: scan.label,
      branch: scan.branch,
      commit: scan.commit,
      lighthouseVersion: scan.lighthouseVersion,
      createdAt: scan.createdAt,
      finishedAt: scan.finishedAt,
    },
    pages: {
      discovered: Math.max(scan.stats.discovered, new Set(pages.map(page => page.url)).size),
      audited: uniqueUrls(pages, ['done', 'failed']),
      skippedBySampling: uniqueUrls(pages.filter(page => page.error === null), ['skipped']),
      failed: uniqueUrls(pages, ['failed']),
    },
    devices: devices.map(device => deviceSummary(device, pages.filter(page => page.device === device))),
    siteChecks: siteChecks(pages, issues),
    topIssues: topIssues(issues, scan.origin),
    issueCount: issues.filter(issue => !SITE_CHECK_IDS.has(issue.auditId)).length,
    brokenLinks: new Set(brokenLinks.map(link => link.url)).size,
    warnings: reliabilityWarnings(pages),
  }
  if (comparison)
    summary.baseline = baselineSummary(comparison, scan.origin)
  if (input.field) {
    for (const entry of summary.devices) {
      const brief = fieldBrief(input.field, entry.device)
      if (brief)
        entry.field = brief
    }
    summary.fieldNote = FIELD_NOTE
  }
  return summary
}
