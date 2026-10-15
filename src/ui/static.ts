import type { ScanComparison } from '../analysis/compare.ts'
import type { ScanSummary } from '../analysis/summary.ts'
import type { BrokenLink, IssuePage, IssueQuery, Paged, PageQuery, TemplateCount } from '../contracts.ts'
import { CATEGORIES } from '../types.ts'
import type { Category, Device, Finding, Issue, Metrics, Page, Scan } from '../types.ts'
import { ApiError } from './api.ts'
import type { Client, Input, Operation, Operations, Output } from './api.ts'
import type { SiteListItem } from './shapes.ts'

export const SNAPSHOT_VERSION = 1

export interface Snapshot {
  version: typeof SNAPSHOT_VERSION
  unlighthouse: string
  generatedAt: number
  scanId: string
  site: SiteListItem
  scans: Scan[]
  summary: ScanSummary
  pages: Page[]
  findings: Record<string, Finding[]>
  templates: TemplateCount[]
  brokenLinks: BrokenLink[]
  comparison: ScanComparison | null
  reports: Record<string, string>
}

export function pageKey(url: string, device: Device): string {
  return `${device} ${url}`
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function sortValue(page: Page, sort: NonNullable<PageQuery['sort']>): string | number | null {
  if (sort === 'url')
    return page.url
  if (sort === 'template')
    return page.template
  if ((CATEGORIES as readonly string[]).includes(sort))
    return page.scores[sort as Category]
  return page.metrics[sort as keyof Metrics]
}

export function listPages(snapshot: Snapshot, query: PageQuery): Paged<Page> {
  const needle = query.search?.toLowerCase()
  const rows = snapshot.pages.filter(page =>
    (query.device === undefined || page.device === query.device)
    && (query.template === undefined || page.template === query.template)
    && (query.status === undefined || page.status === query.status)
    && (!needle || page.url.toLowerCase().includes(needle)))
  const sort = query.sort ?? 'url'
  const direction = query.order === 'desc' ? -1 : 1
  rows.sort((a, b) => {
    const va = sortValue(a, sort)
    const vb = sortValue(b, sort)
    if (sort === 'url')
      return direction * compareText(a.url, b.url) || compareText(a.device, b.device)
    if (va !== vb) {
      if (va === null)
        return 1
      if (vb === null)
        return -1
      return direction * (typeof va === 'number' && typeof vb === 'number' ? va - vb : compareText(String(va), String(vb)))
    }
    return compareText(a.url, b.url) || compareText(a.device, b.device)
  })
  return { items: rows.slice(query.offset, query.offset + query.limit), total: rows.length }
}

interface Hit {
  page: Page
  finding: Finding
}

function hits(snapshot: Snapshot, filter: { category?: Category, device?: Device, template?: string }): Hit[] {
  const out: Hit[] = []
  for (const page of snapshot.pages) {
    if ((filter.device !== undefined && page.device !== filter.device) || (filter.template !== undefined && page.template !== filter.template))
      continue
    for (const finding of snapshot.findings[pageKey(page.url, page.device)] ?? []) {
      if (filter.category === undefined || finding.category === filter.category)
        out.push({ page, finding })
    }
  }
  return out
}

function maxText<T extends string | null>(a: T, b: T): T {
  if (a === null)
    return b
  if (b === null)
    return a
  return b > a ? b : a
}

export function listIssues(snapshot: Snapshot, query: IssueQuery): Paged<Issue> {
  const filter: { category?: Category, device?: Device, template?: string } = {}
  if (query.category !== undefined)
    filter.category = query.category
  if (query.device !== undefined)
    filter.device = query.device
  if (query.template !== undefined)
    filter.template = query.template
  const groups = new Map<string, { issue: Issue, urls: Set<string>, devices: Set<Device>, templates: Set<string> }>()
  for (const { page, finding } of hits(snapshot, filter)) {
    const key = `${finding.auditId}\u0000${finding.itemKey}`
    let group = groups.get(key)
    if (!group) {
      group = {
        issue: { auditId: finding.auditId, category: finding.category, title: finding.title, itemKey: finding.itemKey, itemLabel: finding.itemLabel, severity: finding.severity, pages: 0, devices: [], templates: [], savingsMs: 0, savingsBytes: 0, impact: 0, examples: [] },
        urls: new Set(),
        devices: new Set(),
        templates: new Set(),
      }
      groups.set(key, group)
    }
    const { issue } = group
    issue.category = maxText(issue.category, finding.category)
    issue.title = maxText(issue.title, finding.title)
    issue.itemLabel = maxText(issue.itemLabel, finding.itemLabel)
    if (finding.severity < issue.severity)
      issue.severity = finding.severity
    issue.savingsMs += finding.savingsMs ?? 0
    issue.savingsBytes += finding.savingsBytes ?? 0
    group.urls.add(page.url)
    group.devices.add(page.device)
    group.templates.add(page.template)
  }
  const issues = [...groups.values()].map(({ issue, urls, devices, templates }) => ({
    ...issue,
    pages: urls.size,
    devices: [...devices].sort(),
    templates: [...templates].sort(),
    impact: urls.size * (issue.severity === 'fail' ? 1 : 0.5) + issue.savingsMs / 1000 + issue.savingsBytes / 100000,
    examples: [...urls].sort(compareText).slice(0, 3),
  }))
  issues.sort((a, b) => b.impact - a.impact || b.pages - a.pages || compareText(a.auditId, b.auditId) || compareText(a.itemKey, b.itemKey))
  return { items: issues.slice(query.offset, query.offset + query.limit), total: issues.length }
}

export function issuePages(snapshot: Snapshot, auditId: string, itemKey: string): IssuePage[] {
  return hits(snapshot, {})
    .filter(({ finding }) => finding.auditId === auditId && finding.itemKey === itemKey)
    .map(({ page, finding }): IssuePage => ({ url: page.url, device: page.device, template: page.template, savingsMs: finding.savingsMs, savingsBytes: finding.savingsBytes, displayValue: finding.displayValue }))
    .sort((a, b) => (b.savingsMs ?? 0) - (a.savingsMs ?? 0) || (b.savingsBytes ?? 0) - (a.savingsBytes ?? 0) || compareText(a.url, b.url) || compareText(a.device, b.device))
}

function missing(what: string): never {
  throw new ApiError('NOT_FOUND', `${what} is not part of this static report`)
}

export function createStaticClient(snapshot: Snapshot): Client {
  const exported = (scanId: string): void => {
    if (scanId !== snapshot.scanId)
      missing(`Scan ${scanId}`)
  }
  const handlers: { [K in Operation]: (input: Operations[K]['input']) => Operations[K]['output'] } = {
    'sites.list': () => [snapshot.site],
    'scans.list': (input) => {
      const scans = snapshot.scans
        .filter(scan => (input.origin === undefined || scan.origin === input.origin) && (input.status === undefined || scan.status === input.status))
        .sort((a, b) => b.createdAt - a.createdAt)
      return { items: scans.slice(input.offset, input.offset + input.limit), total: scans.length }
    },
    'scans.start': () => missing('Starting a scan'),
    'scans.get': input => snapshot.scans.find(scan => scan.id === input.scanId) ?? missing(`Scan ${input.scanId}`),
    'scans.cancel': () => missing('Cancelling a scan'),
    'scans.summary': (input) => {
      exported(input.scanId)
      return snapshot.summary
    },
    'scans.brokenLinks': (input) => {
      exported(input.scanId)
      return snapshot.brokenLinks
    },
    'scans.templates': (input) => {
      exported(input.scanId)
      return snapshot.templates
    },
    'pages.list': (input) => {
      exported(input.scanId)
      return listPages(snapshot, input)
    },
    'pages.get': (input) => {
      exported(input.scanId)
      const page = snapshot.pages.find(candidate => candidate.url === input.url && candidate.device === input.device) ?? missing(`Page ${input.url} (${input.device})`)
      return { ...page, findings: snapshot.findings[pageKey(page.url, page.device)] ?? [] }
    },
    'issues.list': (input) => {
      exported(input.scanId)
      return listIssues(snapshot, input)
    },
    'issues.get': (input) => {
      exported(input.scanId)
      const issue = listIssues(snapshot, { scanId: input.scanId, limit: Number.MAX_SAFE_INTEGER, offset: 0 }).items
        .find(candidate => candidate.auditId === input.auditId && candidate.itemKey === input.itemKey) ?? missing(`Issue ${input.auditId}`)
      return { issue, pages: issuePages(snapshot, input.auditId, input.itemKey) }
    },
    'compare': (input) => {
      const comparison = snapshot.comparison
      if (!comparison || comparison.base.id !== input.base || comparison.head.id !== input.head)
        missing(`The comparison of ${input.base} with ${input.head}`)
      return comparison
    },
  }
  return {
    mode: 'static',
    reportUrl: (scanId, device, url) => (scanId === snapshot.scanId ? snapshot.reports[pageKey(url, device)] ?? null : null),
    async call<K extends Operation>(operation: K, input: Input<K>): Promise<Output<K>> {
      const handler = handlers[operation] as (input: Input<K>) => Output<K>
      return structuredClone(handler(input))
    },
    subscribe: () => () => {},
    onConnection(listener) {
      listener('closed')
      return () => {}
    },
  }
}
