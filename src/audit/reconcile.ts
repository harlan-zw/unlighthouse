import type { FlowResult, FormattedIcu, Result } from 'lighthouse'
import type AuditDetails from 'lighthouse/types/lhr/audit-details.js'
import defaultConfig from 'lighthouse/core/config/default-config.js'
import { computeMedianRun, filterToValidRuns } from 'lighthouse/core/lib/median-run.js'
import type { AuditJob, AuditResult, FlowJob, FlowStepResult } from '../contracts.ts'
import type { Category, Finding, FlowMetrics, Metrics, Scores } from '../types.ts'
import { CATEGORIES } from '../types.ts'

type Details = FormattedIcu<AuditDetails>
type TableItem = FormattedIcu<AuditDetails.TableItem>
type NodeValue = AuditDetails.NodeValue
type SourceLocationValue = AuditDetails.SourceLocationValue
type Heading = FormattedIcu<AuditDetails.TableColumnHeading>
type NetworkNode = AuditDetails.NetworkNode

export type Reconciled = Omit<AuditResult, 'report' | 'durationMs' | 'thumbnail'>

const PASS_THRESHOLD = 0.9
const FAIL_THRESHOLD = 0.5
const MAX_ITEMS = 20
const MAX_KEY_LENGTH = 300
const SKIPPED_MODES = new Set(['informative', 'notApplicable', 'manual', 'error'])
const MS_SAVINGS = ['FCP', 'LCP', 'TBT', 'INP']

const METRIC_AUDITS: Record<Exclude<keyof Metrics, 'ttfb'>, string> = {
  fcp: 'first-contentful-paint',
  lcp: 'largest-contentful-paint',
  tbt: 'total-blocking-time',
  cls: 'cumulative-layout-shift',
  si: 'speed-index',
}

const SCORED_METRIC_IDS = new Set(
  (defaultConfig.categories?.['performance']?.auditRefs ?? [])
    .filter(ref => ref.group === 'metrics')
    .map(ref => ref.id),
)

