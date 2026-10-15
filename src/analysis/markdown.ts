import type { Category, FieldMetric, Metric } from '../types.ts'
import type { BudgetReport, BudgetResult } from './budgets.ts'
import type { IssueDiff, ScanComparison } from './compare.ts'
import type { ScanSummary } from './summary.ts'
import { CATEGORIES, FIELD_METRICS, METRICS } from '../types.ts'
import { topRegressions } from './compare.ts'
import { describeWarning, SITE_CHECKS } from './summary.ts'
import { rateMetric } from './thresholds.ts'

export interface MarkdownInput {
  summary: ScanSummary
  comparison?: ScanComparison
  budgets?: BudgetReport
  reportUrl?: string
}

const CATEGORY_LABELS: Record<Category, string> = {
  'performance': 'Performance',
  'accessibility': 'Accessibility',
  'best-practices': 'Best practices',
  'seo': 'SEO',
  'agentic-browsing': 'Agentic browsing',
}

const METRIC_LABELS: Record<Metric, string> = { fcp: 'FCP', lcp: 'LCP', tbt: 'TBT', cls: 'CLS', si: 'SI', ttfb: 'TTFB' }

const VISIBLE_ISSUES = 5
const VISIBLE_REGRESSIONS = 5

function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/</g, '&lt;').replace(/\n/g, ' ')
}

function shortUrl(url: string, origin: string): string {
  return url.startsWith(origin) ? url.slice(origin.length) || '/' : url
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}

function score(value: number): string {
  return String(Math.round(value * 100))
}

function metricValue(metric: Metric, value: number): string {
  if (metric === 'cls')
    return String(value)
  return value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`
}

function metricDelta(metric: Metric, value: number): string {
  if (metric === 'cls')
    return signed(value)
  return `${value > 0 ? '+' : ''}${Math.round(value)} ms`
}

function table(header: string[], rows: string[][], align?: string[]): string[] {
  return [
    `| ${header.join(' | ')} |`,
    `| ${(align ?? header.map(() => '---')).join(' | ')} |`,
    ...rows.map(row => `| ${row.join(' | ')} |`),
  ]
}

function details(summary: string, body: string[]): string[] {
  return ['<details>', `<summary>${summary}</summary>`, '', ...body, '', '</details>']
}

function verdict(input: MarkdownInput): string {
  const parts: string[] = []
  const budgets = input.budgets
  if (budgets) {
    const failed = budgets.results.filter(result => !result.passed).length
    const checked = budgets.results.filter(result => !result.skipped).length
    parts.push(budgets.passed ? `**Budgets passed** (${checked} rules)` : `**Budgets failed**: ${failed} of ${checked} rules`)
  }
  else {
    parts.push(`**Scan ${input.summary.scan.status}**`)
  }
  const comparison = input.comparison
  if (comparison) {
    const { regressed, improved, failed } = comparison.totals.pages
    const base = comparison.base.commit?.slice(0, 7) ?? comparison.base.label ?? comparison.base.id
    parts.push(`${regressed} page(s) regressed, ${improved} improved${failed ? `, ${failed} now failing` : ''} vs \`${base}\``)
  }
  if (input.reportUrl)
    parts.push(`[Full report](${input.reportUrl})`)
  return parts.join(' · ')
}

function coverage(summary: ScanSummary): string {
  const { discovered, audited, skippedBySampling, failed } = summary.pages
  const extra = [`${skippedBySampling} skipped by sampling`]
  if (failed > 0)
    extra.push(`${failed} failed`)
  const broken = summary.brokenLinks > 0 ? ` · ${summary.brokenLinks} broken link(s)` : ''
  return `Audited ${audited} of ${discovered} discovered pages (${extra.join(', ')})${broken}`
}

function measuredDevices(summary: ScanSummary): ScanSummary['devices'] {
  return summary.devices.filter(device => (device.pages.done ?? 0) > 0)
}

