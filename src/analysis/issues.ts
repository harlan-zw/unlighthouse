import type { IssuePage } from '../contracts.ts'
import type { Device, Finding, Issue, IssueItem, Page } from '../types.ts'

export const TOP_ITEMS = 3

export interface IssueHit {
  page: Page
  finding: Finding
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function maxText<T extends string | null>(a: T, b: T): T {
  if (a === null)
    return b
  if (b === null)
    return a
  return b > a ? b : a
}

function maxNumber(a: number | null, b: number | null): number | null {
  if (a === null)
    return b
  if (b === null)
    return a
  return Math.max(a, b)
}

function weight(savingsMs: number, savingsBytes: number): number {
  return savingsMs / 1000 + savingsBytes / 100000
}

export function issueItems(hits: IssueHit[], auditId: string): IssueItem[] {
  const items = new Map<string, { item: IssueItem, urls: Set<string> }>()
  for (const { page, finding } of hits) {
    if (finding.auditId !== auditId || finding.itemKey === '')
      continue
    let entry = items.get(finding.itemKey)
    if (!entry) {
      entry = { item: { key: finding.itemKey, label: null, pages: 0, savingsMs: 0, savingsBytes: 0 }, urls: new Set() }
      items.set(finding.itemKey, entry)
    }
    entry.item.label = maxText(entry.item.label, finding.itemLabel)
    entry.item.savingsMs += finding.savingsMs ?? 0
    entry.item.savingsBytes += finding.savingsBytes ?? 0
    entry.urls.add(page.url)
  }
  return [...items.values()]
    .map(({ item, urls }) => ({ ...item, pages: urls.size }))
    .sort((a, b) => weight(b.savingsMs, b.savingsBytes) - weight(a.savingsMs, a.savingsBytes) || b.pages - a.pages || compareText(a.key, b.key))
}

export function issuePages(hits: IssueHit[], auditId: string): IssuePage[] {
  const pages = new Map<string, { page: IssuePage, items: Set<string> }>()
  for (const { page, finding } of hits) {
    if (finding.auditId !== auditId)
      continue
    const key = `${page.device}\u0000${page.url}`
    let entry = pages.get(key)
    if (!entry) {
      entry = { page: { url: page.url, device: page.device, template: page.template, items: 0, savingsMs: null, savingsBytes: null, displayValue: null }, items: new Set() }
      pages.set(key, entry)
    }
    entry.page.savingsMs = maxNumber(entry.page.savingsMs, finding.savingsMs)
    entry.page.savingsBytes = maxNumber(entry.page.savingsBytes, finding.savingsBytes)
    entry.page.displayValue = maxText(entry.page.displayValue, finding.displayValue)
    if (finding.itemKey !== '')
      entry.items.add(finding.itemKey)
  }
  return [...pages.values()]
    .map(({ page, items }) => ({ ...page, items: items.size }))
    .sort((a, b) => (b.savingsMs ?? 0) - (a.savingsMs ?? 0) || (b.savingsBytes ?? 0) - (a.savingsBytes ?? 0) || compareText(a.url, b.url) || compareText(a.device, b.device))
}

export function groupIssues(hits: IssueHit[]): Issue[] {
  const byAudit = new Map<string, IssueHit[]>()
  for (const hit of hits) {
    const group = byAudit.get(hit.finding.auditId)
    if (group)
      group.push(hit)
    else
      byAudit.set(hit.finding.auditId, [hit])
  }
  const issues = [...byAudit].map(([auditId, group]): Issue => {
    const first = group[0]!.finding
    let { category, title, severity } = first
    const urls = new Set<string>()
    const devices = new Set<Device>()
    const templates = new Set<string>()
    for (const { page, finding } of group) {
      category = maxText(category, finding.category)
      title = maxText(title, finding.title)
      if (finding.severity < severity)
        severity = finding.severity
      urls.add(page.url)
      devices.add(page.device)
      templates.add(page.template)
    }
    const pages = issuePages(group, auditId)
    const savingsMs = pages.reduce((sum, page) => sum + (page.savingsMs ?? 0), 0)
    const savingsBytes = pages.reduce((sum, page) => sum + (page.savingsBytes ?? 0), 0)
    const items = issueItems(group, auditId)
    return {
      auditId,
      category,
      title,
      severity,
      pages: urls.size,
      items: items.length,
      topItems: items.slice(0, TOP_ITEMS),
      devices: [...devices].sort(),
      templates: [...templates].sort(compareText),
      savingsMs,
      savingsBytes,
      impact: urls.size * (severity === 'fail' ? 1 : 0.5) + weight(savingsMs, savingsBytes),
      examples: [...urls].sort(compareText).slice(0, 3),
    }
  })
  return issues.sort((a, b) => b.impact - a.impact || b.pages - a.pages || compareText(a.auditId, b.auditId))
}
