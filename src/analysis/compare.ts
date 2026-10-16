import type { Category, Device, Issue, Metric, Page, Scan, Severity } from '../types.ts'
import { CATEGORIES, METRICS } from '../types.ts'
import { mean, round, roundMetric, roundScore } from './stats.ts'

export interface CompareSide {
  scan: Scan
  pages: Page[]
  issues: Issue[]
  issuePages?: (auditId: string) => Array<{ url: string, device: Device }>
}

export interface MetricNoise {
  relative: number
  absolute: number
}

export interface NoiseThresholds {
  scores: Record<Category, number>
  metrics: Record<Metric, MetricNoise>
}

export interface CompareOptions {
  noise?: {
    scores?: Partial<Record<Category, number>>
    metrics?: Partial<Record<Metric, Partial<MetricNoise>>>
  }
}

export const DEFAULT_NOISE: NoiseThresholds = {
  scores: {
    'performance': 0.05,
    'accessibility': 0.02,
    'best-practices': 0.02,
    'seo': 0.02,
    'agentic-browsing': 0.02,
  },
  metrics: {
    fcp: { relative: 0.1, absolute: 100 },
    lcp: { relative: 0.1, absolute: 150 },
    tbt: { relative: 0.1, absolute: 50 },
    cls: { relative: 0.1, absolute: 0.02 },
    si: { relative: 0.1, absolute: 150 },
    ttfb: { relative: 0.1, absolute: 100 },
  },
}

export type Change = 'regressed' | 'improved' | 'unchanged'
export type PageChange = Change | 'added' | 'removed' | 'failed'

export interface ValueDelta {
  base: number
  head: number
  delta: number
  change: Change
}

export interface PageDiff {
  url: string
  device: Device
  template: string
  status: PageChange
  scores: Partial<Record<Category, ValueDelta>>
  metrics: Partial<Record<Metric, ValueDelta>>
}

export interface MeanDelta {
  base: number
  head: number
  delta: number
  pages: number
}

export interface DeviceDelta {
  device: Device
  scores: Partial<Record<Category, MeanDelta>>
}

export interface TemplateDelta {
  template: string
  device: Device
  pages: number
  base: number
  head: number
  delta: number
}

export interface IssueDiff {
  auditId: string
  title: string
  category: Category | null
  severity: Severity
  basePages: number
  headPages: number
  pagesDelta: number
  items: number
  impact: number
}

export interface ScanRef {
  id: string
  label: string | null
  branch: string | null
  commit: string | null
  createdAt: number
}

export interface ComparisonTotals {
  pages: Record<PageChange, number>
  issues: { new: number, fixed: number, persisting: number, unknown: number }
}

export interface ScanComparison {
  base: ScanRef
  head: ScanRef
  noise: NoiseThresholds
  pages: PageDiff[]
  devices: DeviceDelta[]
  templates: TemplateDelta[]
  issues: { new: IssueDiff[], fixed: IssueDiff[], persisting: IssueDiff[], unknown: IssueDiff[] }
  totals: ComparisonTotals
}

function resolveNoise(options?: CompareOptions): NoiseThresholds {
  const scores = { ...DEFAULT_NOISE.scores, ...options?.noise?.scores }
  const metrics = { ...DEFAULT_NOISE.metrics }
  for (const metric of METRICS) {
    const override = options?.noise?.metrics?.[metric]
    if (override)
      metrics[metric] = { ...metrics[metric], ...override }
  }
  return { scores, metrics }
}

function ref(scan: Scan): ScanRef {
  return { id: scan.id, label: scan.label, branch: scan.branch, commit: scan.commit, createdAt: scan.createdAt }
}

function pageKey(url: string, device: Device): string {
  return `${device}\u0000${url}`
}

function measured(pages: Page[]): Map<string, Page> {
  const out = new Map<string, Page>()
  for (const page of pages) {
    if (page.status === 'done')
      out.set(pageKey(page.url, page.device), page)
  }
  return out
}