function scoreTable(summary: ScanSummary, comparison?: ScanComparison): string[] {
  const categories = CATEGORIES.filter(category => summary.devices.some(device => device.scores.mean[category] !== undefined))
  if (categories.length === 0)
    return []
  const rows = measuredDevices(summary).map(device => {
    const deltas = comparison?.devices.find(entry => entry.device === device.device)?.scores
    return [device.device, ...categories.map(category => {
      const mean = device.scores.mean[category]
      if (mean === undefined)
        return '–'
      const delta = deltas?.[category]?.delta
      const shown = delta === undefined ? 0 : Math.round(delta * 100)
      return shown === 0 ? score(mean) : `${score(mean)} (${signed(shown)})`
    })]
  })
  return table(['Device', ...categories.map(category => CATEGORY_LABELS[category])], rows, ['---', ...categories.map(() => '--:')])
}

function metricTable(summary: ScanSummary): string[] {
  const metrics = METRICS.filter(metric => summary.devices.some(device => device.p75[metric] !== undefined))
  if (metrics.length === 0)
    return []
  const rows = measuredDevices(summary).map(device => [device.device, ...metrics.map(metric => {
    const p75 = device.p75[metric]
    if (p75 === undefined)
      return '–'
    const rating = rateMetric(metric, p75, device.device)
    return `${metricValue(metric, p75)}${rating === 'good' ? '' : ` (${rating})`}`
  })])
  return table(['p75', ...metrics.map(metric => METRIC_LABELS[metric])], rows, ['---', ...metrics.map(() => '--:')])
}

const FIELD_LABELS: Record<FieldMetric, string> = { lcp: 'LCP', inp: 'INP', cls: 'CLS', fcp: 'FCP', ttfb: 'TTFB' }

function fieldLines(summary: ScanSummary): string[] {
  const lines = summary.devices.flatMap((device) => {
    const field = device.field
    const values = FIELD_METRICS.filter(metric => field?.p75[metric] !== undefined)
      .map(metric => `${FIELD_LABELS[metric]} ${metric === 'cls' ? String(field!.p75[metric]) : metricValue('lcp', field!.p75[metric]!)}`)
    return values.length ? [`- ${device.device}: ${values.join(' · ')}`] : []
  })
  if (lines.length === 0)
    return []
  return ['Field p75 (Chrome UX Report, real users of the whole origin, 28 days; not comparable one-to-one with the lab p75 above):', '', ...lines, '']
}

function budgetRow(result: BudgetResult): string[] {
  const state = result.skipped ? 'skipped' : result.passed ? 'pass' : '**fail**'
  return [state, `\`${result.rule}\``, result.scope.startsWith('template:') ? `\`${cell(result.scope)}\`` : result.scope, result.actual === null ? '–' : String(result.actual), String(result.limit), cell(result.detail ?? '')]
}

function budgetSection(budgets: BudgetReport): string[] {
  if (budgets.results.length === 0)
    return []
  const header = ['Result', 'Rule', 'Scope', 'Actual', 'Limit', 'Detail']
  const failed = budgets.results.filter(result => !result.passed)
  const rest = budgets.results.filter(result => result.passed)
  const out = ['#### Budgets', '']
  if (failed.length > 0)
    out.push(...table(header, failed.map(budgetRow)), '')
  if (rest.length > 0)
    out.push(...details(`Passed or skipped (${rest.length})`, table(header, rest.map(budgetRow))), '')
  return out
}

