import type { AccessibilitySummary, ProcessorParams } from './types'
import { accessibilityElements, accessibilityIssues, missingAltImages } from '../data/history/schema'

interface A11yIssue {
  auditId: string
  title: string
  severity: string
  wcagCriteria: string[]
  instances: number
  pages: Set<string>
}

interface ElementIssue {
  selector: string
  snippet?: string
  auditId: string
  severity: string
  pages: Set<string>
  foreground?: string
  background?: string
  ratio?: number
  required?: number
  boundingRect?: { left: number, top: number, width: number, height: number }
  screenshotPage?: string
}

const SEVERITY_MAP: Record<string, string> = {
  'image-alt': 'critical',
  'label': 'critical',
  'button-name': 'critical',
  'link-name': 'critical',
  'color-contrast': 'serious',
  'html-has-lang': 'serious',
  'document-title': 'serious',
  'meta-viewport': 'serious',
  'heading-order': 'moderate',
  'tabindex': 'moderate',
  'duplicate-id-aria': 'minor',
  'aria-allowed-attr': 'moderate',
  'aria-hidden-focus': 'serious',
  'aria-required-attr': 'critical',
  'aria-valid-attr-value': 'serious',
  'aria-valid-attr': 'serious',
}

const WCAG_MAP: Record<string, string[]> = {
  'image-alt': ['1.1.1'],
  'color-contrast': ['1.4.3'],
  'label': ['1.3.1', '4.1.2'],
  'html-has-lang': ['3.1.1'],
  'document-title': ['2.4.2'],
  'link-name': ['2.4.4', '4.1.2'],
  'button-name': ['4.1.2'],
  'meta-viewport': ['1.4.4'],
  'heading-order': ['1.3.1'],
}

const WCAG_LEVELS: Record<string, string> = {
  '1.1.1': 'A',
  '1.3.1': 'A',
  '1.4.3': 'AA',
  '1.4.4': 'AA',
  '2.4.2': 'A',
  '2.4.4': 'A',
  '3.1.1': 'A',
  '4.1.2': 'A',
}

function getWcagLevel(criteria: string[]): string {
  const levels = criteria.map(c => WCAG_LEVELS[c] ?? 'A')
  if (levels.includes('AAA'))
    return 'AAA'
  if (levels.includes('AA'))
    return 'AA'
  return 'A'
}

function isLikelyDecorative(url: string): boolean {
  return /icon|arrow|chevron|bullet|decoration|spacer|divider/i.test(url)
}

