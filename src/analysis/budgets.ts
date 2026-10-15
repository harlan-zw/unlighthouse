import type { Budgets, TemplateBudget } from '../config.ts'
import type { FlowRun, Metric, Page } from '../types.ts'
import type { ScanComparison } from './compare.ts'
import { flowBudgetRules } from './flows.ts'
import type { ScanSummary } from './summary.ts'
import { CATEGORIES, FIELD_METRICS, METRICS } from '../types.ts'
import { mean, present, roundMetric, roundScore } from './stats.ts'

export interface BudgetResult {
  rule: string
  scope: string
  actual: number | null
  limit: number
  passed: boolean
  skipped?: true
  detail?: string
}

export interface BudgetReport {
  passed: boolean
  results: BudgetResult[]
}

export interface BudgetInput {
  summary: ScanSummary
  pages: Page[]
  comparison?: ScanComparison
  flows?: FlowRun[]
}

const WORST_URLS = 3

function skipped(rule: string, scope: string, limit: number, detail: string): BudgetResult {
  return { rule, scope, actual: null, limit, passed: true, skipped: true, detail }
}

function scoreRules(summary: ScanSummary, budgets: Budgets): BudgetResult[] {
  const results: BudgetResult[] = []
  for (const category of CATEGORIES) {
    const limit = budgets.scores[category]
    if (limit === undefined)
      continue
    for (const device of summary.devices) {
      const rule = `score:${category}`
      const actual = device.scores.mean[category]
      if (actual === undefined) {
        results.push(skipped(rule, device.device, limit, 'category not measured'))
        continue
      }
      results.push({ rule, scope: device.device, actual, limit, passed: actual >= limit })
    }
  }
  return results
}

function formatMetric(metric: Metric, value: number): string {
  return metric === 'cls' ? String(roundMetric(metric, value)) : `${Math.round(value)} ms`
}

function metricResult(rule: string, scope: string, metric: Metric, limit: number, pages: Page[]): BudgetResult {
  const values = pages
    .filter(page => page.status === 'done' && page.metrics[metric] !== null)
    .map(page => ({ url: page.url, value: page.metrics[metric]! }))
    .sort((a, b) => b.value - a.value)
  if (values.length === 0)
    return skipped(rule, scope, limit, 'metric not measured')
  const over = values.filter(entry => entry.value > limit)
  const result: BudgetResult = { rule, scope, actual: roundMetric(metric, values[0]!.value), limit, passed: over.length === 0 }
  if (over.length > 0) {
    const worst = over.slice(0, WORST_URLS).map(entry => `${entry.url} (${formatMetric(metric, entry.value)})`).join(', ')
    const more = over.length > WORST_URLS ? ` and ${over.length - WORST_URLS} more` : ''
    result.detail = `${over.length} page(s) over the limit: ${worst}${more}`
  }
  return result
}

function metricRules(summary: ScanSummary, pages: Page[], budgets: Budgets): BudgetResult[] {
  const results: BudgetResult[] = []
  for (const metric of METRICS) {
    const limit = budgets.metrics[metric]
    if (limit === undefined)
      continue
    for (const { device } of summary.devices)
      results.push(metricResult(`metric:${metric}`, device, metric, limit, pages.filter(page => page.device === device)))
  }
  return results
}

function matchesTemplate(budget: TemplateBudget, glob: Bun.Glob, page: Page): boolean {
  return page.template === budget.match || glob.match(page.path)
}

function templateRules(summary: ScanSummary, pages: Page[], budgets: Budgets): BudgetResult[] {
  const results: BudgetResult[] = []
  for (const budget of budgets.templates) {
    const glob = new Bun.Glob(budget.match)
    const matching = pages.filter(page => matchesTemplate(budget, glob, page))
    const devices = summary.devices.map(entry => entry.device).filter(device => budget.device === undefined || device === budget.device)
    for (const device of devices) {
      const scope = `template:${budget.match}/${device}`
      const group = matching.filter(page => page.device === device)
      const done = group.filter(page => page.status === 'done')
      for (const category of CATEGORIES) {
        const limit = budget.scores[category]
        if (limit === undefined)
          continue
        const rule = `score:${category}`
        const value = mean(present(done.map(page => page.scores[category])))
        if (value === null) {
          results.push(skipped(rule, scope, limit, group.length ? 'category not measured' : 'no matching pages'))
          continue
        }
        const actual = roundScore(value)
        results.push({ rule, scope, actual, limit, passed: actual >= limit, detail: `mean over ${done.length} page(s)` })
      }
      for (const metric of METRICS) {
        const limit = budget.metrics[metric]
        if (limit === undefined)
          continue
        const result = metricResult(`metric:${metric}`, scope, metric, limit, group)
        if (result.skipped && !group.length)
          result.detail = 'no matching pages'
        results.push(result)
      }
    }
  }
  return results
}

function fieldRules(summary: ScanSummary, budgets: Budgets): BudgetResult[] {
  const results: BudgetResult[] = []
  for (const metric of FIELD_METRICS) {
    const limit = budgets.field[metric]
    if (limit === undefined)
      continue
    for (const device of summary.devices) {
      const rule = `field:${metric}`
      const actual = device.field?.p75[metric]
      if (actual === undefined) {
        results.push(skipped(rule, device.device, limit, device.field ? 'metric has no field data' : 'no field data'))
        continue
      }
      results.push({ rule, scope: device.device, actual, limit, passed: actual <= limit, detail: 'CrUX origin p75' })
    }
  }
  return results
}

function regressionRules(summary: ScanSummary, budgets: Budgets, comparison?: ScanComparison): BudgetResult[] {
  const results: BudgetResult[] = []
  for (const category of CATEGORIES) {
    const limit = budgets.regression[category]
    if (limit === undefined)
      continue
    for (const { device } of summary.devices) {
      const rule = `regression:${category}`
      if (!comparison) {
        results.push(skipped(rule, device, limit, 'no baseline'))
        continue
      }
      const delta = comparison.devices.find(entry => entry.device === device)?.scores[category]
      if (!delta) {
        results.push(skipped(rule, device, limit, 'no matching pages in baseline'))
        continue
      }
      const drop = roundScore(Math.max(0, -delta.delta))
      results.push({ rule, scope: device, actual: drop, limit, passed: drop <= limit + 1e-9, detail: `mean ${delta.base} → ${delta.head} over ${delta.pages} page(s)` })
    }
  }
  return results
}

function newIssueRule(budgets: Budgets, comparison?: ScanComparison): BudgetResult[] {
  const limit = budgets.newIssues
  if (limit === undefined)
    return []
  if (!comparison)
    return [skipped('new-issues', 'site', limit, 'no baseline')]
  const actual = comparison.totals.issues.new
  const result: BudgetResult = { rule: 'new-issues', scope: 'site', actual, limit, passed: actual <= limit }
  if (actual > 0)
    result.detail = comparison.issues.new.slice(0, WORST_URLS).map(issue => `${issue.auditId} (${issue.headPages} page(s))`).join(', ')
  return [result]
}

export function checkBudgets(input: BudgetInput, budgets: Budgets): BudgetReport {
  const results = [
    ...scoreRules(input.summary, budgets),
    ...metricRules(input.summary, input.pages, budgets),
    ...templateRules(input.summary, input.pages, budgets),
    ...fieldRules(input.summary, budgets),
    ...regressionRules(input.summary, budgets, input.comparison),
    ...newIssueRule(budgets, input.comparison),
    ...flowBudgetRules(input.flows ?? [], budgets),
  ]
  return { passed: results.every(result => result.passed), results }
}