interface Item {
  key: string
  label: string | null
  ms: number | null
  bytes: number | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function round(value: number | null): number | null {
  return value === null ? null : Math.round(value)
}

function boundedKey(key: string): string {
  if (key.length <= MAX_KEY_LENGTH)
    return key
  return `${key.slice(0, 200)}#${Bun.hash(key).toString(16)}`
}

function shortUrl(raw: string): string {
  if (raw.startsWith('data:'))
    return `${raw.slice(0, raw.indexOf(',') > 0 ? Math.min(raw.indexOf(','), 40) : 40)}…`
  try {
    const url = new URL(raw)
    const path = `${url.pathname}${url.search}`
    const short = path.length > 80 ? `${path.slice(0, 77)}…` : path
    return url.protocol === 'http:' || url.protocol === 'https:' ? `${url.host}${short}` : raw.slice(0, 80)
  }
  catch {
    return raw.slice(0, 80)
  }
}

function isNode(value: unknown): value is NodeValue {
  return isRecord(value) && value['type'] === 'node'
}

function isSourceLocation(value: unknown): value is SourceLocationValue {
  return isRecord(value) && value['type'] === 'source-location' && typeof value['url'] === 'string'
}

function nodeIdentity(node: NodeValue): { key: string, label: string } | null {
  const key = node.selector || node.path
  if (!key)
    return null
  return { key, label: node.nodeLabel || node.snippet || key }
}

function valueIdentity(value: unknown, valueType?: string): { key: string, label: string } | null {
  if (typeof value === 'string' && value) {
    if (valueType === 'url' || /^[a-z][a-z0-9+.-]*:/i.test(value))
      return { key: value, label: shortUrl(value) }
    return { key: value, label: value.length > 120 ? `${value.slice(0, 117)}…` : value }
  }
  if (isNode(value))
    return nodeIdentity(value)
  if (isSourceLocation(value))
    return { key: `${value.url}:${value.line}:${value.column}`, label: `${shortUrl(value.url)}:${value.line + 1}` }
  if (isRecord(value)) {
    if (value['type'] === 'url' && typeof value['value'] === 'string')
      return valueIdentity(value['value'], 'url')
    if (value['type'] === 'link' && typeof value['url'] === 'string')
      return { key: value['url'], label: typeof value['text'] === 'string' && value['text'] ? value['text'] : shortUrl(value['url']) }
    if ((value['type'] === 'code' || value['type'] === 'text') && typeof value['value'] === 'string')
      return valueIdentity(value['value'], 'text')
  }
  return null
}

function tableItemIdentity(item: TableItem, headings: Heading[]): { key: string, label: string } | null {
  const url = item['url']
  if (typeof url === 'string' && url)
    return { key: url, label: shortUrl(url) }
  for (const heading of headings) {
    if (!heading.key)
      continue
    const identity = valueIdentity(item[heading.key], heading.valueType)
    if (identity)
      return identity
  }
  for (const value of Object.values(item)) {
    if (isNode(value) || isSourceLocation(value))
      return valueIdentity(value)
  }
  return null
}

function tableItems(items: TableItem[], headings: Heading[]): Item[] {
  const out: Item[] = []
  for (const item of items) {
    const identity = tableItemIdentity(item, headings)
    if (!identity)
      continue
    out.push({ key: identity.key, label: identity.label, ms: num(item['wastedMs']), bytes: num(item['wastedBytes']) })
  }
  return out
}

function checklistItems(items: Record<string, { value: boolean, label: string }>): Item[] {
  return Object.entries(items)
    .filter(([, entry]) => entry.value === false)
    .map(([key, entry]) => ({ key, label: entry.label, ms: null, bytes: null }))
}

function networkTreeItems(chains: NetworkNode, depth = 0): Item[] {
  const out: Item[] = []
  for (const node of Object.values(chains)) {
    if (depth > 0)
      out.push({ key: node.url, label: shortUrl(node.url), ms: null, bytes: null })
    if (node.children)
      out.push(...networkTreeItems(node.children, depth + 1))
  }
  return out
}

function listItems(items: unknown[]): Item[] {
  const structured: Item[] = []
  const loose: Item[] = []
  for (const raw of items) {
    if (!isRecord(raw))
      continue
    const entry = raw['type'] === 'list-section' ? raw['value'] : raw
    if (!isRecord(entry))
      continue
    if (entry['type'] === 'table' && Array.isArray(entry['items']))
      structured.push(...tableItems(entry['items'] as TableItem[], (entry['headings'] ?? []) as Heading[]))
    else if (entry['type'] === 'checklist' && isRecord(entry['items']))
      structured.push(...checklistItems(entry['items'] as Record<string, { value: boolean, label: string }>))
    else if (entry['type'] === 'network-tree' && isRecord(entry['chains']))
      structured.push(...networkTreeItems(entry['chains'] as NetworkNode))
    else if (isNode(entry)) {
      const identity = nodeIdentity(entry)
      if (identity)
        loose.push({ ...identity, ms: null, bytes: null })
    }
  }
  return structured.length ? structured : loose
}

function detailItems(details: Details | undefined): Item[] {
  if (!details)
    return []
  switch (details.type) {
    case 'table':
    case 'opportunity':
      return tableItems(details.items as TableItem[], details.headings)
    case 'checklist':
      return checklistItems(details.items)
    case 'list':
      return listItems(details.items)
    default:
      return []
  }
}

function auditSavingsMs(audit: Result['audits'][string]): number | null {
  const savings = audit.metricSavings
  if (!savings)
    return null
  let best: number | null = null
  for (const metric of MS_SAVINGS) {
    const value = num(savings[metric])
    if (value !== null && (best === null || value > best))
      best = value
  }
  return best
}

function auditSavingsBytes(details: Details | undefined): number | null {
  if (!details)
    return null
  if (details.type === 'opportunity')
    return num(details.overallSavingsBytes)
  if (details.type === 'table')
    return num(details.summary?.wastedBytes)
  return null
}

function mergeItems(items: Item[]): Item[] {
  const byKey = new Map<string, Item>()
  for (const item of items) {
    const key = boundedKey(item.key)
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, { ...item, key })
      continue
    }
    if (item.ms !== null)
      existing.ms = (existing.ms ?? 0) + item.ms
    if (item.bytes !== null)
      existing.bytes = (existing.bytes ?? 0) + item.bytes
  }
  return [...byKey.values()]
}