function scoreDelta(base: number, head: number, noise: number): ValueDelta {
  const delta = round(head - base, 4)
  const change: Change = Math.abs(delta) + 1e-9 < noise ? 'unchanged' : delta < 0 ? 'regressed' : 'improved'
  return { base, head, delta: roundScore(delta), change }
}

function metricDelta(metric: Metric, base: number, head: number, noise: MetricNoise): ValueDelta {
  const delta = head - base
  const threshold = Math.max(noise.absolute, Math.abs(base) * noise.relative)
  const change: Change = Math.abs(delta) + 1e-9 < threshold ? 'unchanged' : delta > 0 ? 'regressed' : 'improved'
  return { base, head, delta: roundMetric(metric, delta), change }
}

function diffPage(base: Page, head: Page, noise: NoiseThresholds): PageDiff {
  const scores: PageDiff['scores'] = {}
  const metrics: PageDiff['metrics'] = {}
  for (const category of CATEGORIES) {
    const b = base.scores[category]
    const h = head.scores[category]
    if (b !== null && h !== null)
      scores[category] = scoreDelta(b, h, noise.scores[category])
  }
  for (const metric of METRICS) {
    const b = base.metrics[metric]
    const h = head.metrics[metric]
    if (b !== null && h !== null)
      metrics[metric] = metricDelta(metric, b, h, noise.metrics[metric])
  }
  const changes = [...Object.values(scores), ...Object.values(metrics)].map(value => value.change)
  const status: Change = changes.includes('regressed') ? 'regressed' : changes.includes('improved') ? 'improved' : 'unchanged'
  return { url: head.url, device: head.device, template: head.template, status, scores, metrics }
}

function onlySide(page: Page, status: 'added' | 'removed' | 'failed'): PageDiff {
  return { url: page.url, device: page.device, template: page.template, status, scores: {}, metrics: {} }
}

function meanDelta(pairs: Array<[number, number]>): MeanDelta | null {
  const base = mean(pairs.map(pair => pair[0]))
  const head = mean(pairs.map(pair => pair[1]))
  if (base === null || head === null)
    return null
  return { base: roundScore(base), head: roundScore(head), delta: roundScore(head - base), pages: pairs.length }
}

function issueDiff(base: Issue | undefined, head: Issue | undefined): IssueDiff {
  const issue = (head ?? base)!
  const basePages = base?.pages ?? 0
  const headPages = head?.pages ?? 0
  return {
    auditId: issue.auditId,
    title: issue.title,
    category: issue.category,
    severity: issue.severity,
    basePages,
    headPages,
    pagesDelta: headPages - basePages,
    items: issue.items,
    impact: Math.round(issue.impact),
  }
}

function regressionWeight(diff: PageDiff): number {
  let weight = 0
  for (const value of Object.values(diff.scores)) {
    if (value.change === 'regressed')
      weight -= value.delta
  }
  for (const value of Object.values(diff.metrics)) {
    if (value.change === 'regressed' && value.base > 0)
      weight += Math.min(1, value.delta / value.base) / 100
  }
  return weight
}

export function topRegressions(comparison: ScanComparison, limit: number): PageDiff[] {
  return comparison.pages
    .filter(diff => diff.status === 'regressed')
    .map(diff => ({ diff, weight: regressionWeight(diff) }))
    .sort((a, b) => b.weight - a.weight || a.diff.url.localeCompare(b.diff.url))
    .slice(0, limit)
    .map(entry => entry.diff)
}