function regressionSection(summary: ScanSummary, comparison: ScanComparison): string[] {
  const regressions = topRegressions(comparison, VISIBLE_REGRESSIONS)
  if (regressions.length === 0)
    return []
  const rows = regressions.map(diff => {
    const changes = [
      ...CATEGORIES.flatMap(category => {
        const value = diff.scores[category]
        return value && value.change !== 'unchanged' ? [`${CATEGORY_LABELS[category]} ${signed(Math.round(value.delta * 100))}`] : []
      }),
      ...METRICS.flatMap(metric => {
        const value = diff.metrics[metric]
        return value && value.change !== 'unchanged' ? [`${METRIC_LABELS[metric]} ${metricDelta(metric, value.delta)}`] : []
      }),
    ]
    return [cell(shortUrl(diff.url, summary.scan.origin)), diff.device, cell(diff.template), changes.join(', ')]
  })
  const out = ['#### Top regressions', '', ...table(['Page', 'Device', 'Template', 'Change'], rows), '']
  const templates = comparison.templates.filter(entry => entry.delta <= -comparison.noise.scores.performance)
  if (templates.length > 0)
    out.push(`Templates with lower mean performance: ${templates.slice(0, VISIBLE_REGRESSIONS).map(entry => `\`${entry.template}\` ${entry.device} ${signed(Math.round(entry.delta * 100))}`).join(', ')}`, '')
  return out
}

function issueLine(issue: IssueDiff, pages: number): string {
  const label = issue.itemLabel ? ` — ${cell(issue.itemLabel)}` : ''
  return `- ${cell(issue.title)} (\`${issue.auditId}\`)${label} · ${pages} page(s)`
}

function issueList(title: string, issues: IssueDiff[], pagesOf: (issue: IssueDiff) => number): string[] {
  if (issues.length === 0)
    return []
  const lines = issues.map(issue => issueLine(issue, pagesOf(issue)))
  const out = [`**${title} (${issues.length})**`, '', ...lines.slice(0, VISIBLE_ISSUES), '']
  if (lines.length > VISIBLE_ISSUES)
    out.push(...details(`${lines.length - VISIBLE_ISSUES} more`, lines.slice(VISIBLE_ISSUES)), '')
  return out
}

function issueSection(comparison: ScanComparison): string[] {
  const { issues } = comparison
  if (issues.new.length === 0 && issues.fixed.length === 0 && issues.unknown.length === 0)
    return []
  return [
    '#### Issues',
    '',
    ...issueList('New', issues.new, issue => issue.headPages),
    ...issueList('Fixed', issues.fixed, issue => issue.basePages),
    ...issueList('Unknown: an affected page failed in this scan', issues.unknown, issue => issue.basePages),
  ]
}

function topIssueSection(summary: ScanSummary): string[] {
  if (summary.topIssues.length === 0)
    return []
  const lines = summary.topIssues.map(issue => `- ${cell(issue.title)} (\`${issue.auditId}\`)${issue.itemLabel ? ` — ${cell(issue.itemLabel)}` : ''} · ${issue.pages} page(s)`)
  return [...details(`Top issues (${lines.length})`, lines), '']
}

function siteCheckLine(summary: ScanSummary): string[] {
  const checks = SITE_CHECKS.filter(check => summary.siteChecks[check.auditId] !== 'not-measured')
  if (checks.length === 0)
    return []
  return [`Site checks: ${checks.map(check => {
    const status = summary.siteChecks[check.auditId]
    return `${check.title} ${status === 'pass' ? 'pass' : `**${status}**`}`
  }).join(' · ')}`, '']
}

function warningSection(summary: ScanSummary): string[] {
  if (summary.warnings.length === 0)
    return []
  return ['> [!WARNING]', ...summary.warnings.map(warning => `> ${describeWarning(warning)}`), '']
}

export function toMarkdown(input: MarkdownInput): string {
  const { summary, comparison, budgets } = input
  const lines = [
    `### Unlighthouse · ${summary.scan.origin}`,
    '',
    verdict(input),
    '',
    coverage(summary),
    '',
    ...scoreTable(summary, comparison),
    '',
    ...metricTable(summary),
    '',
    ...fieldLines(summary),
    ...siteCheckLine(summary),
    ...warningSection(summary),
    ...(budgets ? budgetSection(budgets) : []),
    ...(comparison ? regressionSection(summary, comparison) : []),
    ...(comparison ? issueSection(comparison) : topIssueSection(summary)),
  ]
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`
}