function findingsFor(audit: Result['audits'][string], category: Category | null): Finding[] {
  const score = audit.score as number
  const base = {
    auditId: audit.id,
    category,
    title: audit.title,
    severity: score < FAIL_THRESHOLD ? 'fail' as const : 'warn' as const,
    score,
    displayValue: audit.displayValue ?? null,
  }
  const details = audit.details as Details | undefined
  const auditMs = auditSavingsMs(audit)
  const items = mergeItems(detailItems(details))
  if (!items.length) {
    const bytes = auditSavingsBytes(details)
    return [{ ...base, itemKey: '', itemLabel: null, savingsMs: round(auditMs), savingsBytes: round(bytes) }]
  }

  const totalBytes = items.reduce((sum, item) => sum + (item.bytes ?? 0), 0)
  return items.slice(0, MAX_ITEMS).map((item) => {
    let ms = item.ms
    if (ms === null && auditMs !== null) {
      if (items.length === 1)
        ms = auditMs
      else if (item.bytes !== null && totalBytes > 0)
        ms = auditMs * item.bytes / totalBytes
    }
    return { ...base, itemKey: item.key, itemLabel: item.label, savingsMs: round(ms), savingsBytes: round(item.bytes) }
  })
}

function findings(lhr: Result, categories: Category[], plugins: string[]): Finding[] {
  const out: Finding[] = []
  const seen = new Set<string>()
  for (const id of [...categories, ...plugins]) {
    const category = (categories as string[]).includes(id) ? id as Category : null
    for (const ref of lhr.categories[id]?.auditRefs ?? []) {
      if (seen.has(ref.id) || SCORED_METRIC_IDS.has(ref.id) || ref.group === 'hidden')
        continue
      seen.add(ref.id)
      const audit = lhr.audits[ref.id]
      if (!audit || SKIPPED_MODES.has(audit.scoreDisplayMode))
        continue
      if (audit.score === null || audit.score >= PASS_THRESHOLD)
        continue
      out.push(...findingsFor(audit, category))
    }
  }
  return out
}

function scores(lhr: Result): Scores {
  const out = {} as Scores
  for (const category of CATEGORIES)
    out[category] = num(lhr.categories[category]?.score)
  return out
}

function timeToFirstByte(lhr: Result): number | null {
  const details = lhr.audits['metrics']?.details as Details | undefined
  if (details?.type !== 'debugdata')
    return null
  const items = details['items']
  return Array.isArray(items) && isRecord(items[0]) ? num(items[0]['timeToFirstByte']) : null
}

function metrics(lhr: Result): Metrics {
  const out = { ttfb: timeToFirstByte(lhr) } as Metrics
  for (const [metric, auditId] of Object.entries(METRIC_AUDITS) as Array<[keyof typeof METRIC_AUDITS, string]>)
    out[metric] = num(lhr.audits[auditId]?.numericValue)
  return out
}

function mainDocumentStatus(lhr: Result): number | null {
  const details = lhr.audits['network-requests']?.details as Details | undefined
  if (details?.type !== 'table')
    return null
  const target = lhr.mainDocumentUrl ?? lhr.finalDisplayedUrl
  const documents = (details.items as TableItem[]).filter(item => item['resourceType'] === 'Document')
  const main = documents.find(item => item['url'] === target) ?? documents[0]
  return main ? num(main['statusCode']) : null
}

export function performanceScore(lhr: Result): number | null {
  return num(lhr.categories['performance']?.score)
}

export function runtimeError(lhr: Result): { code: string, message: string } | null {
  return lhr.runtimeError ? { code: lhr.runtimeError.code, message: lhr.runtimeError.message } : null
}

export function redactReport(lhr: Result): Result {
  const headers = lhr.configSettings?.extraHeaders
  if (!headers)
    return lhr
  return { ...lhr, configSettings: { ...lhr.configSettings, extraHeaders: Object.fromEntries(Object.keys(headers).map(name => [name, '[redacted]'])) } }
}

export function medianRun(lhrs: Result[]): Result {
  const valid = filterToValidRuns(lhrs)
  const median = valid.length ? computeMedianRun(valid) : lhrs[0]
  if (!median)
    throw new Error('No Lighthouse runs to choose from')
  return median
}