export function compareScans(base: CompareSide, head: CompareSide, options?: CompareOptions): ScanComparison {
  const noise = resolveNoise(options)
  const basePages = measured(base.pages)
  const headPages = measured(head.pages)
  const headFailed = new Set(head.pages.filter(page => page.status === 'failed').map(page => pageKey(page.url, page.device)))
  const pages: PageDiff[] = []
  for (const [key, page] of headPages) {
    const before = basePages.get(key)
    pages.push(before ? diffPage(before, page, noise) : onlySide(page, 'added'))
  }
  for (const [key, page] of basePages) {
    if (!headPages.has(key))
      pages.push(onlySide(page, headFailed.has(key) ? 'failed' : 'removed'))
  }
  pages.sort((a, b) => a.device.localeCompare(b.device) || a.url.localeCompare(b.url))

  const devices: DeviceDelta[] = []
  const templatePairs = new Map<string, { template: string, device: Device, pairs: Array<[number, number]> }>()
  const deviceOrder = [...new Set([...head.scan.devices, ...base.scan.devices, ...pages.map(diff => diff.device)])]
  for (const device of deviceOrder) {
    const matched = pages.filter(diff => diff.device === device && diff.status !== 'added' && diff.status !== 'removed' && diff.status !== 'failed')
    if (matched.length === 0)
      continue
    const scores: DeviceDelta['scores'] = {}
    for (const category of CATEGORIES) {
      const pairs = matched.flatMap(diff => {
        const value = diff.scores[category]
        return value ? [[value.base, value.head] as [number, number]] : []
      })
      const delta = meanDelta(pairs)
      if (delta)
        scores[category] = delta
    }
    devices.push({ device, scores })
    for (const diff of matched) {
      const perf = diff.scores.performance
      if (!perf)
        continue
      const key = `${device}\u0000${diff.template}`
      const entry = templatePairs.get(key) ?? { template: diff.template, device, pairs: [] }
      entry.pairs.push([perf.base, perf.head])
      templatePairs.set(key, entry)
    }
  }
  const templates: TemplateDelta[] = [...templatePairs.values()]
    .map(({ template, device, pairs }) => {
      const delta = meanDelta(pairs)!
      return { template, device, pages: delta.pages, base: delta.base, head: delta.head, delta: delta.delta }
    })
    .sort((a, b) => a.delta - b.delta || a.template.localeCompare(b.template))

  const baseIssues = new Map(base.issues.map(issue => [issue.auditId, issue]))
  const headIssues = new Map(head.issues.map(issue => [issue.auditId, issue]))
  const issues: ScanComparison['issues'] = { new: [], fixed: [], persisting: [], unknown: [] }
  for (const [key, issue] of headIssues) {
    const before = baseIssues.get(key)
    ;(before ? issues.persisting : issues.new).push(issueDiff(before, issue))
  }
  const affected = (issue: Issue) => base.issuePages
    ? base.issuePages(issue.auditId)
    : issue.examples.flatMap(url => issue.devices.map(device => ({ url, device })))
  for (const [key, issue] of baseIssues) {
    if (headIssues.has(key))
      continue
    const unmeasured = headFailed.size > 0 && affected(issue).some(page => headFailed.has(pageKey(page.url, page.device)))
    ;(unmeasured ? issues.unknown : issues.fixed).push(issueDiff(issue, undefined))
  }
  issues.new.sort((a, b) => b.impact - a.impact)
  issues.fixed.sort((a, b) => b.impact - a.impact)
  issues.unknown.sort((a, b) => b.impact - a.impact)
  issues.persisting.sort((a, b) => b.pagesDelta - a.pagesDelta || b.impact - a.impact)

  const pageTotals: Record<PageChange, number> = { unchanged: 0, regressed: 0, improved: 0, added: 0, removed: 0, failed: 0 }
  for (const diff of pages)
    pageTotals[diff.status]++

  return {
    base: ref(base.scan),
    head: ref(head.scan),
    noise,
    pages,
    devices,
    templates,
    issues,
    totals: {
      pages: pageTotals,
      issues: { new: issues.new.length, fixed: issues.fixed.length, persisting: issues.persisting.length, unknown: issues.unknown.length },
    },
  }
}