export async function processAccessibility(p: ProcessorParams): Promise<AccessibilitySummary> {
  const { db, scanId, routes } = p

  // 1. Aggregate issues by audit type
  const issueMap = new Map<string, A11yIssue>()

  for (const [path, route] of routes) {
    for (const [auditId, audit] of Object.entries(route.audits)) {
      if (!SEVERITY_MAP[auditId])
        continue
      if (audit.score === 1)
        continue // passing

      const items = audit.details?.items ?? []
      const existing = issueMap.get(auditId) ?? {
        auditId,
        title: audit.title ?? auditId,
        severity: SEVERITY_MAP[auditId],
        wcagCriteria: WCAG_MAP[auditId] ?? [],
        instances: 0,
        pages: new Set<string>(),
      }
      existing.instances += items.length || 1
      existing.pages.add(path)
      issueMap.set(auditId, existing)
    }
  }

  const issueValues = [...issueMap.values()].map(issue => ({
    scanId,
    auditId: issue.auditId,
    title: issue.title,
    severity: issue.severity,
    wcagCriteria: JSON.stringify(issue.wcagCriteria),
    wcagLevel: getWcagLevel(issue.wcagCriteria),
    instanceCount: issue.instances,
    pageCount: issue.pages.size,
    pages: JSON.stringify([...issue.pages]),
  }))

  if (issueValues.length > 0) {
    db.insert(accessibilityIssues).values(issueValues).run()
  }

  // 2. Deduplicate elements (find systemic issues)
  const elementMap = new Map<string, ElementIssue>()

  for (const [path, route] of routes) {
    for (const [auditId, audit] of Object.entries(route.audits)) {
      if (!SEVERITY_MAP[auditId] || audit.score === 1)
        continue

      const items = audit.details?.items ?? []
      for (const item of items) {
        const selector = item.node?.selector
        if (!selector)
          continue

        const key = `${auditId}:${selector}`
        const existing: ElementIssue = elementMap.get(key) ?? {
          selector,
          snippet: item.node?.snippet,
          auditId,
          severity: SEVERITY_MAP[auditId],
          pages: new Set<string>(),
          foreground: item.foregroundColor,
          background: item.backgroundColor,
          ratio: item.contrastRatio,
          required: item.expectedContrastRatio,
        }
        existing.pages.add(path)
        // Capture bounding rect from fullPageScreenshot nodes on first occurrence
        if (!existing.boundingRect && item.node?.lhId && route.screenshotNodes?.[item.node.lhId]) {
          existing.boundingRect = route.screenshotNodes[item.node.lhId]
          existing.screenshotPage = path
        }
        elementMap.set(key, existing)
      }
    }
  }

  // Only store elements appearing on 2+ pages (systemic issues)
  const systemicElements = [...elementMap.values()]
    .filter(el => el.pages.size > 1)
    .map(el => ({
      scanId,
      selector: el.selector,
      snippet: el.snippet,
      auditId: el.auditId,
      severity: el.severity,
      foregroundColor: el.foreground,
      backgroundColor: el.background,
      contrastRatio: el.ratio,
      requiredRatio: el.required,
      boundingRect: el.boundingRect ? JSON.stringify(el.boundingRect) : null,
      screenshotPage: el.screenshotPage ?? null,
      pageCount: el.pages.size,
      pages: JSON.stringify([...el.pages]),
    }))

  if (systemicElements.length > 0) {
    db.insert(accessibilityElements).values(systemicElements).run()
  }

  // 3. Missing alt images
  const altImages = new Map<string, { url: string, pages: Set<string> }>()
  for (const [path, route] of routes) {
    const items = route.audits['image-alt']?.details?.items ?? []
    for (const item of items) {
      const snippet = item.node?.snippet ?? ''
      // Try double-quoted, single-quoted, then unquoted src
      const url = snippet.match(/src=["']([^"']+)["']/)?.[1]
        ?? snippet.match(/src=([^\s>]+)/)?.[1]
      if (!url || url.startsWith('data:'))
        continue
      const existing = altImages.get(url) ?? { url, pages: new Set() }
      existing.pages.add(path)
      altImages.set(url, existing)
    }
  }

  const altImageValues = [...altImages.values()].map(img => ({
    scanId,
    url: img.url,
    thumbnail: img.url,
    isDecorative: isLikelyDecorative(img.url),
    pageCount: img.pages.size,
    pages: JSON.stringify([...img.pages]),
  }))

  if (altImageValues.length > 0) {
    db.insert(missingAltImages).values(altImageValues).run()
  }

  return computeAccessibilitySummary(issueMap, elementMap, altImages)
}

function computeAccessibilitySummary(issueMap: Map<string, A11yIssue>, elementMap: Map<string, ElementIssue>, altImages: Map<string, any>): AccessibilitySummary {
  const issues = [...issueMap.values()]

  const countBySeverity = (sev: string) =>
    issues.filter(i => i.severity === sev).length

  const totalInstances = issues.reduce((acc, i) => acc + i.instances, 0)

  const wcagA = issues.filter(i =>
    i.wcagCriteria.some(c => WCAG_LEVELS[c] === 'A'),
  ).length
  const wcagAA = issues.filter(i =>
    i.wcagCriteria.some(c => WCAG_LEVELS[c] === 'AA'),
  ).length

  const contrastIssues = [...elementMap.values()].filter(
    el => el.auditId === 'color-contrast',
  ).length

  return {
    criticalCount: countBySeverity('critical'),
    seriousCount: countBySeverity('serious'),
    moderateCount: countBySeverity('moderate'),
    minorCount: countBySeverity('minor'),
    totalIssues: issues.length,
    totalInstances,
    wcagLevelA: wcagA,
    wcagLevelAA: wcagAA,
    missingAltCount: altImages.size,
    contrastIssueCount: contrastIssues,
  }
}