export function sampleSpread(lhrs: Result[]): number | null {
  const values = lhrs.map(performanceScore).filter((value): value is number => value !== null)
  if (values.length < 2)
    return null
  return Math.round((Math.max(...values) - Math.min(...values)) * 1000) / 1000
}

export function finalScreenshot(lhr: Result): Uint8Array | null {
  const details = lhr.audits['final-screenshot']?.details as Details | undefined
  if (details?.type !== 'screenshot' || typeof details.data !== 'string')
    return null
  const match = /^data:image\/[\w.+-]+;base64,(.+)$/s.exec(details.data)
  if (!match)
    return null
  try {
    return Uint8Array.fromBase64(match[1]!)
  }
  catch {
    return null
  }
}

function passedFraction(category: Result['categories'][string], lhr: Result): number | null {
  let passable = 0
  let passed = 0
  for (const ref of category.auditRefs) {
    const audit = lhr.audits[ref.id]
    if (!audit || ref.group === 'hidden' || audit.scoreDisplayMode === 'manual' || audit.scoreDisplayMode === 'notApplicable' || audit.scoreDisplayMode === 'informative')
      continue
    passable++
    if (audit.scoreDisplayMode !== 'error' && Number(audit.score) >= PASS_THRESHOLD)
      passed++
  }
  return passable ? Math.round(passed / passable * 1000) / 1000 : null
}

function stepScores(lhr: Result): Scores {
  if (lhr.gatherMode === 'navigation')
    return scores(lhr)
  const out = {} as Scores
  for (const category of CATEGORIES) {
    const entry = lhr.categories[category]
    out[category] = entry ? passedFraction(entry, lhr) : null
  }
  return out
}

function stepMetrics(lhr: Result): FlowMetrics {
  return { ...metrics(lhr), inp: num(lhr.audits['interaction-to-next-paint']?.numericValue) }
}

export function reconcileFlow(flow: FlowResult, job: Pick<FlowJob, 'categories'>): FlowStepResult[] {
  return flow.steps.map(({ lhr, name }) => {
    const warnings = [...lhr.runWarnings]
    if (lhr.runtimeError)
      warnings.push(`${lhr.runtimeError.code}: ${lhr.runtimeError.message}`)
    return {
      name,
      mode: lhr.gatherMode,
      url: lhr.finalDisplayedUrl || lhr.mainDocumentUrl || '',
      scores: stepScores(lhr),
      metrics: stepMetrics(lhr),
      findings: findings(lhr, job.categories, []),
      warnings,
    }
  })
}

export function flowLighthouseVersion(flow: FlowResult): string {
  return flow.steps[0]?.lhr.lighthouseVersion ?? ''
}

export function redactFlowReport(flow: FlowResult): FlowResult {
  return { ...flow, steps: flow.steps.map(step => ({ ...step, lhr: redactReport(step.lhr) })) }
}

export function reconcile(lhr: Result, job: AuditJob, spread: number | null): Reconciled {
  const warnings = [...lhr.runWarnings]
  if (lhr.runtimeError)
    warnings.push(`${lhr.runtimeError.code}: ${lhr.runtimeError.message}`)
  const benchmarkIndex = num(lhr.environment?.benchmarkIndex)
  const runner = job.runner?.type ?? 'local'
  return {
    finalUrl: lhr.finalDisplayedUrl || lhr.mainDocumentUrl || job.url,
    statusCode: mainDocumentStatus(lhr),
    scores: scores(lhr),
    metrics: metrics(lhr),
    provenance: {
      lighthouseVersion: lhr.lighthouseVersion,
      benchmarkIndex: benchmarkIndex === null ? null : Math.round(benchmarkIndex),
      throttling: runner === 'psi' ? lhr.configSettings?.throttlingMethod ?? job.throttling : job.throttling,
      concurrency: job.concurrency,
      samples: job.samples,
      spread,
      warnings,
      runner,
    },
    findings: findings(lhr, job.categories, job.lighthouse?.plugins ?? []),
  }
}

export function psiLighthouseResult(body: unknown): Result | null {
  if (!isRecord(body) || !isRecord(body['lighthouseResult']))
    return null
  const lhr = body['lighthouseResult']
  return typeof lhr['lighthouseVersion'] === 'string' && isRecord(lhr['audits']) && isRecord(lhr['categories']) ? lhr as unknown as Result : null
}
